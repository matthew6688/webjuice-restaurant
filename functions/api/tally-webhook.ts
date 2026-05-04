import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  SALES_DISCORD_WEBHOOK_URL?: string;
  REVISE_DISCORD_WEBHOOK_URL?: string;
  DISCORD_WEBHOOK_URL?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const payload = await context.request.json();
    const fields = payload.data?.fields || payload.fields || {};
    const answers = payload.data?.answers || payload.answers || {};
    const combined = { ...fields, ...answers };
    const order = normalizeSubmission(payload, combined);
    const kind = classify(order);
    const webhookUrl = kind === 'sale'
      ? context.env.SALES_DISCORD_WEBHOOK_URL || context.env.DISCORD_WEBHOOK_URL
      : context.env.REVISE_DISCORD_WEBHOOK_URL || context.env.DISCORD_WEBHOOK_URL;

    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDiscordPayload(kind, order)),
      });
    }

    return json({ success: true, kind, repo: order.repo, clientSlug: order.clientSlug, orderId: order.orderId });
  } catch (error) {
    console.error('Tally webhook error', error);
    return json({ success: false, error: 'Internal error' }, 500);
  }
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  return onRequestPost(context);
};

function normalizeSubmission(payload: any, answers: any) {
  const repo = extractField(answers, 'repo') || 'unknown';
  const clientSlug = extractField(answers, 'client_slug') || repo.split('/').pop() || 'unknown';
  const tier = extractField(answers, 'tier') || extractField(answers, 'package') || '';
  const amount = extractField(answers, 'amount') || extractField(answers, 'payment_amount') || '';
  return {
    orderId: extractField(answers, 'tally_order_id') || payload.id || payload.data?.submissionId || 'unknown',
    clientSlug,
    repo,
    template: extractField(answers, 'template') || 'webjuice-restaurant',
    previewUrl: extractField(answers, 'preview_url') || '',
    company: extractField(answers, 'business_name') || extractField(answers, 'company') || clientSlug,
    email: extractField(answers, 'email') || 'N/A',
    phone: extractField(answers, 'phone') || '',
    tier,
    amount,
    currency: extractField(answers, 'currency') || 'USD',
    domain: extractField(answers, 'preferred_domain') || extractField(answers, 'domain') || '',
    feedback: extractField(answers, 'feedback') || extractField(answers, 'requested_changes') || extractField(answers, 'launch_notes') || '',
    referenceUrl: extractField(answers, 'reference_url') || '',
    files: extractFiles(answers),
  };
}

function classify(order: any) {
  if (order.tier || order.amount) return 'sale';
  return 'revision';
}

function buildDiscordPayload(kind: string, order: any) {
  const isSale = kind === 'sale';
  return {
    username: isSale ? 'ProfitsLocal Sales' : 'ProfitsLocal Revisions',
    embeds: [{
      title: isSale ? `New sale: ${order.company}` : `Revision request: ${order.company}`,
      color: isSale ? 0x2ecc71 : 0xf1c40f,
      fields: compact([
        field('Client', order.clientSlug, true),
        field('Repo', order.repo, true),
        field('Tier', order.tier, true),
        field('Amount', order.amount ? `${order.currency} ${order.amount}` : '', true),
        field('Email', order.email, true),
        field('Phone', order.phone, true),
        field('Domain', order.domain, true),
        field('Preview', order.previewUrl, false),
        field('Reference', order.referenceUrl, false),
        field('Feedback', order.feedback, false, 950),
        field('Files', order.files.join('\n'), false, 950),
      ]),
      timestamp: new Date().toISOString(),
    }],
  };
}

function field(name: string, value: string, inline = false, limit = 250) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === 'N/A' || normalized === 'unknown') return null;
  return {
    name,
    value: normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized,
    inline,
  };
}

function compact(values: any[]) {
  return values.filter(Boolean).slice(0, 25);
}

function extractField(answers: any, fieldId: string): string {
  if (!answers) return '';
  const needle = fieldId.toLowerCase();
  for (const key of Object.keys(answers)) {
    if (!key.toLowerCase().includes(needle)) continue;
    const value = answers[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (value?.value !== undefined) return String(value.value);
    if (value?.text !== undefined) return String(value.text);
    if (value?.label !== undefined) return String(value.label);
  }
  return '';
}

function extractFiles(answers: any): string[] {
  const files: string[] = [];
  if (!answers) return files;
  for (const key of Object.keys(answers)) {
    const value = answers[key];
    if (Array.isArray(value)) value.forEach((file) => file?.url && files.push(file.url));
    if (value?.url) files.push(value.url);
    if (value?.value?.url) files.push(value.value.url);
  }
  return files;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
