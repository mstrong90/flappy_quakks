// bot.js

require('dotenv').config();

const express       = require('express');
const path          = require('path');
const TelegramBot   = require('node-telegram-bot-api');

// ── Config from .env ───────────────────────────────────────────────────────────
const TOKEN    = process.env.BOT_TOKEN;
const GAME_URL = process.env.GAME_URL;
const PORT     = process.env.PORT || 3000;

// ── In‑memory top‑10 leaderboard ──────────────────────────────────────────────
const leaderboard = [];

// ── Telegram Bot Setup ────────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });

// When user sends /start, show a “Play Flappy Quakks” button
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    'Welcome to 🦆 Flappy Quakks!\nTap below to begin.',
    {
      reply_markup: {
        inline_keyboard: [[
          {
            text: '▶️ Play Flappy Quakks',
            web_app: { url: process.env.GAME_URL }
          }
        ]]
      }
    }
  );
});


// When they tap that button, answerCallbackQuery opens your Web App
bot.on('callback_query', (query) => {
  bot.answerCallbackQuery(query.id, { url: GAME_URL });
});


// ── Express Server Setup ──────────────────────────────────────────────────────
const app = express();

// JSON parsing for our score‑submit endpoint
app.use(express.json());

// right before your app.use('/flappy_quakks', express.static(...))
app.use((req, res, next) => {
  console.log('HTTP', req.method, req.url);
  next();
});


// Serve your game’s static files from public/flappy_quakks
app.use(
  '/flappy_quakks',
  express.static(path.join(__dirname, 'public', 'flappy_quakks'))
);

// ── Leaderboard Endpoints ─────────────────────────────────────────────────────

// Submit a new score:
//   { username: '@foo', score: 42 }
app.post('/flappy_quakks/submit', (req, res) => {
  const { username, score } = req.body;
  if (typeof username !== 'string' || typeof score !== 'number') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  // Update existing or insert
  const existing = leaderboard.find(e => e.username === username);
  if (existing) {
    if (score > existing.score) existing.score = score;
  } else {
    leaderboard.push({ username, score });
  }
  // Sort descending, keep top 10
  leaderboard.sort((a, b) => b.score - a.score);
  if (leaderboard.length > 10) leaderboard.length = 10;

  res.json({ status: 'ok' });
});

// Fetch current top‑10
app.get('/flappy_quakks/leaderboard', (req, res) => {
  res.json(leaderboard);
});

// ── Start HTTP Server ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Running in development mode`);
  console.log(`Game URL: ${GAME_URL}`);
  console.log(`HTTP server listening on port ${PORT}`);
});
