#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-request-smoke-'));
const source = fs.readFileSync(new URL('../functions/api/domain-request.ts', import.meta.url), 'utf8')
  .replace("from './_agent-dispatch'", "from './_agent-dispatch.ts'");
fs.writeFileSync(path.join(tempDir, 'domain-request.ts'), source);
fs.copyFileSync(new URL('../functions/api/_agent-dispatch.ts', import.meta.url), path.join(tempDir, '_agent-dispatch.ts'));

const dispatches = [];
globalThis.fetch = async (url, options = {}) => {
  const body = options.body ? JSON.parse(options.body) : null;
  dispatches.push({ url: String(url), body });
  return new Response(null, { status: 204 });
};

const mod = await import(`file://${path.join(tempDir, 'domain-request.ts')}`);
const response = await mod.onRequestPost({
  request: new Request('https://example.com/api/domain-request', {
    method: 'POST',
    body: JSON.stringify({
      client_slug: 'opa-bar-mezze-restaurant',
      order_id: 'cs_test_domain_request_001',
      email: 'owner@example.com',
      domain: 'opa-controlled.profitslocal.com',
      project: 'opa-bar-mezze-restaurant-live',
    }),
  }),
  env: {
    AGENT_GITHUB_TOKEN: 'gh_test_token',
    AGENT_REPO: 'matthew6688/webjuice-stack-mvp',
    DOMAIN_REQUEST_DRY_RUN: 'true',
  },
  waitUntil: (promise) => promise,
});

const body = await response.json();
const dispatch = dispatches[0];
const inputs = dispatch?.body?.inputs || {};
const assertions = {
  responseOk: response.status === 200 && body.success === true,
  returnsRequestId: typeof body.requestId === 'string' && body.requestId.includes('opa-controlled'),
  classifiesProfitsLocal: body.route?.type === 'profitslocal_subdomain',
  dispatchesDomainWorkflow: dispatch?.url?.includes('/actions/workflows/domain-request.yml/dispatches') === true,
  sendsDryRunWhenConfigured: inputs.execute === 'false',
  carriesOrderEmailDomain: inputs.order_id === 'cs_test_domain_request_001'
    && inputs.email === 'owner@example.com'
    && inputs.domain === 'opa-controlled.profitslocal.com',
};
const failed = Object.entries(assertions).filter(([, ok]) => !ok).map(([key]) => key);
console.log(JSON.stringify({
  ok: failed.length === 0,
  assertions,
  failed,
  response: body,
  dispatch,
}, null, 2));

if (failed.length) process.exit(1);
