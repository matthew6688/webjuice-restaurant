import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  DISCORD_WEBHOOK_URL?: string;
}

/**
 * Tally.so webhook handler
 * Receives form submissions and forwards to Discord
 *
 * Tally webhook setup:
 * 1. Go to your Tally form → Integrations → Webhooks
 * 2. Add endpoint: https://your-site.com/api/tally-webhook
 * 3. Form must include hidden fields: repo, template, tally_order_id
 */

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const payload = await context.request.json();

    // Extract key fields from Tally payload
    const fields = payload.data?.fields || payload.fields || {};
    const answers = payload.data?.answers || payload.answers || {};

    // Hidden fields (passed via URL params)
    const repo = extractField(answers, 'repo') || extractField(fields, 'repo') || 'unknown';
    const template = extractField(answers, 'template') || extractField(fields, 'template') || 'unknown';
    const orderId = extractField(answers, 'tally_order_id') || payload.id || 'unknown';

    // Customer info
    const company = extractField(answers, 'company_name') || extractField(answers, 'company') || 'N/A';
    const email = extractField(answers, 'email') || 'N/A';
    const tier = extractField(answers, 'tier') || extractField(answers, 'package') || 'N/A';
    const color = extractField(answers, 'brand_color') || 'N/A';
    const feedback = extractField(answers, 'feedback') || extractField(answers, 'modifications') || '';
    const referenceUrl = extractField(answers, 'reference_url') || '';

    // File uploads (Tally provides URLs)
    const files = extractFiles(answers);

    // Build Discord message
    const discordPayload = {
      username: 'WebJuice Orders',
      embeds: [{
        title: `🚀 New Order: ${company}`,
        color: 0x00ff00,
        fields: [
          { name: 'Repo', value: repo, inline: true },
          { name: 'Template', value: template, inline: true },
          { name: 'Order ID', value: orderId, inline: true },
          { name: 'Tier', value: tier, inline: true },
          { name: 'Email', value: email, inline: true },
          { name: 'Brand Color', value: color, inline: true },
          { name: 'Reference', value: referenceUrl || 'None', inline: false },
          { name: 'Feedback', value: feedback.slice(0, 1000) || 'None', inline: false },
          { name: 'Files', value: files.length > 0 ? files.join('\n') : 'None', inline: false },
        ],
        timestamp: new Date().toISOString(),
      }],
    };

    // Send to Discord if webhook configured
    if (context.env.DISCORD_WEBHOOK_URL) {
      await fetch(context.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload),
      });
    }

    return new Response(JSON.stringify({ success: true, repo, orderId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

function extractField(answers: any, fieldId: string): string {
  if (!answers) return '';
  // Tally fields can be referenced by ID or label
  for (const key of Object.keys(answers)) {
    if (key.toLowerCase().includes(fieldId.toLowerCase())) {
      const val = answers[key];
      if (typeof val === 'string') return val;
      if (val?.value) return String(val.value);
      if (val?.text) return String(val.text);
    }
  }
  return '';
}

function extractFiles(answers: any): string[] {
  const files: string[] = [];
  if (!answers) return files;

  for (const key of Object.keys(answers)) {
    const val = answers[key];
    if (val && typeof val === 'object') {
      // Tally file upload format varies
      if (val.url) files.push(val.url);
      if (val.value && val.value.url) files.push(val.value.url);
      if (Array.isArray(val)) {
        val.forEach((f: any) => {
          if (f.url) files.push(f.url);
        });
      }
    }
  }
  return files;
}

export const onRequest: PagesFunction = async (context) => {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return onRequestPost(context);
};
