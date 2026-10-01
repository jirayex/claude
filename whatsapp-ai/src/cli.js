// Teste a IA no terminal, sem WhatsApp: npm run chat
import readline from 'node:readline';
import { config } from './config.js';

config.bot.debounceMs = 300;
config.bot.typingCps = 200;
process.env.MEMORY_FILE ??= 'data/cli-memory.json';
const { createAgent } = await import('./agent.js');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const agent = createAgent({
  sendText: async (to, text) => {
    console.log(`\n${to === 'terminal' ? config.bot.name : `[aviso para ${to}]`}: ${text}`);
    rl.prompt();
  },
});

console.log(`Conversando com ${config.bot.name} (Ctrl+C para sair)\n`);
rl.setPrompt('Você: ');
rl.prompt();
rl.on('line', (line) => line.trim() && agent.onMessage({ from: 'terminal', text: line.trim() }));
