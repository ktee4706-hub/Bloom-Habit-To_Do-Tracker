/**
 * SQLite Database Adapter for Bloom
 * Uses Node.js 22+ built-in node:sqlite (DatabaseSync)
 * Local zero-configuration database with automatic file & table initialization
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'data', 'app.db');

let db = null;
let isConnected = false;
let connectionError = null;

function initDb() {
  try {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA journal_mode = WAL;');

    // Auto-create tables (Zero sample data created!)
    db.exec(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        google_id TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        picture TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        last_login TEXT DEFAULT (datetime('now'))
      );

      -- Persistent 30-day Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );

      -- Habits table (Starts completely empty for all users)
      CREATE TABLE IF NOT EXISTS habits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        category TEXT DEFAULT 'Daily',
        icon TEXT DEFAULT '🌱',
        color TEXT DEFAULT 'sage',
        streak INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        completed_dates TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- To-Dos table (Starts completely empty for all users)
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        priority TEXT DEFAULT 'medium',
        category TEXT DEFAULT 'General',
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );

      -- User UI Settings table
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        theme TEXT DEFAULT 'light',
        sound_enabled INTEGER DEFAULT 1,
        confetti_enabled INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Performance Indices
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id);
      CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
    `);

    isConnected = true;
    connectionError = null;
    console.log(`✅ SQLite connected successfully at: ${DB_PATH}`);
    return true;
  } catch (err) {
    isConnected = false;
    connectionError = err.message;
    console.error('❌ Failed to initialize SQLite database:', err);
    return false;
  }
}

// User Operations
function findOrCreateUser(googleProfile) {
  const { sub, email, name, picture } = googleProfile;
  const userId = 'usr_' + crypto.createHash('sha256').update(sub).digest('hex').slice(0, 16);

  const existing = db.prepare('SELECT * FROM users WHERE google_id = ?').get(sub);
  if (existing) {
    db.prepare(`
      UPDATE users 
      SET name = ?, email = ?, picture = ?, last_login = datetime('now')
      WHERE id = ?
    `).run(name || existing.name, email || existing.email, picture || existing.picture, existing.id);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
  }

  db.prepare(`
    INSERT INTO users (id, google_id, email, name, picture)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, sub, email || '', name || 'Google User', picture || '');

  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function getUserById(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || null;
}

// Session Operations (Persistent across refreshes & restarts)
function createSession(userId) {
  const sessionId = 'ses_' + crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sessionId, userId, expiresAt);

  return { sessionId, expiresAt };
}

function validateSession(sessionId) {
  if (!sessionId) return null;

  const row = db.prepare(`
    SELECT s.id as session_id, s.expires_at, u.*
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `).get(sessionId);

  if (!row) return null;

  return {
    sessionId: row.session_id,
    user: {
      id: row.id,
      google_id: row.google_id,
      email: row.email,
      name: row.name,
      picture: row.picture
    }
  };
}

function deleteSession(sessionId) {
  if (!sessionId) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

// Habits CRUD (Strictly user-scoped, starts empty)
function getHabits(userId) {
  const rows = db.prepare('SELECT * FROM habits WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    category: r.category,
    icon: r.icon,
    color: r.color,
    streak: r.streak || 0,
    bestStreak: r.best_streak || 0,
    completedDates: (() => {
      try { return JSON.parse(r.completed_dates || '[]'); } catch (e) { return []; }
    })(),
    createdAt: r.created_at
  }));
}

function saveHabits(userId, habits) {
  if (!Array.isArray(habits)) return;

  const habitIds = habits.map(h => h.id).filter(Boolean);

  // Remove deleted habits
  if (habitIds.length > 0) {
    const placeholders = habitIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM habits WHERE user_id = ? AND id NOT IN (${placeholders})`)
      .run(userId, ...habitIds);
  } else {
    db.prepare('DELETE FROM habits WHERE user_id = ?').run(userId);
  }

  // Upsert habits
  const upsertStmt = db.prepare(`
    INSERT INTO habits (id, user_id, title, category, icon, color, streak, best_streak, completed_dates, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      icon = excluded.icon,
      color = excluded.color,
      streak = excluded.streak,
      best_streak = excluded.best_streak,
      completed_dates = excluded.completed_dates
  `);

  for (const h of habits) {
    upsertStmt.run(
      h.id,
      userId,
      h.title,
      h.category || 'Daily',
      h.icon || '🌱',
      h.color || 'sage',
      h.streak || 0,
      h.bestStreak || 0,
      JSON.stringify(h.completedDates || []),
      h.createdAt || new Date().toISOString()
    );
  }
}

// To-Dos CRUD (Strictly user-scoped, starts empty)
function getTodos(userId) {
  const rows = db.prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    completed: Boolean(r.completed),
    priority: r.priority || 'medium',
    category: r.category || 'General',
    createdAt: r.created_at,
    completedAt: r.completed_at
  }));
}

function saveTodos(userId, todos) {
  if (!Array.isArray(todos)) return;

  const todoIds = todos.map(t => t.id).filter(Boolean);

  if (todoIds.length > 0) {
    const placeholders = todoIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM todos WHERE user_id = ? AND id NOT IN (${placeholders})`)
      .run(userId, ...todoIds);
  } else {
    db.prepare('DELETE FROM todos WHERE user_id = ?').run(userId);
  }

  const upsertStmt = db.prepare(`
    INSERT INTO todos (id, user_id, title, completed, priority, category, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = excluded.title,
      completed = excluded.completed,
      priority = excluded.priority,
      category = excluded.category,
      completed_at = excluded.completed_at
  `);

  for (const t of todos) {
    upsertStmt.run(
      t.id,
      userId,
      t.title,
      t.completed ? 1 : 0,
      t.priority || 'medium',
      t.category || 'General',
      t.createdAt || new Date().toISOString(),
      t.completedAt || null
    );
  }
}

// User Settings
function getUserSettings(userId) {
  const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  if (row) {
    return {
      theme: row.theme,
      soundEnabled: Boolean(row.sound_enabled),
      confettiEnabled: Boolean(row.confetti_enabled)
    };
  }
  return { theme: 'light', soundEnabled: true, confettiEnabled: true };
}

function saveUserSettings(userId, settings) {
  db.prepare(`
    INSERT INTO user_settings (user_id, theme, sound_enabled, confetti_enabled, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT (user_id) DO UPDATE SET
      theme = excluded.theme,
      sound_enabled = excluded.sound_enabled,
      confetti_enabled = excluded.confetti_enabled,
      updated_at = datetime('now')
  `).run(
    userId,
    settings.theme || 'light',
    settings.soundEnabled !== false ? 1 : 0,
    settings.confettiEnabled !== false ? 1 : 0
  );
}

// Health check database status
function getDbStatus() {
  if (!isConnected || !db) {
    return {
      status: 'disconnected',
      engine: 'SQLite',
      path: DB_PATH,
      error: connectionError
    };
  }

  try {
    const ping = db.prepare('SELECT 1 as ok').get();
    const userCount = db.prepare('SELECT count(*) as c FROM users').get().c;
    const habitCount = db.prepare('SELECT count(*) as c FROM habits').get().c;
    const todoCount = db.prepare('SELECT count(*) as c FROM todos').get().c;
    const sessionCount = db.prepare('SELECT count(*) as c FROM sessions').get().c;

    let fileSizeBytes = 0;
    try {
      if (fs.existsSync(DB_PATH)) {
        fileSizeBytes = fs.statSync(DB_PATH).size;
      }
    } catch (e) {}

    return {
      status: 'connected',
      engine: 'SQLite',
      path: DB_PATH,
      healthy: ping.ok === 1,
      fileSizeBytes,
      stats: {
        users: userCount,
        habits: habitCount,
        todos: todoCount,
        sessions: sessionCount
      }
    };
  } catch (err) {
    return {
      status: 'error',
      engine: 'SQLite',
      path: DB_PATH,
      error: err.message
    };
  }
}

module.exports = {
  initDb,
  findOrCreateUser,
  getUserById,
  createSession,
  validateSession,
  deleteSession,
  getHabits,
  saveHabits,
  getTodos,
  saveTodos,
  getUserSettings,
  saveUserSettings,
  getDbStatus
};
