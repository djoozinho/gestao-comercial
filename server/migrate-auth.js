/**
 * Migração para adicionar colunas faltantes nas tabelas de autenticação
 * Execute com: node server/migrate-auth.js
 */

const path = require('path');
const sqlite3 = require('better-sqlite3');

const dbPath = path.join(__dirname, 'gestao_comercial.db');
const db = new sqlite3(dbPath);

console.log('📦 Iniciando migração de autenticação...\n');

// Função para adicionar coluna se não existir
function addColumnIfNotExists(table, column, definition) {
    try {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all();
        const exists = columns.some(c => c.name === column);
        
        if (!exists) {
            db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
            console.log(`✅ Coluna ${column} adicionada à tabela ${table}`);
        } else {
            console.log(`• Coluna ${column} já existe em ${table}`);
        }
    } catch (e) {
        console.log(`⚠️  Erro ao adicionar ${column} em ${table}: ${e.message}`);
    }
}

// Verificar se as tabelas existem
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
console.log('Tabelas existentes:', tables.join(', '), '\n');

// Criar tabelas de autenticação se não existirem
console.log('--- Criando/verificando tabelas de autenticação ---\n');

try {
    // Tabela de Tenants (Empresas)
    db.prepare(`
        CREATE TABLE IF NOT EXISTS tenants (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(100) NOT NULL,
            database_name VARCHAR(255) NOT NULL,
            cnpj VARCHAR(20),
            email VARCHAR(255),
            phone VARCHAR(20),
            address TEXT,
            plan VARCHAR(50) DEFAULT 'basic',
            status VARCHAR(20) DEFAULT 'active',
            max_users INTEGER DEFAULT 5,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP
        )
    `).run();
    console.log('✅ Tabela tenants verificada');
} catch (e) {
    console.log('⚠️  Tenants:', e.message);
}

try {
    // Tabela de Usuários com autenticação
    db.prepare(`
        CREATE TABLE IF NOT EXISTS auth_users (
            id VARCHAR(36) PRIMARY KEY,
            tenant_id VARCHAR(36),
            username VARCHAR(100) NOT NULL,
            email VARCHAR(255),
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'user',
            permissions TEXT,
            active INTEGER DEFAULT 1,
            must_change_password INTEGER DEFAULT 0,
            last_login TIMESTAMP,
            login_attempts INTEGER DEFAULT 0,
            locked_until TIMESTAMP,
            created_by VARCHAR(36),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
    console.log('✅ Tabela auth_users verificada');
} catch (e) {
    console.log('⚠️  Auth_users:', e.message);
}

// Adicionar colunas se não existirem
addColumnIfNotExists('auth_users', 'must_change_password', 'INTEGER DEFAULT 0');
addColumnIfNotExists('auth_users', 'login_attempts', 'INTEGER DEFAULT 0');
addColumnIfNotExists('auth_users', 'locked_until', 'TIMESTAMP');
addColumnIfNotExists('auth_users', 'created_by', 'VARCHAR(36)');
addColumnIfNotExists('auth_users', 'permissions', 'TEXT');

try {
    // Tabela de Sessões
    db.prepare(`
        CREATE TABLE IF NOT EXISTS auth_sessions (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            token_hash VARCHAR(255) NOT NULL,
            ip_address VARCHAR(50),
            user_agent TEXT,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
    console.log('✅ Tabela auth_sessions verificada');
} catch (e) {
    console.log('⚠️  Auth_sessions:', e.message);
}

try {
    // Tabela de Caixas por Funcionário
    db.prepare(`
        CREATE TABLE IF NOT EXISTS caixas_funcionarios (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            tenant_id VARCHAR(36) NOT NULL,
            data_abertura DATE NOT NULL,
            hora_abertura TIME NOT NULL,
            valor_inicial DECIMAL(10,2) DEFAULT 0,
            valor_final DECIMAL(10,2),
            hora_fechamento TIME,
            status VARCHAR(20) DEFAULT 'aberto',
            observacoes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
    console.log('✅ Tabela caixas_funcionarios verificada');
} catch (e) {
    console.log('⚠️  Caixas_funcionarios:', e.message);
}

try {
    // Tabela de Movimentações do Caixa
    db.prepare(`
        CREATE TABLE IF NOT EXISTS movimentos_caixa (
            id VARCHAR(36) PRIMARY KEY,
            caixa_id VARCHAR(36) NOT NULL,
            user_id VARCHAR(36) NOT NULL,
            tenant_id VARCHAR(36) NOT NULL,
            tipo VARCHAR(20) NOT NULL,
            valor DECIMAL(10,2) NOT NULL,
            forma_pagamento VARCHAR(50),
            descricao TEXT,
            venda_id VARCHAR(36),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
    console.log('✅ Tabela movimentos_caixa verificada');
} catch (e) {
    console.log('⚠️  Movimentos_caixa:', e.message);
}

try {
    // Tabela de Log de Auditoria
    db.prepare(`
        CREATE TABLE IF NOT EXISTS auth_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id VARCHAR(36),
            user_id VARCHAR(36),
            action VARCHAR(100) NOT NULL,
            details TEXT,
            ip_address VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
    console.log('✅ Tabela auth_audit_log verificada');
} catch (e) {
    console.log('⚠️  Auth_audit_log:', e.message);
}

// Criar índice único para username
try {
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_username ON auth_users(username)').run();
    console.log('✅ Índice único de username criado');
} catch (e) {
    if (!e.message.includes('already exists')) {
        console.log('⚠️  Índice username:', e.message);
    }
}

db.close();

console.log('\n📦 Migração de autenticação concluída!');
console.log('\n👉 Agora execute: npm run dev');
