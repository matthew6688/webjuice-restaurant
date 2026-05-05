import type { PagesFunction } from '@cloudflare/workers-types';
import { dispatchFunnelEvent } from './_agent-dispatch';
import { sendCustomerEmail } from './_email';

interface Env {
  STRIPE_WEBHOOK_SECRET?: string;
  SALES_DISCORD_WEBHOOK_URL?: string;
  AGENT_WEBHOOK_URL?: string;
  AGENT_GITHUB_TOKEN?: string;
  AGENT_REPO?: string;
  AGENT_WORKFLOW_ID?: string;
  AGENT_REF?: string;
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const signature = context.request.headers.get('stripe-signature') || '';
  const rawBody = await context.request.text();

  if (!context.env.STRIPE_WEBHOOK_SECRET) {
    return json({ error: 'Stripe webhook is not configured.' }, 503);
  }

  const verified = await verifyStripeSignature(rawBody, signature, context.env.STRIPE_WEBHOOK_SECRET);
  if (!verified) return json({ error: 'Invalid signature.' }, 400);

  const event = JSON.parse(rawBody);
  if (event.type !== 'checkout.session.completed') {
    return json({ received: true, ignored: event.type });
  }

  const order = normalizeCheckoutSession(event);
  const discordPayload = buildDiscordPayload(order);

  if (context.env.SALES_DISCORD_WEBHOOK_URL) {
    context.waitUntil(sendJson(context.env.SALES_DISCORD_WEBHOOK_URL, discordPayload));
  }
  if (order.email !== 'N/A') {
    context.waitUntil(sendCustomerEmail(context.env, buildPaymentEmail(order)));
  }
  context.waitUntil(dispatchFunnelEvent(context.env, { provider: 'stripe', payload: event }));

  return json({ received: true, orderId: order.orderId, clientSlug: order.clientSlug, repo: order.repo });
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  return onRequestPost(context);
};

async function verifyStripeSignature(rawBody: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(',').map((part) => {
    const [key, value] = part.split('=');
    return [key, value];
  }));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  return timingSafeEqual(hex(digest), signature);
}

function buildPaymentEmail(order: ReturnType<typeof normalizeCheckoutSession>) {
  const revisionUrl = order.previewUrl
    ? `${trimTrailingSlash(order.previewUrl)}/revise?order_id=${encodeURIComponent(order.orderId)}&email=${encodeURIComponent(order.email)}`
    : '';
  const lines = [
    `Order ID: ${order.orderId}`,
    `Package: ${order.tier}`,
    `Amount: ${order.currency} ${order.amount}`,
    `Preview: ${order.previewUrl || 'N/A'}`,
    `Revision request form: ${revisionUrl || 'N/A'}`,
  ];
  return {
    to: order.email,
    subject: `Payment received for ${order.company}`,
    text: [
      'Thanks for your payment. We received your website order.',
      '',
      ...lines,
      '',
      'Keep your Order ID. Future revision requests must match this Order ID and the checkout email.',
    ].join('\n'),
    html: `<p>Thanks for your payment. We received your website order.</p><ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul><p>Keep your Order ID. Future revision requests must match this Order ID and the checkout email.</p>`,
  };
}

function normalizeCheckoutSession(event: any) {
  const session = event.data?.object || {};
  const metadata = session.metadata || {};
  const repo = metadata.repo || 'unknown';
  const clientSlug = metadata.client_slug || repo.split('/').pop() || 'unknown';
  return {
    orderId: session.id || event.id || 'unknown',
    clientSlug,
    repo,
    template: metadata.template || 'webjuice-restaurant',
    previewUrl: metadata.preview_url || '',
    company: metadata.business_name || clientSlug,
    email: session.customer_details?.email || session.customer_email || metadata.email || 'N/A',
    tier: metadata.tier || (session.mode === 'subscription' ? 'yearly_maintenance' : 'one_time'),
    amount: Number(session.amount_total || 0) / 100,
    currency: String(session.currency || 'usd').toUpperCase(),
    domain: metadata.preferred_domain || '',
    feedback: metadata.launch_notes || '',
  };
}

function buildDiscordPayload(order: ReturnType<typeof normalizeCheckoutSession>) {
  return {
    username: 'ProfitsLocal Sales',
    embeds: [{
      title: `Paid checkout: ${order.company}`,
      color: 0x2ecc71,
      fields: [
        field('Client', order.clientSlug, true),
        field('Repo', order.repo, true),
        field('Tier', order.tier, true),
        field('Amount', `${order.currency} ${order.amount}`, true),
        field('Email', order.email, true),
        field('Domain', order.domain, true),
        field('Preview', order.previewUrl, false),
        field('Launch notes', order.feedback, false),
      ].filter(Boolean),
      timestamp: new Date().toISOString(),
    }],
  };
}

function field(name: string, value: string, inline = false) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === 'N/A' || normalized === 'unknown') return null;
  return { name, value: normalized.slice(0, 1000), inline };
}

async function sendJson(url: string, body: unknown) {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));
}

function trimTrailingSlash(value: string) {
  return String(value || '').replace(/\/+$/, '');
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
