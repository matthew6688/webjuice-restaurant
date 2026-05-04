interface AgentDispatchEnv {
  AGENT_WEBHOOK_URL?: string;
  AGENT_GITHUB_TOKEN?: string;
  AGENT_REPO?: string;
  AGENT_WORKFLOW_ID?: string;
  AGENT_REF?: string;
}

interface DispatchInput {
  provider: 'stripe' | 'tally' | 'auto';
  payload: unknown;
  sendDiscord?: boolean;
  sendEmail?: boolean;
  dryRun?: boolean;
}

const DEFAULT_AGENT_REPO = 'matthew6688/webjuice-stack-mvp';
const DEFAULT_AGENT_WORKFLOW_ID = 'route-funnel-event.yml';

export async function dispatchFunnelEvent(env: AgentDispatchEnv, input: DispatchInput) {
  if (env.AGENT_WEBHOOK_URL) {
    return postJson(env.AGENT_WEBHOOK_URL, input);
  }

  if (!env.AGENT_GITHUB_TOKEN) return { ok: false, skipped: true, reason: 'agent_dispatch_not_configured' };

  const repo = env.AGENT_REPO || DEFAULT_AGENT_REPO;
  const workflowId = env.AGENT_WORKFLOW_ID || DEFAULT_AGENT_WORKFLOW_ID;
  const ref = env.AGENT_REF || 'main';
  const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.AGENT_GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'profitslocal-pages-function',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      ref,
      inputs: {
        provider: input.provider,
        payload: JSON.stringify(input.payload),
        send_discord: String(input.sendDiscord ?? true),
        send_email: String(input.sendEmail ?? true),
        dry_run: String(input.dryRun ?? false),
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Agent workflow dispatch failed (${response.status}): ${text.slice(0, 500)}`);
  }

  return { ok: true, provider: 'github_actions', repo, workflowId, ref };
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Agent webhook failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }
  return { ok: true, provider: 'webhook' };
}
