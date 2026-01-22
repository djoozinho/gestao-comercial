// Script para verificar e corrigir tabela pessoas
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'gestao_comercial.db');
const db = new Database(dbPath);

// Verificar estrutura atual
const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'pessoas'").get();
console.log('Estrutura atual da tabela pessoas:');
console.log(tableInfo.sql);
console.log('\n');

// Verificar se precisa recriar a tabela
if (tableInfo.sql.includes("CHECK(type IN ('Cliente', 'Fornecedor'))")) {
  console.log('⚠️  Tabela pessoas tem constraint antiga. Recriando...\n');
  
  // Backup dos dados
  const pessoas = db.prepare('SELECT * FROM pessoas').all();
  console.log(`📦 Backup: ${pessoas.length} registros`);
  
  // Dropar tabela antiga
  db.exec('DROP TABLE IF EXISTS pessoas_old');
  db.exec('ALTER TABLE pessoas RENAME TO pessoas_old');
  
  // Criar nova tabela com constraint correta
  db.exec(`
    CREATE TABLE pessoas (
      id TEXT PRIMARY KEY,
      code TEXT,
      name TEXT NOT NULL,
      fantasy_name TEXT,
      legal_type TEXT DEFAULT 'PF',
      type TEXT CHECK(type IN ('Cliente', 'Fornecedor', 'Funcionário', 'Outro')),
      document TEXT,
      rg_ie TEXT,
      birth_date DATE,
      gender TEXT,
      email TEXT,
      phone TEXT,
      phone2 TEXT,
      cep TEXT,
      street TEXT,
      number TEXT,
      complement TEXT,
      neighborhood TEXT,
      city TEXT,
      state TEXT,
      reference TEXT,
      address TEXT,
      notes TEXT,
      photo TEXT,
      hire_date DATE,
      position TEXT,
      department_id TEXT,
      salary REAL DEFAULT 0,
      commission_percent REAL DEFAULT 0,
      pix_key TEXT,
      bank_name TEXT,
      bank_agency TEXT,
      bank_account TEXT,
      work_schedule TEXT,
      seller_code TEXT,
      active INTEGER DEFAULT 1,
      contact_name TEXT,
      contact_phone TEXT,
      payment_terms TEXT,
      credit_limit REAL DEFAULT 0,
      supplier_category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Nova tabela criada');
  
  // Restaurar dados
  for (const p of pessoas) {
    try {
      db.prepare(`
        INSERT INTO pessoas (id, code, name, fantasy_name, legal_type, type, document, rg_ie, birth_date, gender, 
          email, phone, phone2, cep, street, number, complement, neighborhood, city, state, reference, address, notes, photo, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        p.id, p.code, p.name, p.fantasy_name, p.legal_type || 'PF', p.type, p.document, p.rg_ie, p.birth_date, p.gender,
        p.email, p.phone, p.phone2, p.cep, p.street, p.number, p.complement, p.neighborhood, p.city, p.state, 
        p.reference, p.address, p.notes, p.photo, p.created_at
      );
    } catch (e) {
      console.log(`⚠️  Erro ao migrar ${p.name}: ${e.message}`);
    }
  }
  console.log('✅ Dados restaurados');
  
  // Dropar tabela antiga
  db.exec('DROP TABLE pessoas_old');
  console.log('✅ Tabela antiga removida');
  
} else {
  console.log('✅ Tabela pessoas já está atualizada');
}

// Verificar nova estrutura
const newInfo = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'pessoas'").get();
console.log('\nNova estrutura:');
console.log(newInfo.sql);

db.close();
console.log('\n✅ Concluído!');
