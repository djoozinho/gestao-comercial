const Database = require('better-sqlite3');
const path = require('path');

// Criar/abrir banco de dados SQLite
const dbPath = path.join(__dirname, 'gestao_comercial.db');
const db = new Database(dbPath);

// Habilitar foreign keys
db.pragma('foreign_keys = ON');

console.log('✅ Conectado ao SQLite com sucesso!');
console.log(`📊 Banco de dados: ${dbPath}`);

// Criar tabelas se não existirem
function createTables(dbInstance) {
  // Se receber um wrapper, usar a instância db interna
  const dbToUse = dbInstance?.db || dbInstance || db;
  
  if (!dbToUse) {
    throw new Error("Instância do banco de dados não fornecida para createTables.");
  }
  
  console.log('🔧 Verificando e criando tabelas no SQLite, se necessário...');

  const createTablesSQL = `
    CREATE TABLE IF NOT EXISTS pessoas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      type TEXT CHECK(type IN ('Cliente', 'Fornecedor', 'Funcionário', 'Outro')),
      address TEXT,
      document TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS produtos (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT UNIQUE,
      price REAL NOT NULL DEFAULT 0,
      cost REAL,
      stock INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 0,
      category TEXT,
      description TEXT,
      barcode TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS vendas (
      id TEXT PRIMARY KEY,
      client_name TEXT,
      client_phone TEXT,
      client_email TEXT,
      subtotal REAL NOT NULL,
      discount REAL DEFAULT 0,
      total REAL NOT NULL,
      payment_method TEXT,
      amount_paid REAL,
      change_amount REAL,
      notes TEXT,
      sale_date DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS vendas_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT NOT NULL,
      product_sku TEXT,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES vendas(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES produtos(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS transacoes (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      due_date DATE NOT NULL,
      description TEXT,
      person TEXT,
      value REAL NOT NULL,
      value_due REAL,
      paid BOOLEAN DEFAULT FALSE,
      status TEXT CHECK(status IN ('pago', 'pendente', 'atrasado', 'cancelado')),
      payment_date DATE,
      payment_method TEXT,
      notes TEXT,
      type TEXT,
      quantity REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabela de recibos / receipts
    CREATE TABLE IF NOT EXISTS receipts (
      id VARCHAR(36) PRIMARY KEY,
      transaction_id VARCHAR(36) NOT NULL,
      amount REAL NOT NULL,
      method VARCHAR(50),
      note TEXT,
      created_by VARCHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES transacoes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_receipts_transaction ON receipts(transaction_id);
    CREATE TABLE IF NOT EXISTS agenda (
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
    CREATE TABLE IF NOT EXISTS empresas (
      id VARCHAR(36) PRIMARY KEY,
      razao_social VARCHAR(255) NOT NULL,
      nome_fantasia VARCHAR(255),
      cnpj VARCHAR(20),
      inscricao_estadual VARCHAR(20),
      inscricao_municipal VARCHAR(20),
      endereco VARCHAR(255),
      numero VARCHAR(20),
      bairro VARCHAR(100),
      cidade VARCHAR(100),
      uf VARCHAR(2),
      cep VARCHAR(10),
      telefone VARCHAR(20),
      email VARCHAR(100),
      logo TEXT,
      status INTEGER DEFAULT 1,
      -- Campos de personalização/branding
      login_background TEXT,
      login_slogan VARCHAR(255),
      primary_color VARCHAR(20) DEFAULT '#6f42c1',
      secondary_color VARCHAR(20) DEFAULT '#5a32a3',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabela de usuários / perfis
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE,
      role VARCHAR(50),
      active INTEGER DEFAULT 1,
      permissions TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabela de integrações
    CREATE TABLE IF NOT EXISTS integracoes (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(100),
      config TEXT,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabela de regras de estoque
    CREATE TABLE IF NOT EXISTS estoque (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      min REAL DEFAULT 0,
      max REAL DEFAULT 0,
      reorder REAL DEFAULT 0,
      turnover REAL DEFAULT 0,
      inventory VARCHAR(50),
      alert_enabled INTEGER DEFAULT 1,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabela financeiro (planos, categorias, contas bancárias, centros de custo)
    CREATE TABLE IF NOT EXISTS financeiro (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50),
      resource VARCHAR(50),
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabela comissões e metas
    CREATE TABLE IF NOT EXISTS comissoes (
      id VARCHAR(36) PRIMARY KEY,
      vendor_name VARCHAR(255),
      percent REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      target REAL DEFAULT 0,
      period VARCHAR(50),
      paid INTEGER DEFAULT 0,
      rank INTEGER DEFAULT 0,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabela de parâmetros fiscais
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
    );

    -- Tabela de configurações NF-e/NFC-e/SAT
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
    );

    -- Tabela de credenciais SNGPC
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
    );

    -- Tabela de regras de PDV
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
    );

    -- Tabela de notas fiscais emitidas
    CREATE TABLE IF NOT EXISTS notas_fiscais (
      id TEXT PRIMARY KEY,
      tipo TEXT DEFAULT 'NFC-e' CHECK(tipo IN ('NF-e', 'NFC-e', 'SAT')),
      serie TEXT DEFAULT '1',
      numero INTEGER NOT NULL,
      chave_acesso TEXT,
      protocolo TEXT,
      ambiente TEXT DEFAULT 'homologacao' CHECK(ambiente IN ('producao', 'homologacao')),
      status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente', 'autorizada', 'cancelada', 'rejeitada', 'inutilizada')),
      venda_id TEXT,
      destinatario_cpf_cnpj TEXT,
      destinatario_nome TEXT,
      destinatario_ie TEXT,
      destinatario_endereco TEXT,
      destinatario_numero TEXT,
      destinatario_bairro TEXT,
      destinatario_cep TEXT,
      destinatario_cidade TEXT,
      destinatario_uf TEXT,
      destinatario_telefone TEXT,
      destinatario_email TEXT,
      subtotal REAL DEFAULT 0,
      desconto REAL DEFAULT 0,
      total_icms REAL DEFAULT 0,
      total_pis REAL DEFAULT 0,
      total_cofins REAL DEFAULT 0,
      total REAL DEFAULT 0,
      forma_pagamento TEXT,
      valor_pago REAL DEFAULT 0,
      troco REAL DEFAULT 0,
      info_fisco TEXT,
      info_consumidor TEXT,
      xml TEXT,
      danfe_url TEXT,
      motivo_cancelamento TEXT,
      data_emissao TEXT DEFAULT CURRENT_TIMESTAMP,
      data_autorizacao TEXT,
      data_cancelamento TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabela de itens das notas fiscais
    CREATE TABLE IF NOT EXISTS notas_fiscais_itens (
      id TEXT PRIMARY KEY,
      nota_fiscal_id TEXT NOT NULL,
      produto_id TEXT,
      codigo TEXT,
      nome TEXT NOT NULL,
      ncm TEXT,
      cfop TEXT DEFAULT '5102',
      unidade TEXT DEFAULT 'UN',
      quantidade REAL DEFAULT 1,
      valor_unitario REAL DEFAULT 0,
      valor_total REAL DEFAULT 0,
      cst_icms TEXT,
      aliq_icms REAL DEFAULT 0,
      valor_icms REAL DEFAULT 0,
      cst_pis TEXT,
      aliq_pis REAL DEFAULT 0,
      valor_pis REAL DEFAULT 0,
      cst_cofins TEXT,
      aliq_cofins REAL DEFAULT 0,
      valor_cofins REAL DEFAULT 0,
      FOREIGN KEY (nota_fiscal_id) REFERENCES notas_fiscais(id) ON DELETE CASCADE
    );

    -- Tabela de numeração inutilizada
    CREATE TABLE IF NOT EXISTS nfe_inutilizadas (
      id TEXT PRIMARY KEY,
      tipo TEXT DEFAULT 'NFC-e' CHECK(tipo IN ('NF-e', 'NFC-e')),
      modelo TEXT DEFAULT '65',
      serie TEXT DEFAULT '1',
      numero_inicio INTEGER NOT NULL,
      numero_fim INTEGER NOT NULL,
      justificativa TEXT NOT NULL,
      protocolo TEXT,
      data_inutilizacao TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabela de orçamentos / OS
    CREATE TABLE IF NOT EXISTS orcamentos (
      id TEXT PRIMARY KEY,
      numero INTEGER,
      client TEXT,
      client_id TEXT,
      total REAL DEFAULT 0,
      status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente', 'aprovado', 'rejeitado', 'convertido')),
      validade DATE,
      obs TEXT,
      items TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabela de backups
    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      path TEXT,
      tipo TEXT DEFAULT 'manual' CHECK(tipo IN ('manual', 'automatico')),
      status TEXT DEFAULT 'completo' CHECK(status IN ('completo', 'em_andamento', 'erro')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabela de tickets de suporte
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      numero INTEGER,
      subject TEXT NOT NULL,
      priority TEXT DEFAULT 'Baixa' CHECK(priority IN ('Baixa', 'Média', 'Alta')),
      status TEXT DEFAULT 'Aberto' CHECK(status IN ('Aberto', 'Em Andamento', 'Resolvido', 'Fechado')),
      desc TEXT,
      user_id TEXT,
      user_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  
  `;
  
  try {
    dbToUse.exec(createTablesSQL);

    // Verificar e aplicar migrações simples para a tabela produtos (caso exista sem colunas novas)
    try {
      const info = dbToUse.prepare("PRAGMA table_info(produtos)").all();
      const cols = info.map(c => c.name);

      const productMigrations = [
        { name: 'code', sql: "ALTER TABLE produtos ADD COLUMN code VARCHAR(50)" },
        { name: 'unit', sql: "ALTER TABLE produtos ADD COLUMN unit VARCHAR(10) DEFAULT 'UN'" },
        { name: 'short_description', sql: "ALTER TABLE produtos ADD COLUMN short_description VARCHAR(100)" },
        { name: 'sub_category', sql: "ALTER TABLE produtos ADD COLUMN sub_category VARCHAR(100)" },
        { name: 'brand', sql: "ALTER TABLE produtos ADD COLUMN brand VARCHAR(100)" },
        { name: 'photo', sql: "ALTER TABLE produtos ADD COLUMN photo TEXT" },
        { name: 'margin', sql: "ALTER TABLE produtos ADD COLUMN margin REAL DEFAULT 0" },
        // Colunas de impostos / NCM (migração adicional)
        { name: 'ncm', sql: "ALTER TABLE produtos ADD COLUMN ncm VARCHAR(20)" },
        { name: 'icms_value', sql: "ALTER TABLE produtos ADD COLUMN icms_value REAL DEFAULT 0" },
        { name: 'icms_rate', sql: "ALTER TABLE produtos ADD COLUMN icms_rate REAL DEFAULT 0" },
        { name: 'pis_value', sql: "ALTER TABLE produtos ADD COLUMN pis_value REAL DEFAULT 0" },
        { name: 'pis_rate', sql: "ALTER TABLE produtos ADD COLUMN pis_rate REAL DEFAULT 0" },
        { name: 'cofins_value', sql: "ALTER TABLE produtos ADD COLUMN cofins_value REAL DEFAULT 0" },
        { name: 'cofins_rate', sql: "ALTER TABLE produtos ADD COLUMN cofins_rate REAL DEFAULT 0" },
        { name: 'ipi_value', sql: "ALTER TABLE produtos ADD COLUMN ipi_value REAL DEFAULT 0" },
        { name: 'ipi_rate', sql: "ALTER TABLE produtos ADD COLUMN ipi_rate REAL DEFAULT 0" }
      ];

      for (const m of productMigrations) {
        if (!cols.includes(m.name)) {
          try {
            dbToUse.exec(m.sql);
            console.log(`✓ Coluna ${m.name} adicionada em produtos`);
          } catch (e) {
            // Erros comuns ao tentar alterar (ex.: tipo incompatível) são mostrados, mas não interrompem processo
            console.log(`• Falha ao adicionar coluna ${m.name}: ${e.message}`);
          }
        } else {
          console.log(`• Coluna ${m.name} já existe em produtos`);
        }
      }

      // MIGRAÇÕES: Verificar colunas faltantes na tabela 'pessoas' e adicioná-las se necessário
      try {
        const peopleInfo = dbToUse.prepare("PRAGMA table_info(pessoas)").all();
        const peopleCols = peopleInfo.map(c => c.name);
        const peopleMigrations = [
          { name: 'code', sql: "ALTER TABLE pessoas ADD COLUMN code VARCHAR(50)" },
          { name: 'fantasy_name', sql: "ALTER TABLE pessoas ADD COLUMN fantasy_name VARCHAR(255)" },
          { name: 'legal_type', sql: "ALTER TABLE pessoas ADD COLUMN legal_type VARCHAR(10) DEFAULT 'PF'" },
          { name: 'type', sql: "ALTER TABLE pessoas ADD COLUMN type VARCHAR(50) DEFAULT 'Cliente'" },
          { name: 'rg_ie', sql: "ALTER TABLE pessoas ADD COLUMN rg_ie VARCHAR(50)" },
          { name: 'birth_date', sql: "ALTER TABLE pessoas ADD COLUMN birth_date DATE" },
          { name: 'gender', sql: "ALTER TABLE pessoas ADD COLUMN gender VARCHAR(5)" },
          { name: 'cep', sql: "ALTER TABLE pessoas ADD COLUMN cep VARCHAR(10)" },
          { name: 'street', sql: "ALTER TABLE pessoas ADD COLUMN street VARCHAR(255)" },
          { name: 'number', sql: "ALTER TABLE pessoas ADD COLUMN number VARCHAR(20)" },
          { name: 'complement', sql: "ALTER TABLE pessoas ADD COLUMN complement VARCHAR(100)" },
          { name: 'neighborhood', sql: "ALTER TABLE pessoas ADD COLUMN neighborhood VARCHAR(100)" },
          { name: 'city', sql: "ALTER TABLE pessoas ADD COLUMN city VARCHAR(100)" },
          { name: 'state', sql: "ALTER TABLE pessoas ADD COLUMN state VARCHAR(2)" },
          { name: 'phone2', sql: "ALTER TABLE pessoas ADD COLUMN phone2 VARCHAR(50)" },
          { name: 'reference', sql: "ALTER TABLE pessoas ADD COLUMN reference VARCHAR(255)" },
          { name: 'address', sql: "ALTER TABLE pessoas ADD COLUMN address TEXT" },
          { name: 'notes', sql: "ALTER TABLE pessoas ADD COLUMN notes TEXT" },
          { name: 'photo', sql: "ALTER TABLE pessoas ADD COLUMN photo TEXT" }
        ];

        for (const m of peopleMigrations) {
          if (!peopleCols.includes(m.name)) {
            try {
              dbToUse.exec(m.sql);
              console.log(`✓ Coluna ${m.name} adicionada em pessoas`);
            } catch (e) {
              console.log(`• Falha ao adicionar coluna ${m.name} em pessoas: ${e.message}`);
            }
          } else {
            console.log(`• Coluna ${m.name} já existe em pessoas`);
          }
        }

        try { dbToUse.exec("CREATE INDEX IF NOT EXISTS idx_pessoas_code ON pessoas(code)"); console.log('✓ Índice idx_pessoas_code verificado'); } catch (e) { console.log('• Erro ao criar idx_pessoas_code:', e.message); }
      } catch (e) {
        console.log('• Não foi possível verificar/atualizar colunas de pessoas:', e.message);
      }

      // Garantir índices úteis
      try { dbToUse.exec("CREATE INDEX IF NOT EXISTS idx_code ON produtos(code)"); console.log('✓ Índice idx_code verificado'); } catch (e) { console.log('• Erro ao criar idx_code:', e.message); }
      try { dbToUse.exec("CREATE INDEX IF NOT EXISTS idx_brand ON produtos(brand)"); console.log('✓ Índice idx_brand verificado'); } catch (e) { console.log('• Erro ao criar idx_brand:', e.message); }

      // Garantir coluna 'logo' em empresas (SQLite não tem ADD COLUMN IF NOT EXISTS tradicional)
      try { dbToUse.exec("ALTER TABLE empresas ADD COLUMN logo TEXT"); console.log('✓ Coluna logo adicionada em empresas (se não existia)'); } catch (e) { console.log('• Coluna logo já existe ou não pôde ser adicionada (ignorado):', e.message); }

      // MIGRAÇÕES: Verificar colunas faltantes na tabela 'transacoes' (type, quantity)
      try {
        const transInfo = dbToUse.prepare("PRAGMA table_info(transacoes)").all();
        const transCols = transInfo.map(c => c.name);
        const transMigrations = [
          { name: 'type', sql: "ALTER TABLE transacoes ADD COLUMN type TEXT" },
          { name: 'quantity', sql: "ALTER TABLE transacoes ADD COLUMN quantity REAL" }
        ];
        for (const m of transMigrations) {
          if (!transCols.includes(m.name)) {
            try {
              dbToUse.exec(m.sql);
              console.log(`✓ Coluna ${m.name} adicionada em transacoes`);
            } catch (e) {
              console.log(`• Coluna ${m.name} já existe ou falha:`, e.message);
            }
          }
        }
      } catch (e) {
        console.log('• Não foi possível verificar/atualizar colunas de transacoes:', e.message);
      }

    } catch (e) {
      console.log('• Não foi possível verificar/atualizar colunas de produtos:', e.message);
    }

    // MIGRAÇÃO: inserir 'parcial' na constraint de status da tabela 'transacoes' se estiver faltando
    try {
      const row = dbToUse.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='transacoes'").get();
      if (row && row.sql && !/\bparcial\b/.test(row.sql)) {
        console.log("↺ Migrando tabela 'transacoes' para incluir o status 'parcial' na constraint...");
        try {
          dbToUse.exec('BEGIN TRANSACTION');
          dbToUse.exec(`
            CREATE TABLE IF NOT EXISTS transacoes_new (
              id TEXT PRIMARY KEY,
              category TEXT NOT NULL,
              due_date DATE NOT NULL,
              description TEXT,
              person TEXT,
              value REAL NOT NULL,
              value_due REAL,
              paid BOOLEAN DEFAULT 0,
              status TEXT CHECK(status IN ('pago','pendente','parcial','atrasado','cancelado')),
              payment_date DATE,
              payment_method TEXT,
              notes TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
          `);

          dbToUse.exec(`
            INSERT INTO transacoes_new (id, category, due_date, description, person, value, value_due, paid, status, payment_date, payment_method, notes, created_at)
            SELECT id, category, due_date, description, person, value, value_due, paid,
                   CASE WHEN status IS NULL THEN 'pendente' ELSE status END,
                   payment_date, payment_method, notes, created_at FROM transacoes;
          `);

          dbToUse.exec('DROP TABLE transacoes');
          dbToUse.exec('ALTER TABLE transacoes_new RENAME TO transacoes');
          dbToUse.exec('COMMIT');
          console.log("✓ Migração de 'transacoes' concluída.");
        } catch (migErr) {
          console.error("• Falha na migração de 'transacoes':", migErr && migErr.message ? migErr.message : migErr);
          try { dbToUse.exec('ROLLBACK'); } catch(e) { /* ignore */ }
        }
      }
    } catch(e) { console.log('• Não foi possível verificar a constraint de transacoes:', e.message); }

    console.log('✅ Tabelas SQLite verificadas/criadas com sucesso.');
  } catch (error) {
    console.error("❌ Erro ao criar tabelas no SQLite:", error.message);
    throw error;
  }
}

