const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'gestao_comercial.db');
console.log('📁 DB Path:', dbPath);

const db = new Database(dbPath);

function tableExists(name) {
  try {
    const r = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
    return !!r;
  } catch (e) { return false; }
}

const tables = [
  // delete children first to avoid FK issues
  'receipts',
  'vendas_itens',
  'vendas',
  'transacoes',
  'agenda',
  'pessoas',
  'produtos',
  'empresas',
  'users',
  'financeiro',
  'estoque',
  'comissoes',
  'integracoes'
];

function getCounts(list) {
  const counts = {};
  for (const t of list) {
    if (!tableExists(t)) { counts[t] = null; continue; }
    try {
      const r = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get();
      counts[t] = r ? r.c : 0;
    } catch (e) { counts[t] = null; }
  }
  return counts;
}

try {
  console.log('🔍 Contagens antes da limpeza:');
  const before = getCounts(tables);
  console.log(JSON.stringify(before, null, 2));

  console.log('⚠️ Iniciando limpeza (DELETE) dentro de TRANSACTION...');
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN TRANSACTION;');

  for (const t of tables) {
    if (!tableExists(t)) { console.log(`• Tabela '${t}' não existe — pulando`); continue; }
    console.log(`• Apagando tabela ${t}...`);
    db.prepare(`DELETE FROM ${t}`).run();
    // reset sqlite_sequence if exists (autoincrement)
    try { db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(t); } catch(e) { /* ignore */ }
  }

  db.exec('COMMIT;');
  db.exec('PRAGMA foreign_keys = ON;');

  console.log('🧹 Rodando VACUUM para compactar o banco...');
  db.exec('VACUUM;');

  console.log('🔍 Contagens após a limpeza:');
  const after = getCounts(tables);
  console.log(JSON.stringify(after, null, 2));

  console.log('✅ Limpeza concluída com sucesso.');
  process.exit(0);
} catch (error) {
  console.error('❌ Erro durante a limpeza:', error && error.message ? error.message : error);
  try { db.exec('ROLLBACK;'); } catch (e) {}
  process.exit(1);
} finally {
  try { db.close(); } catch (e) {}
}
