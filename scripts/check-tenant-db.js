const Database = require('better-sqlite3');
const db = new Database('server/tenants/tenant_casa-lima_1769056084741.db');

console.log('=== Tabelas do tenant ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log(' -', t.name));

console.log('\n=== Estrutura vendas ===');
try {
  const info = db.pragma('table_info(vendas)');
  if (info.length > 0) {
    info.forEach(c => console.log('  ', c.name, c.type, c.notnull ? 'NOT NULL' : ''));
  } else {
    console.log('  Tabela vazia ou não existe');
  }
} catch(e) {
  console.log('  Erro:', e.message);
}

console.log('\n=== Estrutura vendas_itens ===');
try {
  const info = db.pragma('table_info(vendas_itens)');
  if (info.length > 0) {
    info.forEach(c => console.log('  ', c.name, c.type, c.notnull ? 'NOT NULL' : ''));
  } else {
    console.log('  Tabela vazia ou não existe');
  }
} catch(e) {
  console.log('  Erro:', e.message);
}

console.log('\n=== Foreign Keys em vendas_itens ===');
try {
  const fks = db.pragma('foreign_key_list(vendas_itens)');
  fks.forEach(fk => console.log('  ', fk.from, '->', fk.table + '.' + fk.to));
} catch(e) {
  console.log('  Sem FKs ou erro');
}

db.close();
