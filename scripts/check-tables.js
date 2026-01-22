const db = require('better-sqlite3')('c:/Users/JOAO/Desktop/SOFTWARE/server/gestao_comercial.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tabelas:', tables.map(t => t.name).join(', '));

// Verificar se auth_sessions existe
const hasAuthSessions = tables.some(t => t.name === 'auth_sessions');
console.log('auth_sessions existe:', hasAuthSessions);

if (hasAuthSessions) {
    const info = db.prepare('PRAGMA table_info(auth_sessions)').all();
    console.log('Colunas de auth_sessions:', info.map(c => c.name).join(', '));
}

db.close();
