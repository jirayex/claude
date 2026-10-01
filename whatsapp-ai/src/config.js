import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carrega o .env sem dependências externas
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = (k, d = '') => process.env[k] ?? d;
const num = (k, d) => Number(env(k, String(d))) || d;

export const config = {
  port: num('PORT', 3000),
  whatsapp: {
    token: env('WHATSAPP_TOKEN'),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    verifyToken: env('WHATSAPP_VERIFY_TOKEN'),
    appSecret: env('WHATSAPP_APP_SECRET'),
    apiVersion: env('WHATSAPP_API_VERSION', 'v23.0'),
  },
  llm: {
    order: env('LLM_PROVIDERS', 'gemini,groq').split(',').map((s) => s.trim()).filter(Boolean),
    providers: {
      claude: {
        apiKey: env('ANTHROPIC_API_KEY'),
        model: env('CLAUDE_MODEL', 'claude-haiku-4-5'),
        // low = respostas rápidas e econômicas, ótimo para chat; suba para medium/high se quiser mais raciocínio
        effort: env('CLAUDE_EFFORT', 'low'),
      },
      groq: {
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: env('GROQ_API_KEY'),
        model: env('GROQ_MODEL', 'llama-3.3-70b-versatile'),
      },
      gemini: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: env('GEMINI_API_KEY'),
        model: env('GEMINI_MODEL', 'gemini-2.5-flash'),
      },
      ollama: {
        baseUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434/v1'),
        apiKey: 'ollama',
        model: env('OLLAMA_MODEL', 'llama3.1'),
      },
    },
    transcribeAudio: env('TRANSCRIBE_AUDIO', 'true') === 'true',
  },
  bot: {
    name: env('BOT_NAME', 'Ana'),
    company: env('COMPANY_NAME', 'Minha Empresa'),
    ownerNumbers: env('OWNER_NUMBERS').split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean),
    debounceMs: num('DEBOUNCE_SECONDS', 6) * 1000,
    typingCps: num('TYPING_CPS', 18),
    businessHours: env('BUSINESS_HOURS'),
    timezone: env('TIMEZONE', 'America/Sao_Paulo'),
    historyLimit: num('HISTORY_LIMIT', 30),
  },
};
