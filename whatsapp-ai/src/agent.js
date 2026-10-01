import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from './config.js';
import { chat } from './llm.js';
import { getContact, updateContact, addMessage } from './memory.js';
import { splitIntoBubbles, typingDelayMs, sleep, isWithinBusinessHours, greetingFor } from './humanizer.js';

const HUMAN_REQUEST = /\b(atendente|humano|pessoa de verdade|falar com algu[eé]m|gerente)\b/i;

function loadKnowledge() {
  const dir = path.join(ROOT, 'knowledge');
  if (!fs.existsSync(dir)) return '';
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(md|txt)$/i.test(f))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n\n');
}

// Parte fixa (persona + base de conhecimento): igual em toda mensagem, por isso o Claude guarda em cache
function buildSystemPrompt() {
  // Relido a cada mensagem: editou a pasta knowledge/ ou o persona.md, vale na hora, sem reiniciar.
  return fs
    .readFileSync(path.join(ROOT, 'prompts', 'persona.md'), 'utf8')
    .replaceAll('{{BOT_NAME}}', config.bot.name)
    .replaceAll('{{COMPANY}}', config.bot.company)
    .replace('{{KNOWLEDGE}}', loadKnowledge() || '(vazia)');
}

// Parte que muda a cada mensagem
function buildContext(contact) {
  const { businessHours, timezone } = config.bot;
  const now = new Date();
  return [
    `Data/hora: ${now.toLocaleString('pt-BR', { timeZone: timezone })} (use "${greetingFor(timezone, now)}" se for cumprimentar).`,
    isWithinBusinessHours(businessHours, timezone, now)
      ? 'A equipe humana está disponível agora.'
      : `Fora do horário da equipe humana (${businessHours}). Você continua atendendo; se precisar de humano, avise que retornam no próximo horário.`,
    contact.name ? `Nome do cliente: ${contact.name}.` : 'Ainda não sabe o nome do cliente; pergunte com naturalidade quando fizer sentido.',
    contact.notes ? `O que você já sabe do cliente: ${contact.notes}` : '',
    contact.history.length === 0 ? 'É a primeira mensagem deste cliente.' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// Extrai as tags de controle que a IA inclui e devolve o texto limpo
export function parseTags(raw) {
  const tags = { human: /\[HUMANO\]/i.test(raw), name: null, notes: [] };
  const nameMatch = raw.match(/\[NOME:\s*([^\]]+)\]/i);
  if (nameMatch) tags.name = nameMatch[1].trim();
  for (const m of raw.matchAll(/\[NOTA:\s*([^\]]+)\]/gi)) tags.notes.push(m[1].trim());
  const text = raw
    .replace(/\[(HUMANO|NOME:[^\]]*|NOTA:[^\]]*)\]/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return { text, tags };
}

export function createAgent(transport) {
  const buffers = new Map(); // contato -> { texts, lastMessageId, timer }
  const busy = new Set();

  async function notifyOwners(text) {
    for (const owner of config.bot.ownerNumbers) await transport.sendText(owner, text);
  }

  async function handleOwnerCommand(text) {
    const [cmd, arg] = text.trim().split(/\s+/);
    const target = arg?.replace(/\D/g, '');
    const owner = config.bot.ownerNumbers[0];
    if (cmd === '#pausar' && target) {
      updateContact(target, { paused: true });
      return transport.sendText(owner, `⏸️ IA pausada para ${target}. Você assume a conversa.`);
    }
    if (cmd === '#retomar' && target) {
      updateContact(target, { paused: false });
      return transport.sendText(owner, `▶️ IA voltou a atender ${target}.`);
    }
    return transport.sendText(owner, 'Comandos: #pausar 5511999999999 | #retomar 5511999999999');
  }

  async function respond(contactId) {
    const buf = buffers.get(contactId);
    buffers.delete(contactId);
    if (!buf) return;
    if (busy.has(contactId)) {
      // Ainda respondendo a mensagem anterior: reagenda para não atropelar
      buffers.set(contactId, buf);
      buf.timer = setTimeout(() => respond(contactId), 1500);
      return;
    }
    busy.add(contactId);
    try {
      const contact = getContact(contactId);
      const userText = buf.texts.join('\n');
      const input = {
        system: buildSystemPrompt(),
        context: buildContext(contact),
        history: [...contact.history.map(({ role, content }) => ({ role, content })), { role: 'user', content: userText }],
      };
      addMessage(contactId, 'user', userText);

      await transport.typing?.(buf.lastMessageId);
      let raw;
      try {
        raw = await chat(input);
      } catch (err) {
        console.error('[agent]', err.message);
        raw = 'Opa, deu uma instabilidade aqui do meu lado 😅 || Já chamei alguém da equipe pra te responder, tá? [HUMANO]';
      }
      if (HUMAN_REQUEST.test(userText) && !/\[HUMANO\]/i.test(raw)) raw += ' [HUMANO]';

      const { text, tags } = parseTags(raw);
      if (tags.name) updateContact(contactId, { name: tags.name });
      if (tags.notes.length) {
        updateContact(contactId, { notes: [contact.notes, ...tags.notes].filter(Boolean).join(' | ').slice(-1500) });
      }
      addMessage(contactId, 'assistant', text.replaceAll('||', '\n'));

      for (const [i, bubble] of splitIntoBubbles(text).entries()) {
        if (i > 0) await transport.typing?.(buf.lastMessageId);
        await sleep(typingDelayMs(bubble, config.bot.typingCps));
        await transport.sendText(contactId, bubble);
      }

      if (tags.human) {
        updateContact(contactId, { paused: true });
        await notifyOwners(
          `🙋 Cliente pediu atendimento humano\n` +
            `Contato: ${contact.name || '(sem nome)'} — wa.me/${contactId}\n` +
            `Última mensagem: "${userText.slice(0, 300)}"\n` +
            (contact.notes ? `Notas: ${contact.notes}\n` : '') +
            `\nA IA pausou para esse cliente. Quando terminar, mande: #retomar ${contactId}`,
        );
      }
    } finally {
      busy.delete(contactId);
    }
  }

  // Entrada única: o servidor (ou o CLI) chama isto para cada mensagem recebida
  async function onMessage({ from, text, messageId, profileName }) {
    if (config.bot.ownerNumbers.includes(from) && text?.startsWith('#')) return handleOwnerCommand(text);

    const contact = getContact(from);
    if (!contact.name && profileName) updateContact(from, { name: profileName.split(' ')[0] });
    if (contact.paused) {
      addMessage(from, 'user', text); // guarda no histórico para a IA ter contexto quando voltar
      return;
    }

    // Debounce: espera o cliente terminar de mandar várias mensagens seguidas
    const buf = buffers.get(from) ?? { texts: [] };
    buf.texts.push(text);
    buf.lastMessageId = messageId;
    clearTimeout(buf.timer);
    buf.timer = setTimeout(() => respond(from).catch((e) => console.error('[agent]', e)), config.bot.debounceMs);
    buffers.set(from, buf);
    await transport.typing?.(messageId);
  }

  return { onMessage };
}
