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
    const clientSlug = safeId(body.client_slug || body.clientSlug || '');
    const requestId = safeId(body.request_id || body.requestId || '');
    if (!clientSlug || !requestId) return json({ error: 'Client and request ID are required.' }, 400);
    if (!context.env.AGENT_GITHUB_TOKEN) return json({ error: 'Domain status is not configured yet.' }, 503);

    const github = {
      repo: context.env.AGENT_REPO || DEFAULT_AGENT_REPO,
      ref: context.env.AGENT_REF || 'main',
      token: context.env.AGENT_GITHUB_TOKEN,
    };
    const requestPath = `data/domain/requests/${safeId(clientSlug)}/${safeId(requestId)}.json`;
    const request = await readGithubJson(github, requestPath);
    if (!request) return json({ ok: true, status: 'queued', requestId });

    return json({
      ok: true,
      requestId,
      status: request.status || 'unknown',
      domain: request.domain || '',
      target: request.target || '',
      route: request.route || null,
      dns: request.dns || null,
      pages: request.pages || null,
      steps: request.steps || [],
      updatedAt: request.updatedAt || '',
    });
  } catch (error) {
    console.error('Domain status error', error);
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
  if (!response.ok) throw new Error(`GitHub content read failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json() as { content?: string; encoding?: string };
  if (payload.encoding !== 'base64' || !payload.content) return null;
  return JSON.parse(atob(payload.content.replace(/\s/g, '')));
}

function encodePath(filePath: string) {
  return filePath.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function safeId(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
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
