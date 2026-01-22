// Script de migração para cadastros principais
const db = require('./database');

async function migrate() {
  console.log('🔄 Iniciando migração de Cadastros Principais...\n');
  
  await db.initializeDatabase();
  const dbType = db.getDatabaseType();
  console.log('📦 Tipo de banco:', dbType);
  
  try {
    // Criar tabela departamentos
    if (dbType === 'sqlite') {
      await db.query(`CREATE TABLE IF NOT EXISTS departamentos (
        id TEXT PRIMARY KEY,
        code TEXT,
        name TEXT NOT NULL,
        parent_id TEXT DEFAULT NULL,
        level TEXT DEFAULT 'departamento',
        description TEXT,
        margin_percent REAL DEFAULT 0.00,
        commission_percent REAL DEFAULT 0.00,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
    } else {
      await db.query(`CREATE TABLE IF NOT EXISTS departamentos (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(20),
        name VARCHAR(100) NOT NULL,
        parent_id VARCHAR(36) DEFAULT NULL,
        level ENUM('departamento', 'grupo', 'subgrupo') DEFAULT 'departamento',
        description TEXT,
        margin_percent DECIMAL(5,2) DEFAULT 0.00,
        commission_percent DECIMAL(5,2) DEFAULT 0.00,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_code (code),
        INDEX idx_name (name),
        INDEX idx_parent (parent_id),
        INDEX idx_level (level),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    console.log('✅ Tabela departamentos criada');
    
    // Inserir departamentos de exemplo
    const depts = await db.query('SELECT id FROM departamentos WHERE id = ?', ['dep_1']);
    if (!depts || depts.length === 0) {
      await db.query(`INSERT INTO departamentos (id, code, name, level, description, margin_percent) VALUES 
        (?, ?, ?, ?, ?, ?)`, ['dep_1', 'DEP01', 'Medicamentos', 'departamento', 'Medicamentos em geral', 30.00]);
      await db.query(`INSERT INTO departamentos (id, code, name, level, description, margin_percent) VALUES 
        (?, ?, ?, ?, ?, ?)`, ['dep_2', 'DEP02', 'Perfumaria', 'departamento', 'Produtos de beleza e higiene', 40.00]);
      await db.query(`INSERT INTO departamentos (id, code, name, level, description, margin_percent) VALUES 
        (?, ?, ?, ?, ?, ?)`, ['dep_3', 'DEP03', 'Conveniência', 'departamento', 'Produtos de conveniência', 50.00]);
      console.log('✅ Departamentos de exemplo inseridos');
    } else {
      console.log('ℹ️  Departamentos já existem');
    }
    
    // Inserir funcionário exemplo
    const funcs = await db.query('SELECT id FROM pessoas WHERE id = ?', ['func_1']);
    if (!funcs || funcs.length === 0) {
      try {
        await db.query(`INSERT INTO pessoas (id, code, name, type, document, email, phone) VALUES 
          (?, ?, ?, ?, ?, ?, ?)`, ['func_1', 'FUNC001', 'Carlos Vendedor', 'Funcionário', '123.456.789-00', 'carlos@empresa.com', '11999990001']);
        console.log('✅ Funcionário exemplo inserido');
      } catch (e) {
        // Tentar sem o campo code caso não exista
        await db.query(`INSERT INTO pessoas (id, name, type, document, email, phone) VALUES 
          (?, ?, ?, ?, ?, ?)`, ['func_1', 'Carlos Vendedor', 'Funcionário', '123.456.789-00', 'carlos@empresa.com', '11999990001']);
        console.log('✅ Funcionário exemplo inserido (sem code)');
      }
    } else {
      console.log('ℹ️  Funcionário já existe');
    }
    
    // Inserir fornecedor exemplo
    const forns = await db.query('SELECT id FROM pessoas WHERE id = ?', ['forn_1']);
    if (!forns || forns.length === 0) {
      try {
        await db.query(`INSERT INTO pessoas (id, code, name, fantasy_name, type, legal_type, document, email, phone) VALUES 
          (?, ?, ?, ?, ?, ?, ?, ?, ?)`, ['forn_1', 'FORN001', 'Distribuidora ABC Ltda', 'ABC Distribuidora', 'Fornecedor', 'PJ', '12.345.678/0001-90', 'vendas@abc.com', '1133334444']);
        console.log('✅ Fornecedor exemplo inserido');
      } catch (e) {
        // Tentar sem campos extras
        await db.query(`INSERT INTO pessoas (id, name, type, document, email, phone) VALUES 
          (?, ?, ?, ?, ?, ?)`, ['forn_1', 'Distribuidora ABC Ltda', 'Fornecedor', '12.345.678/0001-90', 'vendas@abc.com', '1133334444']);
        console.log('✅ Fornecedor exemplo inserido (simplificado)');
      }
    } else {
      console.log('ℹ️  Fornecedor já existe');
    }
    
    console.log('\n✅ Migração concluída com sucesso!');
    
  } catch (err) {
    console.error('❌ Erro na migração:', err);
  }
  
  process.exit(0);
}

migrate();
