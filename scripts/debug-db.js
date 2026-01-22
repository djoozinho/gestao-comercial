/**
 * Debug Database - verifica triggers e views
 */

const sqlite = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'server', 'gestao_comercial.db');
const db = new sqlite(dbPath);

console.log('=== VERIFICANDO TRIGGERS ===');
const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger'").all();
console.log('Triggers encontrados:', triggers.length);
triggers.forEach(t => {
    console.log(`\nTrigger: ${t.name}`);
    console.log(t.sql);
});

console.log('\n=== VERIFICANDO VIEWS ===');
const views = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='view'").all();
console.log('Views encontradas:', views.length);
views.forEach(v => {
    console.log(`\nView: ${v.name}`);
    console.log(v.sql);
});

console.log('\n=== VERIFICANDO REFERÊNCIAS A auth_users_backup ===');
const all = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql LIKE '%auth_users_backup%'").all();
console.log('Referências encontradas:', all.length);
all.forEach(item => {
    console.log(`\n${item.type}: ${item.name}`);
    console.log(item.sql);
});

console.log('\n=== ESTRUTURA auth_sessions ===');
const sessionInfo = db.prepare("PRAGMA table_info(auth_sessions)").all();
console.log(sessionInfo);

console.log('\n=== FOREIGN KEYS auth_sessions ===');
const fks = db.prepare("PRAGMA foreign_key_list(auth_sessions)").all();
console.log(fks);

db.close();
console.log('\n✅ Debug concluído');
