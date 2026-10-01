import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

process.env.MEMORY_FILE = path.join(os.tmpdir(), `wa-test-${process.pid}.json`);
process.env.LLM_PROVIDERS = 'groq';
process.env.GROQ_API_KEY = 'test';
process.env.OWNER_NUMBERS = '5500000000000';
process.env.DEBOUNCE_SECONDS = '0.05';
process.env.TYPING_CPS = '100000';

const { splitIntoBubbles, typingDelayMs, isWithinBusinessHours } = await import('../src/humanizer.js');
const { isValidSignature } = await import('../src/whatsapp.js');
const { parseTags, createAgent } = await import('../src/agent.js');
const { getContact } = await import('../src/memory.js');

test('divide resposta em balões', () => {
  assert.deepEqual(splitIntoBubbles('Oi! || Tudo bem?'), ['Oi!', 'Tudo bem?']);
  assert.deepEqual(splitIntoBubbles('a\n\nb'), ['a', 'b']);
  assert.equal(splitIntoBubbles('1||2||3||4||5||6', 3).length, 3);
});

test('tempo de digitação limitado', () => {
  assert.equal(typingDelayMs('oi', 18, () => 0.5), 1200);
  assert.equal(typingDelayMs('x'.repeat(5000), 18, () => 0.5), 9000);
});

test('horário comercial', () => {
  const d = new Date('2026-10-01T15:00:00Z'); // 12:00 em São Paulo
  assert.equal(isWithinBusinessHours('09:00-18:00', 'America/Sao_Paulo', d), true);
  assert.equal(isWithinBusinessHours('13:00-18:00', 'America/Sao_Paulo', d), false);
  assert.equal(isWithinBusinessHours('', 'America/Sao_Paulo', d), true);
});

test('assinatura do webhook', () => {
  const body = Buffer.from('{"a":1}');
  const sig = 'sha256=' + crypto.createHmac('sha256', 's3cr3t').update(body).digest('hex');
  assert.equal(isValidSignature(body, sig, 's3cr3t'), true);
  assert.equal(isValidSignature(body, sig, 'outro'), false);
  assert.equal(isValidSignature(body, undefined, 's3cr3t'), false);
});

test('extrai tags e limpa texto', () => {
  const { text, tags } = parseTags('Prazer, Ana! || Vou chamar a equipe [NOME: Ana] [NOTA: quer drenagem] [HUMANO]');
  assert.equal(text, 'Prazer, Ana! || Vou chamar a equipe');
  assert.equal(tags.name, 'Ana');
  assert.deepEqual(tags.notes, ['quer drenagem']);
  assert.equal(tags.human, true);
});

test('fluxo completo: junta mensagens, responde em balões e transfere para humano', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Oi Ana! || Já chamo alguém [NOME: Ana] [HUMANO]' } }] }));
  };
  const sent = [];
  const agent = createAgent({ sendText: async (to, t) => sent.push([to, t]) });
  await agent.onMessage({ from: '5511', text: 'oi' });
  await agent.onMessage({ from: '5511', text: 'quero falar com atendente' });
  await new Promise((r) => setTimeout(r, 3500));

  assert.equal(calls.length, 1, 'as duas mensagens viram uma chamada só');
  assert.match(calls[0].messages.at(-1).content, /oi\nquero falar/);
  assert.deepEqual(sent.slice(0, 2), [['5511', 'Oi Ana!'], ['5511', 'Já chamo alguém']]);
  assert.equal(sent[2][0], '5500000000000');
  assert.equal(getContact('5511').paused, true);
  assert.equal(getContact('5511').name, 'Ana');

  // pausado: IA não responde mais
  await agent.onMessage({ from: '5511', text: 'alô?' });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(calls.length, 1);

  // dono retoma
  await agent.onMessage({ from: '5500000000000', text: '#retomar 5511' });
  assert.equal(getContact('5511').paused, false);
});

test('Claude: persona em cache, contexto no fim, fallback ligado e recusa vira erro', async () => {
  const { config } = await import('../src/config.js');
  const { chat } = await import('../src/llm.js');
  config.llm.order = ['claude'];
  config.llm.providers.claude.model = 'claude-opus-5-5';
  config.llm.providers.claude.apiKey = 'sk-test';

  const bodies = [];
  let reply = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Oi! || Tudo bem?' }] };
  globalThis.fetch = async (url, opts) => {
    bodies.push({ url: String(url), headers: new Headers(opts.headers), body: JSON.parse(opts.body) });
    return new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', usage: {}, ...reply }), {
      headers: { 'content-type': 'application/json' },
    });
  };

  const text = await chat({
    system: 'PERSONA',
    context: 'CTX',
    history: [{ role: 'assistant', content: 'antiga' }, { role: 'user', content: 'oi' }],
  });
  assert.equal(text, 'Oi! || Tudo bem?');
  const { url, headers, body } = bodies[0];
  assert.match(url, /\/v1\/messages/);
  assert.match(headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.fallbacks, 'default');
  assert.deepEqual(body.system, [{ type: 'text', text: 'PERSONA', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'oi' }, { role: 'system', content: 'CTX' }]);

  reply = { stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] };
  await assert.rejects(chat({ system: 'P', context: 'C', history: [{ role: 'user', content: 'x' }] }), /recusa/);
});
