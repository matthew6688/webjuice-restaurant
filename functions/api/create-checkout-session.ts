import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ONE_TIME?: string;
  STRIPE_PRICE_YEARLY?: string;
  SALES_DISCORD_WEBHOOK_URL?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as Record<string, string>;
    const tier = body.tier === 'yearly_maintenance' ? 'yearly_maintenance' : 'one_time';
    const priceId = tier === 'yearly_maintenance'
      ? context.env.STRIPE_PRICE_YEARLY
      : context.env.STRIPE_PRICE_ONE_TIME;

    if (!context.env.STRIPE_SECRET_KEY || !priceId) {
      return json({ error: 'Stripe is not configured for this preview.' }, 503);
    }

    const origin = new URL(context.request.url).origin;
    const metadata = {
      client_slug: body.client_slug || '',
      repo: body.repo || '',
      template: body.template || 'webjuice-restaurant',
      preview_url: body.preview_url || origin,
      tier,
      email: body.email || '',
      business_name: body.business_name || '',
      preferred_domain: body.preferred_domain || '',
      launch_notes: body.launch_notes || '',
    };

    const params = new URLSearchParams();
    params.set('mode', tier === 'yearly_maintenance' ? 'subscription' : 'payment');
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', '1');
    params.set('customer_email', body.email || '');
    params.set('client_reference_id', metadata.client_slug);
    params.set('success_url', `${origin}/thank-you?session_id={CHECKOUT_SESSION_ID}&client_slug=${encodeURIComponent(metadata.client_slug)}&repo=${encodeURIComponent(metadata.repo)}&preview_url=${encodeURIComponent(metadata.preview_url)}&tier=${encodeURIComponent(tier)}&domain=${encodeURIComponent(metadata.preferred_domain)}&email=${encodeURIComponent(metadata.email)}`);
    params.set('cancel_url', `${origin}/checkout?tier=${encodeURIComponent(tier)}&client_slug=${encodeURIComponent(metadata.client_slug)}&repo=${encodeURIComponent(metadata.repo)}&preview_url=${encodeURIComponent(metadata.preview_url)}`);
    params.set('allow_promotion_codes', 'true');

    for (const [key, value] of Object.entries(metadata)) {
      if (value) params.set(`metadata[${key}]`, value);
      if (value && tier === 'one_time') params.set(`payment_intent_data[metadata][${key}]`, value);
      if (value && tier === 'yearly_maintenance') params.set(`subscription_data[metadata][${key}]`, value);
    }

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    const data = await response.json() as { url?: string; error?: { message?: string } };
    if (!response.ok || !data.url) {
      return json({ error: data.error?.message || 'Stripe checkout failed.' }, 502);
    }

    if (context.env.SALES_DISCORD_WEBHOOK_URL) {
      context.waitUntil(sendCheckoutStarted(context.env.SALES_DISCORD_WEBHOOK_URL, metadata));
    }

    return json({ url: data.url });
  } catch (error) {
    console.error('Stripe checkout error', error);
    return json({ error: 'Internal error' }, 500);
  }
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  return onRequestPost(context);
};

async function sendCheckoutStarted(url: string, metadata: Record<string, string>) {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'ProfitsLocal Checkout',
      embeds: [{
        title: `Checkout started: ${metadata.business_name || metadata.client_slug}`,
        color: 0x3498db,
        fields: [
          { name: 'Client', value: metadata.client_slug || 'unknown', inline: true },
          { name: 'Repo', value: metadata.repo || 'unknown', inline: true },
          { name: 'Tier', value: metadata.tier || 'unknown', inline: true },
          { name: 'Email', value: metadata.email || 'unknown', inline: true },
          { name: 'Domain', value: metadata.preferred_domain || 'none', inline: true },
          { name: 'Preview', value: metadata.preview_url || 'none', inline: false },
        ],
        timestamp: new Date().toISOString(),
      }],
    }),
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
