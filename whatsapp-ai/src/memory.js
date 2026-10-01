import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from './config.js';

// Memória simples em arquivo JSON (sem banco de dados, grátis e portátil)
const FILE = process.env.MEMORY_FILE || path.join(ROOT, 'data', 'memory.json');
let db = {};
try {
  db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  }, 500);
}

export function getContact(id) {
  db[id] ??= { name: null, history: [], paused: false, notes: '', firstSeen: Date.now() };
  return db[id];
}

export function updateContact(id, patch) {
  Object.assign(getContact(id), patch);
  save();
}

export function addMessage(id, role, content) {
  const c = getContact(id);
  c.history.push({ role, content, at: Date.now() });
  if (c.history.length > config.bot.historyLimit) c.history = c.history.slice(-config.bot.historyLimit);
  c.lastAt = Date.now();
  save();
}

export function allContacts() {
  return db;
}
