const mysql = require('mysql2/promise');
require('dotenv').config();

const sqlite = require('better-sqlite3');
const path = require('path');
const DateTimeUtils = require('./datetime-utils');

// --- Configurações ---
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gestao_comercial',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

const sqliteDbPath = path.join(__dirname, process.env.SQLITE_DB_NAME || 'gestao_comercial.db');

// --- Módulo do Banco de Dados ---
let db = null;

// Interface para o MySQL
const mysqlDB = {
  async connect() {
    this.pool = mysql.createPool(dbConfig);
    const conn = await this.pool.getConnection();
    conn.release();
    console.log('✅ Conectado ao MySQL com sucesso!');
    console.log(`📊 Banco de dados: ${dbConfig.database}`);
  },
  async query(sql, params) {
    const [results] = await this.pool.execute(sql, params);
    return results;
  },
  async transaction(callback) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },
  getDatabaseType: () => 'mysql',
};

// Interface para o SQLite
const sqliteDB = {
  connect() {
    this.db = new sqlite(sqliteDbPath);
    this.db.pragma('journal_mode = WAL');
    console.log('✅ Conectado ao SQLite com sucesso!');
    console.log(`📊 Banco de dados: ${sqliteDbPath}`);
  },
  query(sql, params = []) {
    // Remove whitespace do início para que a regex funcione corretamente
    const trimmedSql = sql.trim();
    
    // Converte `?` para o formato do SQLite e ajusta SQL para compatibilidade
    const stmt = this.db.prepare(trimmedSql.replace(/`/g, ''));
    
    // Converte booleanos para inteiros
    const newParams = params.map(p => {
      if (typeof p === 'boolean') return p ? 1 : 0;
      return p;
    });

    // better-sqlite3 diferencia `run` (INSERT/UPDATE/DELETE) de `all` (SELECT)
    if (/^(select|pragma)/i.test(trimmedSql)) {
      return stmt.all(newParams);
    } else {
      return stmt.run(newParams);
    }
  },
  transaction(callback) {
    // SQLite transactions são mais simples
    const runTransaction = this.db.transaction(callback);
    return runTransaction(this);
  },
  getDatabaseType: () => 'sqlite',
};

async function initializeDatabase() {
  try {
    await mysqlDB.connect();
    db = mysqlDB;
  } catch (mysqlError) {
    console.warn('⚠️  MySQL não disponível, usando SQLite como fallback.');
    console.log('💡 Para usar MySQL, instale-o e configure o arquivo .env');
    try {
      sqliteDB.connect();
      db = sqliteDB;
      await require('./database-sqlite').createTables(db); // Garante que as tabelas existam
    } catch (sqliteError) {
      console.error('❌ Falha crítica: Não foi possível conectar ao MySQL nem ao SQLite.');
      console.error('Erro SQLite:', sqliteError.message);
      process.exit(1); // Encerra se nenhum banco de dados estiver disponível
    }
  }
}

// --- Funções Exportadas ---
async function query(sql, params) {
  if (!db) throw new Error('O banco de dados não foi inicializado.');
  return db.query(sql, params);
}

async function transaction(callback) {
  if (!db) throw new Error('O banco de dados não foi inicializado.');
  return db.transaction(callback);
}

function getDatabaseType() {
    return db ? db.getDatabaseType() : null;
}

// Funções auxiliares permanecem as mesmas...
// Converte snake_case para camelCase
function toCamelCase(obj) {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  
  const newObj = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    newObj[camelKey] = obj[key];
  }
  return newObj;
}

// Converte camelCase para snake_case
function toSnakeCase(obj) {
  if (!obj) return obj;
  
  const newObj = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    newObj[snakeKey] = obj[key];
  }
  return newObj;
}

// Formata data para MySQL (YYYY-MM-DD) no fuso de Brasília
function formatDateForMySQL(dateString) {
  if (!dateString) return null;
  return DateTimeUtils.formatDateISO(dateString);
}

// Formata data/hora para MySQL (YYYY-MM-DD HH:MM:SS) no fuso de Brasília
function formatDateTimeForMySQL(dateString) {
  if (!dateString) return null;
  return DateTimeUtils.formatDateTimeISO(dateString);
}

module.exports = {
  initializeDatabase,
  query,
  transaction,
  getDatabaseType,
  toCamelCase,
  toSnakeCase,
  formatDateForMySQL,
  formatDateTimeForMySQL
};
