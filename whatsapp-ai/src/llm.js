import { config } from './config.js';

// Chama o primeiro provedor disponível; se falhar (limite grátis, fora do ar), tenta o próximo.
export async function chat(messages, { temperature = 0.8, maxTokens = 600 } = {}) {
  const errors = [];
  for (const name of config.llm.order) {
    const p = config.llm.providers[name];
    if (!p || (!p.apiKey && name !== 'ollama')) continue;
    try {
      const res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
        body: JSON.stringify({ model: p.model, messages, temperature, max_tokens: maxTokens }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) return text;
      throw new Error('resposta vazia');
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
      console.warn(`[llm] ${name} falhou, tentando próximo →`, err.message);
    }
  }
  throw new Error(`Nenhum provedor de IA respondeu. ${errors.join(' | ')}`);
}

// Transcreve áudio com Whisper (grátis na Groq)
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
