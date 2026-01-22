const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'gestao_comercial.db');
const db = new Database(dbPath);

function getCreateSql(table) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(table);
  return row ? row.sql : null;
}

const sql = getCreateSql('agenda');
console.log('Agenda create SQL:');
console.log(sql);

if (sql && sql.includes('"pessoas_old"')) {
  console.log('Detected FK referencing pessoas_old. Running migration...');
  db.transaction(() => {
    // create new table with correct FK
    db.exec(`
      CREATE TABLE IF NOT EXISTS agenda_new (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        start_date DATETIME NOT NULL,
        end_date DATETIME,
        all_day BOOLEAN DEFAULT FALSE,
        location TEXT,
        person_id TEXT,
        color TEXT,
        reminder_minutes INTEGER,
        status TEXT DEFAULT 'agendado',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (person_id) REFERENCES pessoas(id) ON DELETE SET NULL
      );
    `);

    // copy data
    db.exec(`INSERT INTO agenda_new (id, title, description, start_date, end_date, all_day, location, person_id, color, reminder_minutes, status, created_at)
              SELECT id, title, description, start_date, end_date, all_day, location, person_id, color, reminder_minutes, status, created_at FROM agenda;`);

    // drop old and rename
    db.exec('DROP TABLE agenda;');
    db.exec('ALTER TABLE agenda_new RENAME TO agenda;');
  })();
  console.log('Migration completed: agenda now references pessoas');
} else {
  console.log('No migration needed: agenda FK OK');
}

db.close();
