#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-status-smoke-'));
fs.copyFileSync(new URL('../functions/api/domain-status.ts', import.meta.url), path.join(tempDir, 'domain-status.ts'));

const state = {
  status: 'active',
  domain: 'opa-controlled.profitslocal.com',
  target: 'opa-bar-mezze-restaurant-live.pages.dev',
  pages: { active: true },
  steps: [{ id: 'attach-pages-domain', ok: true, message: 'Cloudflare Pages custom domain is attached.' }],
};
globalThis.fetch = async () => new Response(JSON.stringify({
  encoding: 'base64',
  content: btoa(JSON.stringify(state)),
}), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

const mod = await import(`file://${path.join(tempDir, 'domain-status.ts')}`);
const response = await mod.onRequestPost({
  request: new Request('https://example.com/api/domain-status', {
    method: 'POST',
    body: JSON.stringify({
      client_slug: 'opa-bar-mezze-restaurant',
      request_id: 'opa-bar-mezze-restaurant__cs_test_domain_request_001__opa-controlled.profitslocal.com',
    }),
  }),
  env: {
    AGENT_GITHUB_TOKEN: 'gh_test_token',
    AGENT_REPO: 'matthew6688/webjuice-stack-mvp',
  },
});
const body = await response.json();
const assertions = {
  responseOk: response.status === 200 && body.ok === true,
  returnsActive: body.status === 'active',
  returnsDomain: body.domain === 'opa-controlled.profitslocal.com',
  returnsSteps: body.steps?.[0]?.id === 'attach-pages-domain',
};
const failed = Object.entries(assertions).filter(([, ok]) => !ok).map(([key]) => key);
console.log(JSON.stringify({ ok: failed.length === 0, assertions, failed, response: body }, null, 2));
if (failed.length) process.exit(1);
