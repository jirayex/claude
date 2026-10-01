import crypto from 'node:crypto';
import { config } from './config.js';

const { token, phoneNumberId, apiVersion, appSecret } = config.whatsapp;
const GRAPH = `https://graph.facebook.com/${apiVersion}`;

async function graph(pathname, body) {
  const res = await fetch(`${GRAPH}/${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error('[whatsapp] erro', res.status, await res.text());
  return res.ok;
}

export function sendText(to, text) {
  return graph(`${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text, preview_url: true },
  });
}

// Marca como lida (✓✓ azul) e mostra "digitando..." para o cliente
export function markReadAndTyping(messageId) {
  return graph(`${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
    typing_indicator: { type: 'text' },
  });
}

export async function downloadMedia(mediaId) {
  const auth = { Authorization: `Bearer ${token}` };
  const meta = await (await fetch(`${GRAPH}/${mediaId}`, { headers: auth })).json();
  if (!meta.url) return null;
  const file = await fetch(meta.url, { headers: auth });
  return { buffer: Buffer.from(await file.arrayBuffer()), mimeType: meta.mime_type };
}

// Garante que a requisição veio mesmo da Meta (header X-Hub-Signature-256)
export function isValidSignature(rawBody, signatureHeader, secret = appSecret) {
  if (!secret) return true; // sem App Secret configurado, não valida (só para testes)
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const got = signatureHeader.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
