#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-request-smoke-'));
const source = fs.readFileSync(new URL('../functions/api/approval-request.ts', import.meta.url), 'utf8')
  .replace("from './_agent-dispatch'", "from './_agent-dispatch.ts'");
fs.writeFileSync(path.join(tempDir, 'approval-request.ts'), source);
fs.copyFileSync(
  new URL('../functions/api/_agent-dispatch.ts', import.meta.url),
  path.join(tempDir, '_agent-dispatch.ts'),
);
const { onRequestPost } = await import(pathToFileURL(path.join(tempDir, 'approval-request.ts')).href);

const dispatches = [];
const discordMessages = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const body = options.body ? JSON.parse(options.body) : null;
  if (String(url).includes('api.github.com')) {
    dispatches.push({ url: String(url), body });
    return new Response(null, { status: 204 });
  }
  if (String(url).includes('discord.test')) {
    discordMessages.push({ url: String(url), body });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  return originalFetch(url, options);
};

const waits = [];
const requestBody = {
  order_id: 'cs_test_approval_endpoint_001',
  email: 'Owner@Example.com',
  client_slug: 'opa-bar-mezze-restaurant',
  repo: 'matthew6688/opa-bar-mezze-restaurant',
  dry_run: 'true',
};
const response = await onRequestPost({
  request: new Request('https://opa-bar-mezze-restaurant-dev.pages.dev/api/approval-request/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  }),
  env: {
    APPROVAL_DISCORD_WEBHOOK_URL: 'https://discord.test/approval',
    AGENT_GITHUB_TOKEN: 'gh_test_token',
    AGENT_REPO: 'matthew6688/webjuice-stack-mvp',
    AGENT_REF: 'main',
    APPROVAL_ALLOW_DRY_RUN: 'true',
  },
  waitUntil(promise) {
    waits.push(promise);
  },
});
await Promise.all(waits);
const body = await response.json();
globalThis.fetch = originalFetch;

const dispatch = dispatches[0];
const inputs = dispatch?.body?.inputs || {};
const assertions = {
  responseOk: response.ok && body.success === true,
  dispatchesPublishWorkflow: dispatch?.url?.includes('/actions/workflows/publish-approved.yml/dispatches') === true,
  usesMainRef: dispatch?.body?.ref === 'main',
  carriesOrderId: inputs.order_id === requestBody.order_id,
  normalizesEmail: inputs.email === 'owner@example.com',
  carriesClientAndRepo: inputs.client_slug === requestBody.client_slug,
  includesSendDiscord: inputs.send_discord === 'true',
  honorsSafeDryRun: inputs.dry_run === 'true',
  sendsApprovalDiscordNotice: discordMessages.length === 1,
};
const failed = Object.entries(assertions)
  .filter(([, value]) => value !== true)
  .map(([key]) => key);

console.log(JSON.stringify({
  ok: failed.length === 0,
  assertions,
  failed,
  dispatch: dispatch ? { url: dispatch.url, body: dispatch.body } : null,
  discordMessages,
  response: body,
}, null, 2));

if (failed.length) process.exit(1);
