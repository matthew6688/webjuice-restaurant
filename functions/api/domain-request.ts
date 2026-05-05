import type { PagesFunction } from '@cloudflare/workers-types';
import { dispatchWorkflow } from './_agent-dispatch';

interface Env {
  AGENT_GITHUB_TOKEN?: string;
  AGENT_REPO?: string;
  AGENT_REF?: string;
  DOMAIN_WORKFLOW_ID?: string;
  DOMAIN_REQUEST_DRY_RUN?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as Record<string, string>;
    const clientSlug = safeId(body.client_slug || body.clientSlug || '');
    const orderId = safeId(body.order_id || body.orderId || '');
    const email = String(body.email || '').trim().toLowerCase();
    const rawDomain = String(body.domain || body.preferred_domain || '').trim();
    const domain = cleanDomain(rawDomain);
    const project = safeId(body.project || body.project_name || (clientSlug ? `${clientSlug}-live` : ''));
    if (!clientSlug || !orderId || !email) {
      return json({ error: 'Client, Order ID, and checkout email are required.' }, 400);
    }

    const requestId = safeId([clientSlug, orderId, domain || `${clientSlug}.profitslocal.com`].join('__'));
    const route = classifyDomain({ clientSlug, domain, rawDomain, project });
    const inputs = {
      client_slug: clientSlug,
      order_id: orderId,
      email,
      domain,
      project,
      execute: context.env.DOMAIN_REQUEST_DRY_RUN === 'true' ? 'false' : 'true',
      allow_root: 'false',
    };

    context.waitUntil(dispatchWorkflow(context.env, context.env.DOMAIN_WORKFLOW_ID || 'domain-request.yml', inputs, {
      kind: 'domain_request',
      requestId,
      inputs,
    }));

    return json({
      success: true,
      requestId,
      status: 'queued',
      route,
      project,
      target: `${project}.pages.dev`,
    });
  } catch (error) {
    console.error('Domain request error', error);
    return json({ error: 'Internal error' }, 500);
  }
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  return onRequestPost(context);
};

function classifyDomain({ clientSlug, domain, rawDomain, project }: { clientSlug: string; domain: string; rawDomain: string; project: string }) {
  const selected = domain || `${clientSlug}.profitslocal.com`;
  const target = `${project}.pages.dev`;
  const rawPath = rawDomain.trim().replace(/^https?:\/\//i, '').toLowerCase();
  if (rawPath.includes('/') && rawPath.startsWith('profitslocal.com/')) {
    return {
      type: 'profitslocal_subpage',
      domain: 'profitslocal.com',
      requiresCustomerDns: false,
      message: 'ProfitsLocal subpages require the future root-site router and are not the current production launch path.',
    };
  }
  if (selected === 'profitslocal.com' || selected.endsWith('.profitslocal.com')) {
    return {
      type: 'profitslocal_subdomain',
      domain: selected === 'profitslocal.com' ? `${clientSlug}.profitslocal.com` : selected,
      requiresCustomerDns: false,
      message: 'We will configure DNS and attach this ProfitsLocal subdomain for you.',
    };
  }
  if (selected.split('.').length > 2) {
    return {
      type: 'customer_subdomain',
      domain: selected,
      requiresCustomerDns: true,
      message: `Add CNAME ${selected} -> ${target}, then we will attach it to Cloudflare Pages.`,
    };
  }
  return {
    type: 'customer_root_domain',
    domain: selected,
    requiresCustomerDns: true,
    message: 'Root domains require a DNS/email audit before launch. We recommend a customer subdomain if you already have a website.',
  };
}

function cleanDomain(value: string) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\.$/, '')
    .toLowerCase();
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
