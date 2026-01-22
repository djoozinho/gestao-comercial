/**
 * Correção da tabela auth_users para permitir superadmin sem tenant
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const db = new sqlite3(path.join(__dirname, 'gestao_comercial.db'));

console.log('🔧 Corrigindo tabela auth_users...\n');

try {
    // Backup dos dados existentes
    const users = db.prepare('SELECT * FROM auth_users').all();
    console.log(`Usuários existentes: ${users.length}`);
    
    // Dropar e recriar tabela sem NOT NULL em tenant_id
    db.exec('DROP TABLE IF EXISTS auth_users_backup');
    db.exec('ALTER TABLE auth_users RENAME TO auth_users_backup');
    
    db.exec(`
        CREATE TABLE auth_users (
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
    `);
    
    console.log('✅ Tabela auth_users recriada');
    
    // Reinsert data
    if (users.length > 0) {
        const insert = db.prepare(`
            INSERT INTO auth_users 
            (id, tenant_id, username, email, password_hash, name, role, permissions, active, must_change_password, last_login, login_attempts, locked_until, created_by, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        for (const u of users) {
            insert.run(
                u.id, 
                u.tenant_id, 
                u.username, 
                u.email, 
                u.password_hash, 
                u.name, 
                u.role, 
                u.permissions, 
                u.active, 
                u.must_change_password || 0, 
                u.last_login, 
                u.login_attempts || 0, 
                u.locked_until, 
                u.created_by, 
                u.created_at
            );
        }
        console.log(`✅ ${users.length} usuários restaurados`);
    }
    
    db.exec('DROP TABLE IF EXISTS auth_users_backup');
    
    // Criar índice único para username
    try {
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_username ON auth_users(username)');
        console.log('✅ Índice único criado');
    } catch (e) {
        // Ignorar se já existe
    }
    
    console.log('\n✅ Correção concluída com sucesso!');
} catch (error) {
    console.error('❌ Erro:', error.message);
}

db.close();
