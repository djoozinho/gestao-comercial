const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'gestao_comercial.db');
const db = new Database(dbPath);
const rows = db.prepare("SELECT name, type, sql FROM sqlite_master WHERE sql LIKE '%pessoas_old%'").all();
console.log(JSON.stringify(rows, null, 2));
db.close();
