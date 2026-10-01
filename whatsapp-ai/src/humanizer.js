// Faz a IA "conversar como gente": várias mensagens curtas, pausas de digitação realistas.

// A IA separa os balões com "||". Se não separar, quebramos por parágrafos.
export function splitIntoBubbles(text, maxBubbles = 4) {
  let parts = text.includes('||') ? text.split('||') : text.split(/\n\s*\n/);
  parts = parts.map((p) => p.trim()).filter(Boolean);
  if (parts.length > maxBubbles) {
    parts = [...parts.slice(0, maxBubbles - 1), parts.slice(maxBubbles - 1).join('\n\n')];
  }
  return parts;
}

// Tempo de "digitação" proporcional ao tamanho, com variação aleatória, entre 1,2s e 9s
export function typingDelayMs(text, cps = 18, rand = Math.random) {
  const base = (text.length / cps) * 1000;
  const jitter = 0.75 + rand() * 0.5;
  return Math.round(Math.min(9000, Math.max(1200, base * jitter)));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isWithinBusinessHours(range, timezone, now = new Date()) {
  if (!range) return true;
  const m = range.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return true;
  const [h, min] = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone })
    .format(now)
    .split(':')
    .map(Number);
  const cur = h * 60 + min;
  const start = +m[1] * 60 + +m[2];
  const end = +m[3] * 60 + +m[4];
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
}

export function greetingFor(timezone, now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(now));
  return h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite';
}
