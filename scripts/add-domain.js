/**
 * Add a custom domain to a Cloudflare Pages project
 * Usage: node scripts/add-domain.js <domain>
 *
 * Prerequisites:
 * - CF_ACCOUNT_ID and CF_API_TOKEN env vars set
 * - Pages project already created and linked to repo
 */

const PROJECT_NAME = 'webjuice-stack-mvp'; // update to your Pages project name

async function addCustomDomain(domain) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;

  if (!accountId || !token) {
    console.error('Missing CF_ACCOUNT_ID or CF_API_TOKEN');
    process.exit(1);
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${PROJECT_NAME}/domains`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domain }),
    }
  );

  const data = await res.json();

  if (!data.success) {
    console.error('Error:', data.errors);
    process.exit(1);
  }

  console.log(`Domain ${domain} added to project.`);
  console.log(`Tell your client to set this CNAME record:`);
  console.log(`  ${domain}  CNAME  ${PROJECT_NAME}.pages.dev`);
  console.log('Or if they use Cloudflare DNS, it may be auto-verified.');
}

const domain = process.argv[2];
if (!domain) {
  console.error('Usage: node scripts/add-domain.js <domain>');
  process.exit(1);
}

addCustomDomain(domain);
