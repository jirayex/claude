import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

let anthropic;

// Claude: persona + base de conhecimento em cache (fica ~90% mais barato a partir da 2ª mensagem);
// o contexto que muda a cada mensagem (hora, nome do cliente) vai numa mensagem de sistema no fim.
async function chatClaude({ system, context, history }) {
  const p = config.llm.providers.claude;
  anthropic ??= new Anthropic({ apiKey: p.apiKey });

  const messages = history.map(({ role, content }) => ({ role, content }));
  while (messages[0]?.role === 'assistant') messages.shift(); // a conversa precisa começar pelo cliente

  // O Haiku 4.5 (mais barato) não aceita "effort" nem fallback automático
  const isHaiku = p.model.startsWith('claude-haiku');
  const response = await anthropic.beta.messages.create({
    model: p.model,
    max_tokens: 16000,
    ...(isHaiku
      ? {}
      : {
          output_config: { effort: p.effort },
          // Se o Claude recusar algo por segurança, a própria API refaz com outro modelo
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        }),
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [...messages, { role: 'system', content: context }],
  });

  if (response.stop_reason === 'refusal') throw new Error(`recusa (${response.stop_details?.category ?? 'sem categoria'})`);
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

// Groq, Gemini e Ollama falam o formato OpenAI
async function chatOpenAICompatible(p, { system, context, history }) {
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify({
      model: p.model,
      messages: [{ role: 'system', content: `${system}\n\n# Contexto agora\n${context}` }, ...history],
      temperature: 0.8,
      max_tokens: 600,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim();
}

// Chama o primeiro provedor configurado; se falhar (sem crédito, limite, fora do ar), tenta o próximo.
export async function chat(input) {
  const errors = [];
  for (const name of config.llm.order) {
    const p = config.llm.providers[name];
    if (!p || (!p.apiKey && name !== 'ollama')) continue;
    try {
      const text = name === 'claude' ? await chatClaude(input) : await chatOpenAICompatible(p, input);
      if (text) return text;
      throw new Error('resposta vazia');
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
      console.warn(`[llm] ${name} falhou, tentando próximo →`, err.message);
    }
  }
  throw new Error(`Nenhum provedor de IA respondeu. ${errors.join(' | ')}`);
}

// Transcreve áudio com Whisper (grátis na Groq; o Claude não recebe áudio)
export async function transcribe(buffer, mimeType) {
  const p = config.llm.providers.groq;
  if (!config.llm.transcribeAudio || !p.apiKey) return null;
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), 'audio.ogg');
  form.append('model', 'whisper-large-v3-turbo');
  form.append('language', 'pt');
  const res = await fetch(`${p.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${p.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    console.warn('[llm] transcrição falhou', res.status, await res.text());
    return null;
  }
  return (await res.json()).text?.trim() || null;
}
