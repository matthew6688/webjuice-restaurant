import type { PagesFunction } from '@cloudflare/workers-types';
import { dispatchWorkflow } from './_agent-dispatch';

interface Env {
  APPROVAL_DISCORD_WEBHOOK_URL?: string;
  SALES_DISCORD_WEBHOOK_URL?: string;
  AGENT_WEBHOOK_URL?: string;
  AGENT_GITHUB_TOKEN?: string;
  AGENT_REPO?: string;
  AGENT_REF?: string;
  APPROVAL_ALLOW_DRY_RUN?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as Record<string, string>;
    const orderId = String(body.order_id || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const clientSlug = String(body.client_slug || '').trim();
    const repo = String(body.repo || '').trim();

    if (!orderId || !email || !clientSlug || !repo) {
      return json({ error: 'Order ID, checkout email, client, and repo are required.' }, 400);
    }
    const dryRun = context.env.APPROVAL_ALLOW_DRY_RUN === 'true' && String(body.dry_run || '').toLowerCase() === 'true';

    const inputs = {
      client_slug: clientSlug,
      order_id: orderId,
      email,
      task_path: String(body.task_path || ''),
      push: 'true',
      check_deploy: 'true',
      send_email: 'true',
      send_discord: 'true',
      dry_run: String(dryRun),
    };

    const webhookUrl = context.env.APPROVAL_DISCORD_WEBHOOK_URL || context.env.SALES_DISCORD_WEBHOOK_URL;
    if (webhookUrl) context.waitUntil(sendJson(webhookUrl, buildDiscordPayload({ ...inputs, repo })));
    context.waitUntil(dispatchWorkflow(context.env, 'publish-approved.yml', inputs, {
      provider: 'approval',
      fields: { ...inputs, repo },
    }));

    return json({ success: true, clientSlug, repo });
  } catch (error) {
    console.error('Approval request error', error);
    return json({ error: 'Internal error' }, 500);
  }
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  return onRequestPost(context);
};

function buildDiscordPayload(fields: Record<string, string>) {
  return {
    username: 'ProfitsLocal Approvals',
    embeds: [{
      title: `Approval received: ${fields.client_slug}`,
      color: 0x2ecc71,
      fields: [
        field('Client', fields.client_slug, true),
        field('Repo', fields.repo, true),
        field('Order ID', fields.order_id, false),
        field('Email', fields.email, true),
      ].filter(Boolean),
      timestamp: new Date().toISOString(),
    }],
  };
}

function field(name: string, value: string, inline = false) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
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
