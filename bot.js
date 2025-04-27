// bot.js

require('dotenv').config();
const express     = require('express');
const path        = require('path');
const fs          = require('fs');
const TelegramBot = require('node-telegram-bot-api');

// ── Config ───────────────────────────────────────────────────────────────────
const TOKEN    = process.env.BOT_TOKEN;
const GAME_URL = process.env.GAME_URL;
const PORT     = process.env.PORT || 3000;
const DB_PATH  = path.join(__dirname, 'leaderboard.json');

// ── Persistence setup ─────────────────────────────────────────────────────────
let leaderboard = [];
function loadLeaderboard() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const data = JSON.parse(raw);
    leaderboard = Array.isArray(data) ? data : [];
  } catch {
    leaderboard = [];
    saveLeaderboard();
  }
}
function saveLeaderboard() {
  fs.writeFileSync(DB_PATH, JSON.stringify(leaderboard, null, 2), 'utf-8');
}
loadLeaderboard();

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
    // in DM, use callback_game → opens as Web App
    button = { text: '▶️ Play Flappy Quakks', web_app: { url: GAME_URL } };
  } else {
    // in groups, append the caller’s username into the URL
    const from = msg.from;
    const uname = from.username
      ? '@' + from.username
      : `${from.first_name||'user'}_${from.id}`;
    const urlWithUser = `${GAME_URL}?username=${encodeURIComponent(uname)}`;
    button = { text: '▶️ Play Flappy Quakks', url: urlWithUser };
  }

  bot.sendMessage(chatId,
    'Welcome to 🦆 Flappy Quakks!\nTap below to begin.',
    {
      reply_markup: { inline_keyboard: [ [ button ] ] }
    }
  );
}

// no callback_game callback needed for group
bot.on('callback_query', q => bot.answerCallbackQuery(q.id));

// ── Express Server Setup ─────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/flappy_quakks', express.static(path.join(__dirname, 'public', 'flappy_quakks')));

// ── Leaderboard Endpoints ─────────────────────────────────────────────────────
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
  leaderboard.sort((a,b) => b.score - a.score);
  try { saveLeaderboard(); res.json({ status: 'ok' }); }
  catch { res.status(500).json({ error: 'Could not save leaderboard' }); }
});

app.get('/flappy_quakks/leaderboard', (req, res) => {
  res.json(leaderboard.slice(0, 10));
});

app.listen(PORT, () => {
  console.log(`🚀 Bot & web server listening on port ${PORT}`);
  console.log(`   • Game URL:       ${GAME_URL}`);
  console.log(`   • Leaderboard DB: ${DB_PATH}`);
});
