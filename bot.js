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

// ── Persistence setup ──────────────────────────────────────────────────────────
let leaderboard = [];

// Load or initialize the JSON file
function loadLeaderboard() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      leaderboard = data;
    } else {
      leaderboard = [];
    }
  } catch (e) {
    // Missing or invalid → start fresh
    leaderboard = [];
    saveLeaderboard();
  }
}

// Write out the full array (everyone’s best) to disk
function saveLeaderboard() {
  fs.writeFileSync(DB_PATH,
                   JSON.stringify(leaderboard, null, 2),
                   'utf-8');
}

// Do it on startup
loadLeaderboard();

// ── Telegram Bot Setup ────────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });
bot.on('polling_error', console.error);

/**
 * Send the welcome message + play button.
 * Uses web_app in private chats, url in groups.
 */
function sendWelcome(msg) {
  const chatId    = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';
  const button    = isPrivate
    ? { text: '▶️ Play Flappy Quakks', web_app: { url: GAME_URL } }
    : { text: '▶️ Play Flappy Quakks', url:      GAME_URL };

  bot.sendMessage(chatId,
    'Welcome to 🦆 Flappy Quakks!\nTap below to begin.',
    {
      reply_markup: { inline_keyboard: [[ button ]] }
    }
  );
}

// Handle both /start and /flap (with or without @YourBotName)
const cmdPattern = /^\/(start|flap)(@\w+)?$/;
bot.onText(cmdPattern, msg => sendWelcome(msg));

// Acknowledge callback queries (optional)
bot.on('callback_query', q => bot.answerCallbackQuery(q.id));

// ── Express Server Setup ─────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Serve your game’s static files
app.use(
  '/flappy_quakks',
  express.static(path.join(__dirname, 'public', 'flappy_quakks'))
);

// ── Leaderboard Endpoints ─────────────────────────────────────────────────────

// 1) Submit a new score:
//    { username: '@foo', score: 42 }
app.post('/flappy_quakks/submit', (req, res) => {
  const { username, score } = req.body;
  if (typeof username !== 'string' || typeof score !== 'number') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  // Find existing entry
  const existing = leaderboard.find(e => e.username === username);
  if (existing) {
    // Only update if this is a new personal best
    if (score > existing.score) {
      existing.score = score;
    }
  } else {
    // First time for this user
    leaderboard.push({ username, score });
  }

  // Sort descending so highest scores first
  leaderboard.sort((a, b) => b.score - a.score);

  // Persist **everyone**’s best
  try {
    saveLeaderboard();
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Failed to save leaderboard:', err);
    res.status(500).json({ error: 'Could not save leaderboard' });
  }
});

// 2) Fetch the top-10 only
app.get('/flappy_quakks/leaderboard', (req, res) => {
  // Send back the first 10 entries
  res.json(leaderboard.slice(0, 10));
});

// ── Start HTTP Server ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Bot & web server listening on port ${PORT}`);
  console.log(`   • Game URL:       ${GAME_URL}`);
  console.log(`   • Leaderboard DB: ${DB_PATH}`);
});