// Inicializar banco
createTables(db);

// Função para testar conexão
async function testConnection() {
  try {
    const result = db.prepare('SELECT 1 as test').get();
    console.log('✅ Teste de conexão SQLite OK');
    return true;
  } catch (error) {
    console.error('❌ Erro ao testar SQLite:', error.message);
    return false;
  }
}

// Função para executar queries (compatível com MySQL API)
async function query(sql, params = []) {
  try {
    // Converter booleanos para inteiros (SQLite não suporta boolean nativo)
    const convertedParams = params.map(param => {
      if (typeof param === 'boolean') {
        return param ? 1 : 0;
      }
      return param;
    });
    
    // Converter placeholders MySQL (?) para SQLite
    const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
    
    if (isSelect) {
      const stmt = db.prepare(sql);
      const results = convertedParams.length > 0 ? stmt.all(...convertedParams) : stmt.all();
      return results;
    } else {
      const stmt = db.prepare(sql);
      const result = convertedParams.length > 0 ? stmt.run(...convertedParams) : stmt.run();
      return {
        affectedRows: result.changes,
        insertId: result.lastInsertRowid
      };
    }
  } catch (error) {
    console.error('Erro na query SQLite:', error.message);
    console.error('SQL:', sql);
    console.error('Params:', params);
    throw error;
  }
}

// Função para transações
async function transaction(callback) {
  const transactionWrapper = db.transaction((cb) => {
    return cb({
      execute: async (sql, params) => {
        const stmt = db.prepare(sql);
        return params.length > 0 ? stmt.run(...params) : stmt.run();
      }
    });
  });

  try {
    return transactionWrapper(callback);
  } catch (error) {
    throw error;
  }
}

module.exports = {
  query,
  transaction,
  testConnection,
  createTables, // Exportar função para criar tabelas
  db // Exportar instância para casos especiais
};
