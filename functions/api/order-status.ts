import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  AGENT_GITHUB_TOKEN?: string;
  AGENT_REPO?: string;
  AGENT_REF?: string;
}

const DEFAULT_AGENT_REPO = 'matthew6688/webjuice-stack-mvp';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as Record<string, string>;
    const orderId = String(body.order_id || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const clientSlug = String(body.client_slug || '').trim();
    const repo = String(body.repo || '').trim();

    if (!orderId || !email || !clientSlug) {
      return json({ error: 'Order ID, checkout email, and client are required.' }, 400);
    }
    if (!context.env.AGENT_GITHUB_TOKEN) {
      return json({ error: 'Order status is not configured yet.' }, 503);
    }

    const github = {
      repo: context.env.AGENT_REPO || DEFAULT_AGENT_REPO,
      ref: context.env.AGENT_REF || 'main',
      token: context.env.AGENT_GITHUB_TOKEN,
    };
    const entitlementPath = `data/funnel/orders/${safeId(clientSlug)}/${safeId(orderId)}.json`;
    const entitlement = await readGithubJson(github, entitlementPath);
    if (!entitlement) return json({ error: 'No matching active order was found.' }, 404);
    if (String(entitlement.status || '') !== 'active') return json({ error: 'No matching active order was found.' }, 404);
    if (normalizeEmail(entitlement.customer?.email) !== email) return json({ error: 'No matching active order was found.' }, 404);
    if (repo && entitlement.repo && String(entitlement.repo) !== repo) {
      return json({ error: 'No matching active order was found.' }, 404);
    }

    const casePath = `data/cases/${safeId(clientSlug)}/${safeId(orderId)}/case.json`;
    const caseFile = await readGithubJson(github, casePath);
    const policy = entitlement.revisionPolicy || {};
    const used = Number(entitlement.revisionUsed || 0);
    const limit = Number(policy.limit || 0);
    const remaining = Math.max(limit - used, 0);

    return json({
      ok: true,
      order: {
        id: entitlement.orderId,
        tier: entitlement.tier,
        status: entitlement.status,
        provider: entitlement.provider || '',
      },
      revision: {
        policyType: policy.type || '',
        limit,
        used,
        remaining,
        periodEnd: policy.type === 'monthly' ? policy.periodEnd || '' : '',
        description: policy.description || '',
      },
      case: caseFile ? {
        status: caseFile.status || '',
        previewUrl: caseFile.previewUrl || entitlement.previewUrl || '',
        liveUrl: caseFile.customer?.domain || '',
        latestTask: caseFile.latestTask || null,
      } : null,
      links: {
        extraRevision: `/checkout?tier=extra_revision&order_id=${encodeURIComponent(orderId)}&email=${encodeURIComponent(email)}`,
      },
    });
  } catch (error) {
    console.error('Order status error', error);
    return json({ error: 'Internal error' }, 500);
  }
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  return onRequestPost(context);
};

async function readGithubJson(github: { repo: string; ref: string; token: string }, filePath: string) {
  const url = `https://api.github.com/repos/${github.repo}/contents/${encodePath(filePath)}?ref=${encodeURIComponent(github.ref)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${github.token}`,
      'User-Agent': 'profitslocal-pages-function',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub content read failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const payload = await response.json() as { content?: string; encoding?: string };
  if (payload.encoding !== 'base64' || !payload.content) return null;
  return JSON.parse(atob(payload.content.replace(/\s/g, '')));
}

function encodePath(filePath: string) {
  return filePath.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function safeId(value: string) {
  return String(value || 'unknown')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'unknown';
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
