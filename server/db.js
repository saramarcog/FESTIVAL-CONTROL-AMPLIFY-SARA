const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// Ensure data directory exists
const dataDir = path.resolve(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'festival.db');
console.log(`[Database] Inicializando base de datos SQLite en: ${dbPath}`);

const db = new DatabaseSync(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    artist TEXT NOT NULL,
    space TEXT NOT NULL,
    time TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('CONFIRMED', 'DELAYED', 'CANCELLED')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Initial seed data if table is empty
const countStmt = db.prepare('SELECT COUNT(*) as count FROM events');
const result = countStmt.get();

if (result && result.count === 0) {
  console.log('[Database] Tabla de eventos vacía. Insertando eventos iniciales de demostración...');
  const initialEvents = [
    { id: 'EVT-101', artist: 'NEON WAVES', space: 'MAIN STAGE', time: '22:30', status: 'CONFIRMED' },
    { id: 'EVT-102', artist: 'MIDNIGHT SESSION', space: 'GARDEN', time: '23:15', status: 'DELAYED' },
    { id: 'EVT-103', artist: 'ELECTRIC SUNSET', space: 'MAIN STAGE', time: '20:15', status: 'CONFIRMED' },
    { id: 'EVT-104', artist: 'BASS THEORY', space: 'WAREHOUSE', time: '00:30', status: 'CONFIRMED' }
  ];

  const insertStmt = db.prepare(`
    INSERT INTO events (id, artist, space, time, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const event of initialEvents) {
    insertStmt.run(event.id, event.artist, event.space, event.time, event.status);
  }
  console.log(`[Database] ${initialEvents.length} eventos iniciales guardados con éxito.`);
}

// Queries
const dbQueries = {
  getAll: (search = '', space = '') => {
    let sql = 'SELECT id, artist, space, time, status, created_at, updated_at FROM events WHERE 1=1';
    const params = [];

    if (space && space !== 'TODOS') {
      sql += ' AND space = ?';
      params.push(space);
    }

    if (search && search.trim() !== '') {
      sql += ' AND (LOWER(artist) LIKE ? OR LOWER(id) LIKE ?)';
      const term = `%${search.trim().toLowerCase()}%`;
      params.push(term, term);
    }

    sql += ' ORDER BY created_at DESC';

    return db.prepare(sql).all(...params);
  },

  getById: (id) => {
    return db.prepare('SELECT id, artist, space, time, status, created_at, updated_at FROM events WHERE id = ?').get(id) || null;
  },

  create: ({ id, artist, space, time, status }) => {
    const eventId = id || `EVT-${Date.now().toString().slice(-7)}`;
    const stmt = db.prepare(`
      INSERT INTO events (id, artist, space, time, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    stmt.run(eventId, artist.toUpperCase().trim(), space, time, status);
    return dbQueries.getById(eventId);
  },

  update: (id, { artist, space, time, status }) => {
    const existing = dbQueries.getById(id);
    if (!existing) return null;

    const newArtist = artist !== undefined ? artist.toUpperCase().trim() : existing.artist;
    const newSpace = space !== undefined ? space : existing.space;
    const newTime = time !== undefined ? time : existing.time;
    const newStatus = status !== undefined ? status : existing.status;

    const stmt = db.prepare(`
      UPDATE events
      SET artist = ?, space = ?, time = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(newArtist, newSpace, newTime, newStatus, id);
    return dbQueries.getById(id);
  },

  toggleStatus: (id) => {
    const existing = dbQueries.getById(id);
    if (!existing) return null;

    const nextStatus = 
      existing.status === 'CONFIRMED' ? 'DELAYED' :
      existing.status === 'DELAYED' ? 'CANCELLED' : 'CONFIRMED';

    const stmt = db.prepare(`
      UPDATE events
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(nextStatus, id);
    return dbQueries.getById(id);
  },

  delete: (id) => {
    const existing = dbQueries.getById(id);
    if (!existing) return false;

    db.prepare('DELETE FROM events WHERE id = ?').run(id);
    return true;
  }
};

module.exports = { db, dbQueries };
