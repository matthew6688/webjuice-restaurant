import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_UPLOAD_PRESET?: string;
  CLOUDINARY_UPLOAD_FOLDER?: string;
  CLOUDINARY_UPLOAD_MAX_BYTES?: string;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const cloudName = String(context.env.CLOUDINARY_CLOUD_NAME || '').trim();
    const apiKey = String(context.env.CLOUDINARY_API_KEY || '').trim();
    const apiSecret = String(context.env.CLOUDINARY_API_SECRET || '').trim();
    const uploadPreset = String(context.env.CLOUDINARY_UPLOAD_PRESET || '').trim();
    if (!cloudName || (!uploadPreset && (!apiKey || !apiSecret))) {
      return json({ error: 'Attachment uploads are not configured.' }, 503);
    }

    const form = await context.request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return json({ error: 'A file is required.' }, 400);
    }

    const maxBytes = parsePositiveInt(context.env.CLOUDINARY_UPLOAD_MAX_BYTES) || DEFAULT_MAX_BYTES;
    if (file.size > maxBytes) {
      return json({ error: `File is too large. Maximum upload size is ${formatBytes(maxBytes)}.` }, 413);
    }

    const clientSlug = safePathPart(String(form.get('client_slug') || 'unknown-client'));
    const orderId = safePathPart(String(form.get('order_id') || 'unknown-order'));
    const rootFolder = normalizeFolder(context.env.CLOUDINARY_UPLOAD_FOLDER || 'profitslocal/revision-attachments');
    const folder = `${rootFolder}/${clientSlug}/${orderId}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const contextValue = [
      `client_slug=${clientSlug}`,
      `order_id=${orderId}`,
      `original_name=${sanitizeContextValue(file.name)}`,
    ].join('|');
    const uploadParams = {
      context: contextValue,
      folder,
      tags: 'profitslocal,revision-attachment',
      timestamp,
      unique_filename: 'true',
      use_filename: 'true',
    };

    const uploadForm = new FormData();
    uploadForm.set('file', file);
    if (uploadPreset) {
      uploadForm.set('folder', folder);
      uploadForm.set('tags', uploadParams.tags);
      uploadForm.set('context', uploadParams.context);
      uploadForm.set('upload_preset', uploadPreset);
    } else {
      for (const [key, value] of Object.entries(uploadParams)) uploadForm.set(key, value);
      uploadForm.set('api_key', apiKey);
      uploadForm.set('signature', await signCloudinaryParams(uploadParams, apiSecret));
    }

    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/auto/upload`, {
      method: 'POST',
      body: uploadForm,
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      console.error('Cloudinary upload failed', response.status, body);
      return json({ error: 'Attachment upload failed.' }, 502);
    }

    return json({
      success: true,
      name: file.name,
      type: file.type || String(body.resource_type || 'file'),
      size: file.size,
      url: String(body.secure_url || ''),
      public_id: String(body.public_id || ''),
      asset_id: String(body.asset_id || ''),
      resource_type: String(body.resource_type || ''),
      format: String(body.format || ''),
      bytes: Number(body.bytes || file.size),
    });
  } catch (error) {
    console.error('Attachment upload error', error);
    return json({ error: 'Internal error' }, 500);
  }
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  return onRequestPost(context);
};

async function signCloudinaryParams(params: Record<string, string>, apiSecret: string) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const data = new TextEncoder().encode(`${payload}${apiSecret}`);
  const digest = await crypto.subtle.digest('SHA-1', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeFolder(value: string) {
  return value
    .split('/')
    .map((part) => safePathPart(part))
    .filter(Boolean)
    .join('/') || 'profitslocal/revision-attachments';
}

function safePathPart(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';
}

function sanitizeContextValue(value: string) {
  return String(value || '')
    .replace(/[|=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function parsePositiveInt(value: string | undefined) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
