import type { PagesFunction } from '@cloudflare/workers-types';
import { dispatchFunnelEvent } from './_agent-dispatch';
import { sendCustomerEmail } from './_email';

interface Env {
  REVISE_DISCORD_WEBHOOK_URL?: string;
  DISCORD_WEBHOOK_URL?: string;
  AGENT_WEBHOOK_URL?: string;
  AGENT_GITHUB_TOKEN?: string;
  AGENT_REPO?: string;
  AGENT_WORKFLOW_ID?: string;
  AGENT_REF?: string;
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;
  REVISION_ALLOW_DRY_RUN?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as Record<string, unknown>;
    const orderId = String(body.order_id || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const requestedChanges = String(body.requested_changes || '').trim();

    if (!orderId || !email || !requestedChanges) {
      return json({ error: 'Order ID, checkout email, and requested changes are required.' }, 400);
    }
    const dryRun = context.env.REVISION_ALLOW_DRY_RUN === 'true' && String(body.dry_run || '').toLowerCase() === 'true';

    const payload = {
      id: `rev_${Date.now()}`,
      source: 'first_party_revision_form',
      fields: {
        order_id: orderId,
        email,
        requested_changes: requestedChanges,
        reference_url: String(body.reference_url || ''),
        attachment_summary: formatAttachmentSummary(body.attachments, body.attachment_summary),
        client_slug: String(body.client_slug || ''),
        repo: String(body.repo || ''),
        template: String(body.template || 'webjuice-restaurant'),
        preview_url: String(body.preview_url || ''),
      },
    };

    const webhookUrl = context.env.REVISE_DISCORD_WEBHOOK_URL || context.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) context.waitUntil(sendJson(webhookUrl, buildDiscordPayload(payload.fields)));
    context.waitUntil(sendCustomerEmail(context.env, buildRevisionReceivedEmail(payload.fields)));
    context.waitUntil(dispatchFunnelEvent(context.env, { provider: 'tally', payload, dryRun }));

    return json({ success: true, clientSlug: payload.fields.client_slug, repo: payload.fields.repo });
  } catch (error) {
    console.error('Revision request error', error);
    return json({ error: 'Internal error' }, 500);
  }
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  return onRequestPost(context);
};

function buildDiscordPayload(fields: Record<string, string>) {
  return {
    username: 'ProfitsLocal Revisions',
    embeds: [{
      title: `Revision request: ${fields.client_slug || fields.repo || 'unknown client'}`,
      color: 0xf1c40f,
      fields: [
        field('Client', fields.client_slug, true),
        field('Repo', fields.repo, true),
        field('Order ID', fields.order_id, false),
        field('Email', fields.email, true),
        field('Preview', fields.preview_url, false),
        field('Reference', fields.reference_url, false),
        field('Attachments', fields.attachment_summary, false, 950),
        field('Requested changes', fields.requested_changes, false, 950),
      ].filter(Boolean),
      timestamp: new Date().toISOString(),
    }],
  };
}

function buildRevisionReceivedEmail(fields: Record<string, string>) {
  return {
    to: fields.email,
    subject: 'Revision request received',
    text: [
      'We received your revision request.',
      '',
      `Order ID: ${fields.order_id}`,
      `Preview: ${fields.preview_url || 'N/A'}`,
      `Attachments: ${fields.attachment_summary || 'None'}`,
      '',
      'Next, we match your Order ID and checkout email against your active order. If revision quota remains, a dev preview task will be created.',
    ].join('\n'),
    html: `<p>We received your revision request.</p><ul><li>Order ID: ${escapeHtml(fields.order_id)}</li><li>Preview: ${escapeHtml(fields.preview_url || 'N/A')}</li><li>Attachments: ${escapeHtml(fields.attachment_summary || 'None')}</li></ul><p>Next, we match your Order ID and checkout email against your active order. If revision quota remains, a dev preview task will be created.</p>`,
  };
}

function formatAttachmentSummary(attachments: unknown, fallback: unknown) {
  if (typeof fallback === 'string' && fallback.trim()) return fallback.trim();
  if (!Array.isArray(attachments)) return '';
  return attachments
    .map((file, index) => {
      if (!file || typeof file !== 'object') return '';
      const item = file as { name?: string; type?: string; size?: number };
      const name = String(item.name || '').trim();
      if (!name) return '';
      const type = String(item.type || 'file').trim();
      const size = Number(item.size || 0);
      return `${index + 1}. ${name} (${type}, ${formatBytes(size)})`;
    })
    .filter(Boolean)
    .join('\n');
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function field(name: string, value: string, inline = false, limit = 250) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === 'unknown') return null;
  return {
    name,
    value: normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized,
    inline,
  };
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
