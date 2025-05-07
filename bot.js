require('dotenv').config();
const express     = require('express');
const path        = require('path');
const fs          = require('fs');
const TelegramBot = require('node-telegram-bot-api');

// ── Config ───────────────────────────────────────────────────────────────────
const TOKEN      = process.env.BOT_TOKEN;
const GAME_URL   = process.env.GAME_URL;
const PORT       = process.env.PORT || 3000;
const ADMIN_ID   = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID, 10) : null;

// ── File paths for leaderboards ──────────────────────────────────────────────
const LB_PATH = path.join(
  __dirname,
  'public', 'flappy_quakks', 'leaderboard.json'
);
const SR_PATH = path.join(
  __dirname,
  'public', 'flappy_quakks', 'sr-leaderboard.json'
);
console.log('Saving SR scores to →', SR_PATH);


// ── In-memory stores ─────────────────────────────────────────────────────────
let leaderboard   = [];
let srLeaderboard = [];

// ── Load/Save helpers ─────────────────────────────────────────────────────────
function loadLeaderboard() {
  try {
    const raw = fs.readFileSync(LB_PATH, 'utf-8');
    const data = JSON.parse(raw);
    leaderboard = Array.isArray(data) ? data : [];
  } catch {
    leaderboard = [];
    saveLeaderboard();
  }
}
function saveLeaderboard() {
  fs.writeFileSync(LB_PATH, JSON.stringify(leaderboard, null, 2), 'utf-8');
}
if (!fs.existsSync(SR_PATH)) {
  fs.writeFileSync(SR_PATH, '[]', 'utf-8');
}

function loadSRLeaderboard() {
  try {
    const raw = fs.readFileSync(SR_PATH, 'utf-8');
    srLeaderboard = JSON.parse(raw);
  } catch {
    srLeaderboard = [];
    saveSRLeaderboard();
  }
}

function saveSRLeaderboard() {
  console.log('🔄 Saving SR leaderboard to:', SR_PATH);
  console.log('   Data:', JSON.stringify(srLeaderboard, null, 2));
  try {
    fs.writeFileSync(SR_PATH, JSON.stringify(srLeaderboard, null, 2), 'utf-8');
    console.log('✅ SR leaderboard saved successfully');
  } catch (err) {
    console.error('❌ Failed to save SR leaderboard:', err);
    throw err;  // re-throw so your POST handler’s catch will log it
  }
}



// initialize data stores
loadLeaderboard();
loadSRLeaderboard();

// ── Telegram Bot Setup ────────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });
bot.on('polling_error', console.error);

// Command pattern for /start and /flap
const cmdPattern = /^\/(start|flap)(@\w+)?$/;
bot.onText(cmdPattern, msg => sendWelcome(msg));
bot.on('callback_query', q => bot.answerCallbackQuery(q.id));

// ── Admin-only Reset Commands ─────────────────────────────────────────────────
bot.onText(/^\/resetclassic(@\w+)?$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (ADMIN_ID === null || userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, '🚫 You are not authorized to use this command.');
  }
  leaderboard = [];
  saveLeaderboard();
  bot.sendMessage(chatId, '🦆 Classic leaderboard has been reset.');
});

bot.onText(/^\/resetspeed(@\w+)?$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (ADMIN_ID === null || userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, '🚫 You are not authorized to use this command.');
  }
  srLeaderboard = [];
  saveSRLeaderboard();
  bot.sendMessage(chatId, '🦆 Speed-Run leaderboard has been reset.');
});

// ── Admin-only Change Classic Score ──────────────────────────────────────────
bot.onText(/^!changeclassic\s+(\d+)$/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (ADMIN_ID === null || userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, '🚫 You are not authorized to use this command.');
  }

  const newScore = parseInt(match[1], 10);
  const username = '@TheCryptoGuyOG';

  // find or add
  const existing = leaderboard.find(e => e.username === username);
  if (existing) {
    existing.score = newScore;
  } else {
    leaderboard.push({ username, score: newScore });
  }
  // re-sort and trim to top 10
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, 10);

  saveLeaderboard();
  bot.sendMessage(chatId, `✅ Classic score for ${username} set to ${newScore}.`);
});

