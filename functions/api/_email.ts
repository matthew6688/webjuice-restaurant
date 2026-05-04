export interface EmailEnv {
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;
}

export async function sendCustomerEmail(
  env: EmailEnv,
  {
    to,
    subject,
    html,
    text,
  }: {
    to: string;
    subject: string;
    html: string;
    text: string;
  },
) {
  if (!env.RESEND_API_KEY || !to) return { ok: false, skipped: true };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL || 'ProfitsLocal <hello@profitslocal.com>',
      to,
      subject,
      html,
      text,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend email failed: ${response.status} ${body}`.trim());
  }
  return { ok: true, status: response.status };
}
