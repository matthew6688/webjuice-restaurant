/**
 * Upgrade a client from default fengtalk.ai sender to their own domain
 * Usage: node scripts/upgrade-client-email.js <domain> <notification-email>
 *
 * Prerequisites:
 * - RESEND_MASTER_KEY env var (your main Resend API key)
 * - CF_API_TOKEN and CF_ACCOUNT_ID for DNS automation
 */

const MASTER_RESEND_KEY = process.env.RESEND_MASTER_KEY;
const CF_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT = process.env.CF_ACCOUNT_ID;

async function setupClientEmailDomain(domain) {
  if (!MASTER_RESEND_KEY) {
    console.error('Missing RESEND_MASTER_KEY env var');
    process.exit(1);
  }

  console.log(`\n[1/4] Adding ${domain} to Resend...`);

  const domainRes = await fetch('https://api.resend.com/domains', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MASTER_RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: domain,
      region: 'ap-northeast-1',
    }),
  });

  const domainData = await domainRes.json();

  if (!domainRes.ok) {
    console.error('Failed to add domain:', domainData);
    process.exit(1);
  }

  console.log(`  Domain ID: ${domainData.id}`);
  console.log(`  Status: ${domainData.status}`);

  // 2. Set DNS records in Cloudflare
  if (CF_TOKEN && domainData.records) {
    console.log('\n[2/4] Setting DNS records in Cloudflare...');

    const zoneRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${domain}`,
      {
        headers: {
          'Authorization': `Bearer ${CF_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const zones = await zoneRes.json();

    if (!zones.success || zones.result.length === 0) {
      console.log(`  ⚠️  Zone ${domain} not found in Cloudflare. Add DNS records manually:`);
      for (const record of domainData.records) {
        console.log(`    ${record.type} ${record.name} → ${record.value}`);
      }
    } else {
      const zoneId = zones.result[0].id;
      for (const record of domainData.records) {
        const dnsRes = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${CF_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: record.type,
              name: record.name,
              content: record.value,
              ttl: 1, // auto
              proxied: false, // DNS-only for email records
            }),
          }
        );
        const dnsData = await dnsRes.json();
        if (dnsData.success) {
          console.log(`  ✓ ${record.type} ${record.name}`);
        } else {
          console.log(`  ✗ ${record.type} ${record.name}: ${dnsData.errors?.[0]?.message}`);
        }
      }
    }
  } else {
    console.log('\n[2/4] Skipping DNS automation (no CF_API_TOKEN). Manual records:');
    for (const record of domainData.records || []) {
      console.log(`  ${record.type} ${record.name} → ${record.value}`);
    }
  }

  // 3. Create scoped API key for this client
  console.log('\n[3/4] Creating scoped API key...');
  const keyRes = await fetch('https://api.resend.com/api-keys', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MASTER_RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `webjuice-${domain}`,
      permission: 'sending_access',
    }),
  });
  const keyData = await keyRes.json();

  if (!keyRes.ok) {
    console.error('Failed to create API key:', keyData);
    process.exit(1);
  }

  console.log(`  API Key: ${keyData.token}`);

  // 4. Output instructions
  console.log('\n[4/4] Done. Next steps:');
  console.log(`  1. Update Pages environment variable: FROM_EMAIL = "Client Name <hello@${domain}>"`);
  console.log(`  2. Update Pages secret: RESEND_API_KEY = "${keyData.token}"`);
  console.log(`  3. Redeploy the site`);
  console.log(`  4. Domain verification may take a few minutes`);

  return {
    domain,
    domainId: domainData.id,
    apiKey: keyData.token,
    records: domainData.records,
  };
}

const domain = process.argv[2];
if (!domain) {
  console.error('Usage: node scripts/upgrade-client-email.js <domain>');
  process.exit(1);
}

setupClientEmailDomain(domain).catch(err => {
  console.error(err);
  process.exit(1);
});
