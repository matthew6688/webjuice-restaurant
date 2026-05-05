#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-status-smoke-'));
const source = fs.readFileSync(new URL('../functions/api/domain-status.ts', import.meta.url), 'utf8')
  .replace("from './_agent-dispatch'", "from './_agent-dispatch.ts'");
fs.writeFileSync(path.join(tempDir, 'domain-status.ts'), source);
fs.copyFileSync(new URL('../functions/api/_agent-dispatch.ts', import.meta.url), path.join(tempDir, '_agent-dispatch.ts'));

const state = {
  id: 'opa-bar-mezze-restaurant__cs_test_domain_request_001__opa-controlled.profitslocal.com',
  clientSlug: 'opa-bar-mezze-restaurant',
  orderId: 'cs_test_domain_request_001',
  email: 'owner@example.com',
  projectName: 'opa-bar-mezze-restaurant-live',
  status: 'pages_pending',
  domain: 'opa-controlled.profitslocal.com',
  target: 'opa-bar-mezze-restaurant-live.pages.dev',
  pages: { active: false },
  steps: [{ id: 'attach-pages-domain', ok: true, message: 'Cloudflare Pages custom domain is attached.' }],
  updatedAt: new Date(Date.now() - 60_000).toISOString(),
};
const dispatches = [];
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('/contents/')) {
    return new Response(JSON.stringify({
      encoding: 'base64',
      content: btoa(JSON.stringify(state)),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const body = options.body ? JSON.parse(options.body) : null;
  dispatches.push({ url: String(url), body });
  return new Response(null, { status: 204 });
};

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
  waitUntil: (promise) => promise,
});
const body = await response.json();
const dispatch = dispatches[0];
const inputs = dispatch?.body?.inputs || {};
const assertions = {
  responseOk: response.status === 200 && body.ok === true,
  returnsPending: body.status === 'pages_pending',
  returnsDomain: body.domain === 'opa-controlled.profitslocal.com',
  returnsSteps: body.steps?.[0]?.id === 'attach-pages-domain',
  dispatchesRefresh: dispatch?.url?.includes('/actions/workflows/domain-request.yml/dispatches') === true,
  refreshCarriesOriginalRequest: inputs.order_id === 'cs_test_domain_request_001'
    && inputs.email === 'owner@example.com'
    && inputs.domain === 'opa-controlled.profitslocal.com'
    && inputs.execute === 'true',
};
const failed = Object.entries(assertions).filter(([, ok]) => !ok).map(([key]) => key);
console.log(JSON.stringify({ ok: failed.length === 0, assertions, failed, response: body, dispatch }, null, 2));
if (failed.length) process.exit(1);