// ── Admin-only Change Speed-Run Score ─────────────────────────────────────────
bot.onText(/^!changespeed\s+(\d+)$/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (ADMIN_ID === null || userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, '🚫 You are not authorized to use this command.');
  }

  const newScore = parseInt(match[1], 10);
  const username = '@TheCryptoGuyOG';

  // find or add
  const existing = srLeaderboard.find(e => e.username === username);
  if (existing) {
    existing.score = newScore;
  } else {
    srLeaderboard.push({ username, score: newScore });
  }
  // re-sort and trim to top 10
  srLeaderboard.sort((a, b) => b.score - a.score);
  srLeaderboard = srLeaderboard.slice(0, 10);

  saveSRLeaderboard();
  bot.sendMessage(chatId, `✅ Speed-Run score for ${username} set to ${newScore}.`);
});

// ── Admin-only Kill Command for Both Leaderboards ───────────────────────────
bot.onText(/^!kill\s+(\S+)\s+(classic|speed)$/i, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (ADMIN_ID === null || userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, '🚫 You are not authorized to use this command.');
  }

  // Normalize inputs
  let username = match[1];
  if (!username.startsWith('@')) username = '@' + username;
  const mode = match[2].toLowerCase();

  // Remove from the chosen leaderboard
  if (mode === 'classic') {
    const before = leaderboard.length;
    leaderboard = leaderboard.filter(e => e.username !== username);
    if (leaderboard.length < before) {
      saveLeaderboard();
      bot.sendMessage(chatId, `✅ Removed ${username} from Classic leaderboard.`);
    } else {
      bot.sendMessage(chatId, `⚠️ ${username} not found on Classic leaderboard.`);
    }
  } else { // speed
    const before = srLeaderboard.length;
    srLeaderboard = srLeaderboard.filter(e => e.username !== username);
    if (srLeaderboard.length < before) {
      saveSRLeaderboard();
      bot.sendMessage(chatId, `✅ Removed ${username} from Speed-Run leaderboard.`);
    } else {
      bot.sendMessage(chatId, `⚠️ ${username} not found on Speed-Run leaderboard.`);
    }
  }
});
// ── sendWelcome function ──────────────────────────────────────────────────────
function sendWelcome(msg) {
  const chatId    = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';
  let button;

  if (isPrivate) {
    button = { text: '▶️ Play Flappy Quakks', web_app: { url: GAME_URL } };
  } else {
    const from  = msg.from;
    const uname = from.username
      ? '@' + from.username
      : `${from.first_name||'user'}_${from.id}`;
    const urlWithUser = `${GAME_URL}?username=${encodeURIComponent(uname)}`;
    button = { text: '▶️ Play Flappy Quakks', url: urlWithUser };
  }

  bot.sendMessage(chatId,
    'Welcome to 🦆 Flappy Quakks!\nTap below to begin.',
    { reply_markup: { inline_keyboard: [[ button ]] } }
  );
}

// ── Express Server Setup ─────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(
  '/flappy_quakks',
  express.static(path.join(__dirname, 'public', 'flappy_quakks'))
);

// ── Classic Leaderboard Endpoints ─────────────────────────────────────────────
app.post('/flappy_quakks/submit', (req, res) => {
  const { username, score } = req.body;
  if (typeof username !== 'string' || typeof score !== 'number') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const existing = leaderboard.find(e => e.username === username);
  if (existing) {
    if (score > existing.score) existing.score = score;
  } else {
    leaderboard.push({ username, score });
  }
  leaderboard.sort((a, b) => b.score - a.score);
  try { saveLeaderboard(); res.json({ status: 'ok' }); }
  catch { res.status(500).json({ error: 'Could not save leaderboard' }); }
});

app.get('/flappy_quakks/leaderboard', (req, res) => {
  res.json(leaderboard.slice(0, 10));
});

// ── Speed-Run Leaderboard Endpoints ───────────────────────────────────────────
app.post('/flappy_quakks/SR-submit', (req, res) => {
  const { username, score } = req.body;
  if (typeof username !== 'string' || typeof score !== 'number') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const existing = srLeaderboard.find(e => e.username === username);
  if (existing) {
    if (score > existing.score) existing.score = score;
  } else {
    srLeaderboard.push({ username, score });
  }
  srLeaderboard.sort((a, b) => b.score - a.score);
  try { saveSRLeaderboard(); res.json({ status: 'ok' }); }
  catch { res.status(500).json({ error: 'Could not save SR leaderboard' }); }
});

app.get('/flappy_quakks/SR-leaderboard', (req, res) => {
  res.json(srLeaderboard.slice(0, 10));
});

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});