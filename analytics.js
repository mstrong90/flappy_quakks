// analytics.js
const path   = require('path');
const fs     = require('fs');
const sqlite = require('sqlite3').verbose();

// Paths
const DB_PATH = path.resolve(__dirname, 'analytics.db');
const LB_PATH = path.resolve(__dirname, 'public', 'flappy_quakks', 'leaderboard.json');
const SR_PATH = path.resolve(__dirname, 'public', 'flappy_quakks', 'sr-leaderboard.json');

// Open DB
const db = new sqlite.Database(DB_PATH, err => {
  if (err) console.error('❌ Failed to open analytics.db', err);
  else console.log('✅ analytics.db ready');
});

// Initialize schema
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      username             TEXT    UNIQUE,
      classic_high_score   INTEGER DEFAULT 0,
      speed_high_score     INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS play_times (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER,
      mode      TEXT    CHECK(mode IN ('classic','speed')),
      play_time REAL,            -- duration in MINUTES
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(player_id) REFERENCES players(id)
    )
  `);
});

/**
 * Record a single play session duration.
 */
function recordPlayTime(username, mode, durationMs) {
  const minutes = durationMs / 60000;

  db.serialize(() => {
    db.run(
      `INSERT OR IGNORE INTO players(username) VALUES(?)`,
      [username]
    );

    db.run(
      `INSERT INTO play_times(player_id, mode, play_time)
       VALUES((SELECT id FROM players WHERE username = ?), ?, ?)`,
      [username, mode, minutes]
    );
  });
}

/**
 * Record or update the high score for a mode.
 */
function recordHighScore(username, mode, score) {
  db.serialize(() => {
    db.run(
      `INSERT OR IGNORE INTO players(username) VALUES(?)`, [username]
    );

    const column = mode === 'classic'
      ? 'classic_high_score'
      : 'speed_high_score';

    db.run(
      `UPDATE players
       SET ${column} = MAX(${column}, ?)
       WHERE username = ?`,
      [score, username]
    );
  });
}

/**
 * Get a summary report merging DB and JSON highs.
 */
function getAnalytics(callback) {
  const sql = `
    SELECT
      p.username,
      p.classic_high_score,
      p.speed_high_score,
      ROUND(IFNULL(SUM(CASE WHEN pt.mode='classic' THEN pt.play_time END),0), 2) AS classic_minutes,
      ROUND(IFNULL(SUM(CASE WHEN pt.mode='speed'   THEN pt.play_time END),0), 2) AS speed_minutes
    FROM players p
    LEFT JOIN play_times pt ON pt.player_id = p.id
    GROUP BY p.username
    ORDER BY p.username
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return callback(err);

    // load JSON leaderboards
    let classicBoard = [], speedBoard = [];
    try { classicBoard = JSON.parse(fs.readFileSync(LB_PATH, 'utf8')); } catch {}
    try { speedBoard   = JSON.parse(fs.readFileSync(SR_PATH, 'utf8')); } catch {}

    // override high scores with JSON values
    const merged = rows.map(r => {
      const jsonClassic = classicBoard.find(e => e.username === r.username)?.score || 0;
      const jsonSpeed   = speedBoard.find(e => e.username === r.username)?.score   || 0;
      return {
        ...r,
        classic_high_score: jsonClassic,
        speed_high_score:   jsonSpeed
      };
    });

    callback(null, merged);
  });
}

module.exports = { recordPlayTime, recordHighScore, getAnalytics };
