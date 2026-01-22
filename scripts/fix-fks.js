/**
 * Fix FKs - Corrige foreign keys que apontam para auth_users_backup
 */

const sqlite = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'server', 'gestao_comercial.db');
const db = new sqlite(dbPath);

console.log('🔧 Corrigindo foreign keys...\n');

// Habilitar foreign keys
db.pragma('foreign_keys = OFF');

// Iniciar transação
db.exec('BEGIN TRANSACTION');

try {
    // === Fix auth_sessions ===
    console.log('📦 Recriando auth_sessions...');
    
    // Backup dos dados existentes
    const sessions = db.prepare('SELECT * FROM auth_sessions').all();
    console.log(`   - ${sessions.length} sessões encontradas`);
    
    // Drop a tabela antiga
    db.exec('DROP TABLE IF EXISTS auth_sessions');
    
    // Recriar com FK correta
    db.exec(`
        CREATE TABLE auth_sessions (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            token_hash VARCHAR(255) NOT NULL,
            ip_address VARCHAR(50),
            user_agent TEXT,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
        )
    `);
    
    // Restaurar dados (se houver)
    if (sessions.length > 0) {
        const insertSession = db.prepare(`
            INSERT INTO auth_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of sessions) {
            try {
                insertSession.run(s.id, s.user_id, s.token_hash, s.ip_address, s.user_agent, s.expires_at, s.created_at);
            } catch (e) {
                console.log(`   - Sessão ignorada (user não existe): ${s.id}`);
            }
        }
    }
    console.log('   ✅ auth_sessions corrigida');

    // === Fix caixas_funcionarios ===
    console.log('📦 Recriando caixas_funcionarios...');
    
    const caixas = db.prepare('SELECT * FROM caixas_funcionarios').all();
    console.log(`   - ${caixas.length} caixas encontrados`);
    
    db.exec('DROP TABLE IF EXISTS movimentos_caixa'); // Dropar primeiro por causa da FK
    db.exec('DROP TABLE IF EXISTS caixas_funcionarios');
    
    db.exec(`
        CREATE TABLE caixas_funcionarios (
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        )
    `);
    
    if (caixas.length > 0) {
        const insertCaixa = db.prepare(`
            INSERT INTO caixas_funcionarios 
            (id, user_id, tenant_id, data_abertura, hora_abertura, valor_inicial, valor_final, hora_fechamento, status, observacoes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of caixas) {
            try {
                insertCaixa.run(c.id, c.user_id, c.tenant_id, c.data_abertura, c.hora_abertura, 
                    c.valor_inicial, c.valor_final, c.hora_fechamento, c.status, c.observacoes, c.created_at);
            } catch (e) {
                console.log(`   - Caixa ignorado (FK error): ${c.id}`);
            }
        }
    }
    console.log('   ✅ caixas_funcionarios corrigida');

    // === Fix movimentos_caixa ===
    console.log('📦 Recriando movimentos_caixa...');
    
    // Já foi dropada acima, apenas recriar
    db.exec(`
        CREATE TABLE movimentos_caixa (
            id VARCHAR(36) PRIMARY KEY,
            caixa_id VARCHAR(36) NOT NULL,
            user_id VARCHAR(36) NOT NULL,
            tenant_id VARCHAR(36) NOT NULL,
            tipo VARCHAR(20) NOT NULL,
            valor DECIMAL(10,2) NOT NULL,
            forma_pagamento VARCHAR(50),
            descricao TEXT,
            venda_id VARCHAR(36),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (caixa_id) REFERENCES caixas_funcionarios(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
        )
    `);
    console.log('   ✅ movimentos_caixa corrigida');

    // Commit
    db.exec('COMMIT');
    
    console.log('\n✅ Todas as foreign keys corrigidas!');
    
    // Verificar
    console.log('\n📋 Verificação:');
    const fks = db.prepare("PRAGMA foreign_key_list(auth_sessions)").all();
    console.log('auth_sessions FK:', fks.map(f => f.table).join(', '));
    
    const fks2 = db.prepare("PRAGMA foreign_key_list(caixas_funcionarios)").all();
    console.log('caixas_funcionarios FK:', fks2.map(f => f.table).join(', '));
    
    const fks3 = db.prepare("PRAGMA foreign_key_list(movimentos_caixa)").all();
    console.log('movimentos_caixa FK:', fks3.map(f => f.table).join(', '));

} catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Erro:', error);
} finally {
    db.close();
}
