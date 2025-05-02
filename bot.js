require('dotenv').config();
const express     = require('express');
const path        = require('path');
const fs          = require('fs');
const TelegramBot = require('node-telegram-bot-api');

// ── Config ───────────────────────────────────────────────────────────────────
const TOKEN      = process.env.BOT_TOKEN;
const GAME_URL   = process.env.GAME_URL;
const PORT       = process.env.PORT || 3000;
// file paths for classic and speed-run leaderboards
targetDir = path.join(__dirname);
const LB_PATH    = path.join(targetDir, 'leaderboard.json');
const SR_PATH    = path.join(targetDir, 'sr-leaderboard.json');

// ── Persistence setup ─────────────────────────────────────────────────────────
let leaderboard   = [];
let srLeaderboard = [];

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

function loadSRLeaderboard() {
  try {
    const raw = fs.readFileSync(SR_PATH, 'utf-8');
    const data = JSON.parse(raw);
    srLeaderboard = Array.isArray(data) ? data : [];
  } catch {
    srLeaderboard = [];
    saveSRLeaderboard();
  }
}

function saveSRLeaderboard() {
  fs.writeFileSync(SR_PATH, JSON.stringify(srLeaderboard, null, 2), 'utf-8');
}

// initialize data stores
loadLeaderboard();
loadSRLeaderboard();

// ── Telegram Bot Setup ────────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });
bot.on('polling_error', console.error);

const cmdPattern = /^\/(start|flap)(@\w+)?$/;
bot.onText(cmdPattern, msg => sendWelcome(msg));

function sendWelcome(msg) {
  const chatId    = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';
  let button;

  if (isPrivate) {
    // in DM, opens as Web App
    button = { text: '▶️ Play Flappy Quakks', web_app: { url: GAME_URL } };
  } else {
    // in groups, include username in URL param
    const from = msg.from;
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

bot.on('callback_query', q => bot.answerCallbackQuery(q.id));

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
  try {
    saveLeaderboard();
    res.json({ status: 'ok' });
  } catch {
    res.status(500).json({ error: 'Could not save leaderboard' });
  }
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
  try {
    saveSRLeaderboard();
    res.json({ status: 'ok' });
  } catch {
    res.status(500).json({ error: 'Could not save SR leaderboard' });
  }
});

app.get('/flappy_quakks/SR-leaderboard', (req, res) => {
  res.json(srLeaderboard.slice(0, 10));
});

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`   • Game URL:       ${GAME_URL}`);
  console.log(`   • LB file:        ${LB_PATH}`);
  console.log(`   • SR-LB file:     ${SR_PATH}`);
});