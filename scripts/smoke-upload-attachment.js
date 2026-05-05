#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-attachment-smoke-'));
const source = fs.readFileSync(new URL('../functions/api/upload-attachment.ts', import.meta.url), 'utf8');
fs.writeFileSync(path.join(tempDir, 'upload-attachment.ts'), source);
const { onRequestPost } = await import(pathToFileURL(path.join(tempDir, 'upload-attachment.ts')).href);

const uploads = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('api.cloudinary.com')) {
    const form = options.body;
    uploads.push({
      url: String(url),
      method: options.method,
      folder: form?.get?.('folder'),
      tags: form?.get?.('tags'),
      apiKey: form?.get?.('api_key'),
      signature: form?.get?.('signature'),
      hasFile: form?.get?.('file') instanceof File,
      fileName: form?.get?.('file')?.name,
    });
    return new Response(JSON.stringify({
      asset_id: 'asset_revision_smoke_001',
      bytes: 18,
      format: 'txt',
      public_id: `${form?.get?.('folder')}/fixture`,
      resource_type: 'raw',
      secure_url: 'https://res.cloudinary.com/demo/raw/upload/profitslocal/revision-attachments/fixture.txt',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return originalFetch(url, options);
};

const form = new FormData();
form.set('file', new File(['hello revision file'], 'new-menu.txt', { type: 'text/plain' }));
form.set('client_slug', 'Opa Bar & Mezze Restaurant');
form.set('order_id', 'cs_test_cloudinary_upload_001');

const response = await onRequestPost({
  request: new Request('https://opa-bar-mezze-restaurant-dev.pages.dev/api/upload-attachment/', {
    method: 'POST',
    body: form,
  }),
  env: {
    CLOUDINARY_CLOUD_NAME: 'demo',
    CLOUDINARY_API_KEY: 'key_123',
    CLOUDINARY_API_SECRET: 'secret_123',
    CLOUDINARY_UPLOAD_FOLDER: 'profitslocal/revision-attachments',
    CLOUDINARY_UPLOAD_MAX_BYTES: '10485760',
  },
  waitUntil() {},
});
const body = await response.json();
globalThis.fetch = originalFetch;

const upload = uploads[0] || {};
const assertions = {
  responseOk: response.ok && body.success === true,
  returnsUrl: body.url === 'https://res.cloudinary.com/demo/raw/upload/profitslocal/revision-attachments/fixture.txt',
  usesAutoUploadEndpoint: upload.url === 'https://api.cloudinary.com/v1_1/demo/auto/upload',
  sendsSignedUpload: upload.apiKey === 'key_123' && typeof upload.signature === 'string' && upload.signature.length === 40,
  sendsFile: upload.hasFile === true && upload.fileName === 'new-menu.txt',
  scopesFolderByClientAndOrder: upload.folder === 'profitslocal/revision-attachments/opa-bar-mezze-restaurant/cs_test_cloudinary_upload_001',
  tagsRevisionAttachment: upload.tags === 'profitslocal,revision-attachment',
};
const failed = Object.entries(assertions)
  .filter(([, value]) => value !== true)
  .map(([key]) => key);

console.log(JSON.stringify({
  ok: failed.length === 0,
  assertions,
  failed,
  upload,
  response: body,
}, null, 2));

if (failed.length) process.exit(1);
