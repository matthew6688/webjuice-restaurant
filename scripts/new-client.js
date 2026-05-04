#!/usr/bin/env node
/**
 * WebJuice Client Site Generator
 * Usage: node scripts/new-client.js --name "Acme Corp" --slug acme --domain acme.com --email hello@acme.com
 *
 * Prerequisites:
 * - This repo must be set as a GitHub Template (Settings → General → Template repository)
 * - Env vars: GH_PAT, CF_API_TOKEN, CF_ACCOUNT_ID
 */

const TEMPLATE_OWNER = 'matthewatuchat';
const TEMPLATE_REPO = 'webjuice-stack-mvp';

const GH_PAT = process.env.GH_PAT;
const CF_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT = process.env.CF_ACCOUNT_ID;

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    parsed[key] = args[i + 1];
  }
  return parsed;
}

async function githubRequest(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `token ${GH_PAT}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
      ...opts.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function cfRequest(path, opts = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

async function generateRepo(slug) {
  console.log(`[1/6] Creating repo ${slug} from template...`);
  const data = await githubRequest(`/repos/${TEMPLATE_OWNER}/${TEMPLATE_REPO}/generate`, {
    method: 'POST',
    body: JSON.stringify({
      owner: TEMPLATE_OWNER,
      name: slug,
      description: `Client website for ${slug}`,
      private: true,
    }),
  });
  console.log(`  ✓ Repo created: ${data.html_url}`);
  return data;
}

async function createDevBranch(repoFullName) {
  console.log(`[2/6] Creating dev branch...`);
  // Get main branch SHA
  const mainRef = await githubRequest(`/repos/${repoFullName}/git/ref/heads/main`);
  const mainSha = mainRef.object.sha;
  
  // Create dev branch
  try {
    await githubRequest(`/repos/${repoFullName}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: 'refs/heads/dev',
        sha: mainSha,
      }),
    });
    console.log(`  ✓ Dev branch created`);
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log(`  ⚠️  Dev branch already exists`);
    } else {
      throw e;
    }
  }
}

async function updateSiteConfig(repoFullName, config) {
  console.log(`[3/7] Updating site config...`);

  // Get current file sha
  let sha;
  try {
    const file = await githubRequest(`/repos/${repoFullName}/contents/src/config/site.ts`);
    sha = file.sha;
  } catch (e) {
    // File might not exist, create new
  }

  const newConfig = `export interface SiteConfig {
  name: string;
  tagline: string;
  description: string;
  email: string;
  domain: string;
  fromName: string;
  navLinks: { label: string; href: string }[];
  footer: { text: string };
}

export const siteConfig: SiteConfig = {
  name: '${config.name}',
  tagline: 'Fast Websites for B2B Companies',
  description: '${config.name} - Professional B2B website built with Astro + Cloudflare.',
  email: '${config.email}',
  domain: '${config.domain}',
  fromName: '${config.name}',
  navLinks: [
    { label: 'Home', href: '/' },
    { label: 'Blog', href: '/blog' },
    { label: 'Cases', href: '/cases' },
    { label: 'Contact', href: '/contact' },
  ],
  footer: {
    text: 'Built with Astro + Cloudflare.',
  },
};
`;

  const payload = {
    message: `config: set brand for ${config.name}`,
    content: Buffer.from(newConfig).toString('base64'),
    branch: 'main',
  };
  if (sha) payload.sha = sha;

  await githubRequest(`/repos/${repoFullName}/contents/src/config/site.ts`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  console.log(`  ✓ Config updated`);
}

async function createPagesProject(slug) {
  console.log(`[4/7] Creating Cloudflare Pages project...`);
  try {
    await cfRequest(`/accounts/${CF_ACCOUNT}/pages/projects`, {
      method: 'POST',
      body: JSON.stringify({ name: slug }),
    });
    console.log(`  ✓ Pages project created: ${slug}`);
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log(`  ⚠️  Project ${slug} already exists`);
    } else {
      throw e;
    }
  }
}

async function addPagesDomain(slug, domain) {
  console.log(`[5/7] Adding custom domain...`);
  try {
    await cfRequest(`/accounts/${CF_ACCOUNT}/pages/projects/${slug}/domains`, {
      method: 'POST',
      body: JSON.stringify({ domain }),
    });
    console.log(`  ✓ Domain added: ${domain}`);
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log(`  ⚠️  Domain ${domain} already added`);
    } else {
      throw e;
    }
  }
}

async function updateRepoVars(repoFullName, slug, domain) {
  console.log(`[6/7] Setting repository variables...`);

  // Set Pages project name as a variable
  try {
    await githubRequest(`/repos/${repoFullName}/actions/variables`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'PAGES_PROJECT_NAME',
        value: slug,
      }),
    });
    console.log(`  ✓ Variable PAGES_PROJECT_NAME set`);
  } catch (e) {
    console.log(`  ⚠️  Variable might already exist: ${e.message}`);
  }
}

function printNextSteps(repoUrl, slug, domain) {
  console.log(`\n[7/7] Done!\n`);
  console.log(`Repository: ${repoUrl}`);
  console.log(`Live URL:   https://${slug}.pages.dev`);
  console.log(`Dev URL:    https://${slug}-dev.pages.dev`);
  console.log(`Custom Domain: ${domain}`);
  console.log(`\n⚠️  Manual steps required:`);
  console.log(`  1. Go to ${repoUrl}/settings/secrets/actions`);
  console.log(`     - Add CLOUDFLARE_API_TOKEN (your Cloudflare API token)`);
  console.log(`     - Add CLOUDFLARE_ACCOUNT_ID (${CF_ACCOUNT})`);
  console.log(`  2. Tell client to set this DNS record:`);
  console.log(`     ${domain}  CNAME  ${slug}.pages.dev`);
  console.log(`  3. Push any change to main branch to trigger first deploy`);
  console.log(`\nOptional (Phase 2 email upgrade):`);
  console.log(`  node scripts/upgrade-client-email.js ${domain}`);
}

async function main() {
  const args = parseArgs();

  if (!args.name || !args.slug || !args.domain || !args.email) {
    console.error(`Usage: node scripts/new-client.js \
  --name "Acme Corp" \
  --slug acme-website \
  --domain acme.com \
  --email hello@acme.com`);
    process.exit(1);
  }

  if (!GH_PAT || !CF_TOKEN || !CF_ACCOUNT) {
    console.error('Missing env vars: GH_PAT, CF_API_TOKEN, CF_ACCOUNT_ID');
    process.exit(1);
  }

  const repoFullName = `${TEMPLATE_OWNER}/${args.slug}`;

  try {
    const repo = await generateRepo(args.slug);
    await createDevBranch(repoFullName);
    await updateSiteConfig(repoFullName, args);
    await createPagesProject(args.slug);
    await addPagesDomain(args.slug, args.domain);
    await updateRepoVars(repoFullName, args.slug, args.domain);
    printNextSteps(repo.html_url, args.slug, args.domain);
  } catch (err) {
    console.error('\n❌ Failed:', err.message);
    process.exit(1);
  }
}

main();
