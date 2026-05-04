import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  RESEND_API_KEY: string;
  NOTIFICATION_EMAIL?: string;
  FROM_EMAIL?: string;
}

interface ContactForm {
  name: string;
  email: string;
  company?: string;
  message: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json<ContactForm>();
    const { name, email, company, message } = body;

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const notificationEmail = context.env.NOTIFICATION_EMAIL || 'hello@fengtalk.ai';
    const fromEmail = context.env.FROM_EMAIL || 'WebJuice <hello@fengtalk.ai>';

    // Send notification via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: notificationEmail,
        subject: `New contact form: ${name}`,
        text: `Name: ${name}
Email: ${email}
Company: ${company || 'N/A'}
Message:
${message}`,
        reply_to: email,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error('Resend error:', err);
      return new Response(JSON.stringify({ error: 'Failed to send notification' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Contact form error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const onRequest: PagesFunction = async (context) => {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return onRequestPost(context);
};
