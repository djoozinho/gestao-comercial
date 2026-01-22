/**
 * Migração das tabelas de Configurações Fiscais
 * 
 * Tabelas criadas:
 * - fiscal_params: Parâmetros fiscais (ICMS, PIS/COFINS, NCM, etc.)
 * - nfe_config: Configurações NF-e/NFC-e/SAT
 * - sngpc_credentials: Credenciais SNGPC para farmácias
 * - pdv_rules: Regras do PDV
 * 
 * Execução: node server/migrate-fiscal.js
 */

const path = require('path');
const fs = require('fs');

// Detecta o tipo de banco
const isSQLite = !process.env.MYSQL_HOST && !process.env.DB_HOST;

async function runMigration() {
  console.log('========================================');
  console.log('  Migração: Configurações Fiscais');
  console.log('========================================\n');
  
  if (isSQLite) {
    await migrateSQLite();
  } else {
    await migrateMySQL();
  }
}

// ============================================
// SQLITE MIGRATION
// ============================================
async function migrateSQLite() {
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'tenants', 'default.db');
  
  // Cria diretório se não existir
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const db = new Database(dbPath);
  console.log('[SQLite] Conectado ao banco:', dbPath);
  
  // Tabela: fiscal_params
  db.exec(`
    CREATE TABLE IF NOT EXISTS fiscal_params (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      ncm TEXT,
      cfop TEXT,
      cst_icms TEXT,
      icms_percent REAL DEFAULT 0,
      cst_pis TEXT,
      pis_percent REAL DEFAULT 0,
      cst_cofins TEXT,
      cofins_percent REAL DEFAULT 0,
      ipi_percent REAL DEFAULT 0,
      mva_percent REAL DEFAULT 0,
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Tabela fiscal_params criada/verificada');

  // Tabela: nfe_config  
  db.exec(`
    CREATE TABLE IF NOT EXISTS nfe_config (
      id TEXT PRIMARY KEY,
      tipo TEXT DEFAULT 'NFC-e' CHECK(tipo IN ('NF-e', 'NFC-e', 'SAT')),
      ambiente TEXT DEFAULT 'homologacao' CHECK(ambiente IN ('producao', 'homologacao')),
      serie TEXT,
      numero_atual INTEGER DEFAULT 1,
      certificado_path TEXT,
      certificado_senha TEXT,
      csc_id TEXT,
      csc_token TEXT,
      id_token_nfce TEXT,
      token_nfce TEXT,
      sat_codigo_ativacao TEXT,
      sat_assinatura TEXT,
      observacoes TEXT,
      ativo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Tabela nfe_config criada/verificada');

  // Tabela: sngpc_credentials
  db.exec(`
    CREATE TABLE IF NOT EXISTS sngpc_credentials (
      id TEXT PRIMARY KEY,
      usuario TEXT NOT NULL,
      senha TEXT,
      cnpj_farmacia TEXT,
      crf TEXT,
      responsavel_tecnico TEXT,
      email_contato TEXT,
      integrar_imendes INTEGER DEFAULT 0,
      imendes_token TEXT,
      ativo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Tabela sngpc_credentials criada/verificada');

  // Tabela: pdv_rules
  db.exec(`
    CREATE TABLE IF NOT EXISTS pdv_rules (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      exigir_cpf INTEGER DEFAULT 0,
      exigir_vendedor INTEGER DEFAULT 0,
      limite_desconto_percent REAL DEFAULT 0,
      permitir_desconto_gerente INTEGER DEFAULT 1,
      permitir_venda_sem_estoque INTEGER DEFAULT 0,
      solicitar_autorizacao_desconto INTEGER DEFAULT 0,
      limite_valor_autorizacao REAL DEFAULT 0,
      formas_pagamento TEXT DEFAULT '["dinheiro","cartao_credito","cartao_debito","pix"]',
      impressao_automatica INTEGER DEFAULT 1,
      abrir_gaveta_dinheiro INTEGER DEFAULT 1,
      ativo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Tabela pdv_rules criada/verificada');

  db.close();
  console.log('\n✅ Migração SQLite concluída com sucesso!');
}

// ============================================
// MYSQL MIGRATION
// ============================================
async function migrateMySQL() {
  const mysql = require('mysql2/promise');
  
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'gestao_comercial'
  });
  
  console.log('[MySQL] Conectado ao banco');

  // Tabela: fiscal_params
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS fiscal_params (
      id VARCHAR(36) PRIMARY KEY,
      description VARCHAR(255) NOT NULL,
      ncm VARCHAR(20),
      cfop VARCHAR(10),
      cst_icms VARCHAR(10),
      icms_percent DECIMAL(5,2) DEFAULT 0,
      cst_pis VARCHAR(10),
      pis_percent DECIMAL(5,2) DEFAULT 0,
      cst_cofins VARCHAR(10),
      cofins_percent DECIMAL(5,2) DEFAULT 0,
      ipi_percent DECIMAL(5,2) DEFAULT 0,
      mva_percent DECIMAL(5,2) DEFAULT 0,
      notes TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_description (description),
      INDEX idx_ncm (ncm),
      INDEX idx_active (active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✅ Tabela fiscal_params criada/verificada');

  // Tabela: nfe_config
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS nfe_config (
      id VARCHAR(36) PRIMARY KEY,
      tipo ENUM('NF-e', 'NFC-e', 'SAT') DEFAULT 'NFC-e',
      ambiente ENUM('producao', 'homologacao') DEFAULT 'homologacao',
      serie VARCHAR(10),
      numero_atual INT DEFAULT 1,
      certificado_path VARCHAR(500),
      certificado_senha VARCHAR(255),
      csc_id VARCHAR(50),
      csc_token VARCHAR(255),
      id_token_nfce VARCHAR(50),
      token_nfce VARCHAR(255),
      sat_codigo_ativacao VARCHAR(50),
      sat_assinatura TEXT,
      observacoes TEXT,
      ativo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tipo (tipo),
      INDEX idx_ambiente (ambiente),
      INDEX idx_ativo (ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✅ Tabela nfe_config criada/verificada');

  // Tabela: sngpc_credentials
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS sngpc_credentials (
      id VARCHAR(36) PRIMARY KEY,
      usuario VARCHAR(100) NOT NULL,
      senha VARCHAR(255),
      cnpj_farmacia VARCHAR(20),
      crf VARCHAR(50),
      responsavel_tecnico VARCHAR(255),
      email_contato VARCHAR(255),
      integrar_imendes BOOLEAN DEFAULT FALSE,
      imendes_token VARCHAR(255),
      ativo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_usuario (usuario),
      INDEX idx_ativo (ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✅ Tabela sngpc_credentials criada/verificada');

  // Tabela: pdv_rules
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS pdv_rules (
      id VARCHAR(36) PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      exigir_cpf BOOLEAN DEFAULT FALSE,
      exigir_vendedor BOOLEAN DEFAULT FALSE,
      limite_desconto_percent DECIMAL(5,2) DEFAULT 0,
      permitir_desconto_gerente BOOLEAN DEFAULT TRUE,
      permitir_venda_sem_estoque BOOLEAN DEFAULT FALSE,
      solicitar_autorizacao_desconto BOOLEAN DEFAULT FALSE,
      limite_valor_autorizacao DECIMAL(10,2) DEFAULT 0,
      formas_pagamento JSON DEFAULT '["dinheiro","cartao_credito","cartao_debito","pix"]',
      impressao_automatica BOOLEAN DEFAULT TRUE,
      abrir_gaveta_dinheiro BOOLEAN DEFAULT TRUE,
      ativo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_nome (nome),
      INDEX idx_ativo (ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✅ Tabela pdv_rules criada/verificada');

  await connection.end();
  console.log('\n✅ Migração MySQL concluída com sucesso!');
}

// Executa a migração
runMigration().catch(err => {
  console.error('❌ Erro na migração:', err);
  process.exit(1);
});
