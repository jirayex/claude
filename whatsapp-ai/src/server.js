import http from 'node:http';
import { config } from './config.js';
import { sendText, markReadAndTyping, downloadMedia, isValidSignature } from './whatsapp.js';
import { transcribe } from './llm.js';
import { createAgent } from './agent.js';

const agent = createAgent({ sendText, typing: (id) => id && markReadAndTyping(id) });
const seen = new Set(); // a Meta às vezes reenvia o mesmo evento

// Converte qualquer tipo de mensagem do WhatsApp em texto para a IA
async function toText(msg) {
  switch (msg.type) {
    case 'text':
      return msg.text.body;
    case 'button':
      return msg.button.text;
    case 'interactive':
      return msg.interactive.button_reply?.title || msg.interactive.list_reply?.title || '';
    case 'audio': {
      const media = await downloadMedia(msg.audio.id);
      const t = media && (await transcribe(media.buffer, media.mimeType));
      return t ? `(áudio transcrito) ${t}` : '[o cliente mandou um áudio que não deu pra ouvir; peça com gentileza para escrever]';
    }
    case 'image':
    case 'video':
    case 'document':
      return `[o cliente enviou um(a) ${msg.type}]${msg[msg.type].caption ? ` com a legenda: ${msg[msg.type].caption}` : ''}`;
    case 'location':
      return `[o cliente enviou a localização: ${msg.location.name || ''} ${msg.location.address || ''} (${msg.location.latitude}, ${msg.location.longitude})]`;
    case 'sticker':
      return '[o cliente mandou uma figurinha]';
    default:
      return null;
  }
}

async function handleWebhook(payload) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const profileName = value.contacts?.[0]?.profile?.name;
      for (const msg of value.messages ?? []) {
        if (seen.has(msg.id)) continue;
        seen.add(msg.id);
        if (seen.size > 5000) seen.delete(seen.values().next().value);
        const text = await toText(msg);
        if (!text) continue;
        console.log(`[in] ${msg.from}: ${text}`);
        await agent.onMessage({ from: msg.from, text, messageId: msg.id, profileName });
      }
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/webhook') {
    // Verificação que a Meta faz ao cadastrar o webhook
    const ok =
      url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === config.whatsapp.verifyToken;
    res.writeHead(ok ? 200 : 403).end(ok ? url.searchParams.get('hub.challenge') : 'forbidden');
    return;
  }

  if (req.method === 'POST' && url.pathname === '/webhook') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    if (!isValidSignature(raw, req.headers['x-hub-signature-256'])) {
      res.writeHead(401).end();
      return;
    }
    res.writeHead(200).end('ok'); // responde rápido; a Meta reenvia se demorar
    try {
      await handleWebhook(JSON.parse(raw.toString('utf8')));
    } catch (err) {
      console.error('[webhook]', err);
    }
    return;
  }

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`${config.bot.name} online ✅`);
    return;
  }
  res.writeHead(404).end();
});

server.listen(config.port, () => {
  console.log(`🤖 ${config.bot.name} rodando na porta ${config.port} — webhook em /webhook`);
  if (!config.whatsapp.token) console.warn('⚠️  WHATSAPP_TOKEN vazio: configure o .env');
  if (!config.whatsapp.appSecret) console.warn('⚠️  WHATSAPP_APP_SECRET vazio: assinatura do webhook não será validada');
});
