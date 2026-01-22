/**
 * Migração para adicionar campos de branding/personalização à tabela empresas
 * Execução: node server/migrate-branding.js
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const TENANTS_DIR = path.join(__dirname, 'tenants');

// Colunas a adicionar
const COLUMNS_TO_ADD = [
  { name: 'login_background', type: 'TEXT' },
  { name: 'login_slogan', type: 'VARCHAR(255)' },
  { name: 'primary_color', type: 'VARCHAR(20)', default: "'#6f42c1'" },
  { name: 'secondary_color', type: 'VARCHAR(20)', default: "'#5a32a3'" }
];

function columnExists(db, tableName, columnName) {
  const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return tableInfo.some(col => col.name === columnName);
}

function migrateDatabase(dbPath) {
  console.log(`\n📦 Migrando: ${dbPath}`);
  
  try {
    const db = new Database(dbPath);
    
    // Verificar se tabela empresas existe
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='empresas'").get();
    
    if (!tableExists) {
      console.log('  ⚠️ Tabela empresas não existe, pulando...');
      db.close();
      return;
    }
    
    let addedColumns = 0;
    
    for (const col of COLUMNS_TO_ADD) {
      if (!columnExists(db, 'empresas', col.name)) {
        const defaultClause = col.default ? ` DEFAULT ${col.default}` : '';
        const sql = `ALTER TABLE empresas ADD COLUMN ${col.name} ${col.type}${defaultClause}`;
        
        try {
          db.exec(sql);
          console.log(`  ✅ Coluna '${col.name}' adicionada`);
          addedColumns++;
        } catch (err) {
          console.error(`  ❌ Erro ao adicionar '${col.name}':`, err.message);
        }
      } else {
        console.log(`  ⏭️ Coluna '${col.name}' já existe`);
      }
    }
    
    db.close();
    
    if (addedColumns > 0) {
      console.log(`  🎉 ${addedColumns} coluna(s) adicionada(s)`);
    } else {
      console.log('  ✨ Banco já está atualizado');
    }
    
  } catch (error) {
    console.error(`  ❌ Erro ao migrar ${dbPath}:`, error.message);
  }
}

function main() {
  console.log('🚀 Migração de Branding - Iniciando...');
  console.log('=' .repeat(50));
  
  // Migrar banco principal (se existir)
  const mainDbPath = path.join(__dirname, 'database.sqlite');
  if (fs.existsSync(mainDbPath)) {
    migrateDatabase(mainDbPath);
  }
  
  // Migrar banco gestao_comercial.db (banco principal alternativo)
  const gestaoDbPath = path.join(__dirname, 'gestao_comercial.db');
  if (fs.existsSync(gestaoDbPath)) {
    migrateDatabase(gestaoDbPath);
  }
  
  // Migrar todos os bancos de tenants
  if (fs.existsSync(TENANTS_DIR)) {
    const tenantFiles = fs.readdirSync(TENANTS_DIR).filter(f => f.endsWith('.sqlite') || f.endsWith('.db'));
    
    console.log(`\n📂 Encontrados ${tenantFiles.length} banco(s) de tenant(s)`);
    
    for (const file of tenantFiles) {
      migrateDatabase(path.join(TENANTS_DIR, file));
    }
  } else {
    console.log('\n📂 Pasta de tenants não encontrada');
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('✅ Migração concluída!');
}

main();
