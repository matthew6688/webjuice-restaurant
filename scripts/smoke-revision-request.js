#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revision-request-smoke-'));
const source = fs.readFileSync(new URL('../functions/api/revision-request.ts', import.meta.url), 'utf8')
  .replace("from './_agent-dispatch'", "from './_agent-dispatch.ts'")
  .replace("from './_email'", "from './_email.ts'");
fs.writeFileSync(path.join(tempDir, 'revision-request.ts'), source);
fs.copyFileSync(new URL('../functions/api/_agent-dispatch.ts', import.meta.url), path.join(tempDir, '_agent-dispatch.ts'));
fs.copyFileSync(new URL('../functions/api/_email.ts', import.meta.url), path.join(tempDir, '_email.ts'));
const { onRequestPost } = await import(pathToFileURL(path.join(tempDir, 'revision-request.ts')).href);

const dispatches = [];
const discordMessages = [];
const emails = [];
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
  if (String(url).includes('api.resend.com')) {
    emails.push({ url: String(url), body });
    return new Response(JSON.stringify({ id: 'email_revision_smoke_001' }), { status: 200 });
  }
  return originalFetch(url, options);
};

const waits = [];
const requestBody = {
  order_id: 'cs_test_revision_endpoint_001',
  email: 'Owner@Example.com',
  requested_changes: 'Please make the hero more premium and update the opening copy.',
  client_slug: 'opa-bar-mezze-restaurant',
  repo: 'matthew6688/opa-bar-mezze-restaurant',
  template: 'webjuice-restaurant',
  preview_url: 'https://opa-bar-mezze-restaurant-dev.pages.dev/',
  reference_url: 'https://example.com/reference',
  attachments: [
    { name: 'new-menu.pdf', type: 'application/pdf', size: 204800 },
    { name: 'hero-photo.jpg', type: 'image/jpeg', size: 512000 },
  ],
  dry_run: 'true',
};
const response = await onRequestPost({
  request: new Request('https://opa-bar-mezze-restaurant-dev.pages.dev/api/revision-request/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  }),
  env: {
    REVISE_DISCORD_WEBHOOK_URL: 'https://discord.test/revision',
    AGENT_GITHUB_TOKEN: 'gh_test_token',
    AGENT_REPO: 'matthew6688/webjuice-stack-mvp',
    AGENT_REF: 'main',
    RESEND_API_KEY: 're_test_key',
    FROM_EMAIL: 'ProfitsLocal <hello@example.com>',
    REVISION_ALLOW_DRY_RUN: 'true',
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
const routedPayload = inputs.payload ? JSON.parse(inputs.payload) : null;
const fields = routedPayload?.fields || {};
const assertions = {
  responseOk: response.ok && body.success === true,
  dispatchesRouteWorkflow: dispatch?.url?.includes('/actions/workflows/route-funnel-event.yml/dispatches') === true,
  usesAutoTallyProvider: inputs.provider === 'tally',
  honorsSafeDryRun: inputs.dry_run === 'true',
  carriesOrderAndEmail: fields.order_id === requestBody.order_id && fields.email === 'owner@example.com',
  carriesRequestedChanges: fields.requested_changes === requestBody.requested_changes,
  carriesAttachmentSummary: String(fields.attachment_summary || '').includes('new-menu.pdf')
    && String(fields.attachment_summary || '').includes('hero-photo.jpg'),
  carriesClientAndRepo: fields.client_slug === requestBody.client_slug && fields.repo === requestBody.repo,
  sendsRevisionDiscordNotice: discordMessages.length === 1,
  discordNoticeShowsAttachments: JSON.stringify(discordMessages[0]?.body || {}).includes('new-menu.pdf'),
  sendsCustomerReceiptEmail: emails.length === 1,
  emailShowsAttachments: JSON.stringify(emails[0]?.body || {}).includes('hero-photo.jpg'),
};
const failed = Object.entries(assertions)
  .filter(([, value]) => value !== true)
  .map(([key]) => key);

console.log(JSON.stringify({
  ok: failed.length === 0,
  assertions,
  failed,
  dispatch: dispatch ? { url: dispatch.url, body: dispatch.body } : null,
  routedPayload,
  discordMessages,
  emails,
  response: body,
}, null, 2));

if (failed.length) process.exit(1);
