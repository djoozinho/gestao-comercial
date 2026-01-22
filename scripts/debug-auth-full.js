/**
 * Debug completo do sistema de autenticação
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const sqlite = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'server', 'gestao_comercial.db');
const db = new sqlite(dbPath);

const JWT_SECRET = 'gestao-comercial-secret-key-2026-super-segura-v2';

async function testLogin(username, password) {
    console.log(`\n🔐 Testando login: ${username}`);
    console.log('='.repeat(50));
    
    try {
        // 1. Buscar usuário
        console.log('1. Executando query...');
        const users = db.prepare(`
            SELECT u.id, u.tenant_id, u.username, u.email, u.password_hash, u.name, u.role, 
                   u.permissions, u.active, u.must_change_password, u.last_login, 
                   u.login_attempts, u.locked_until, u.created_by, u.created_at,
                   t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status 
            FROM auth_users u 
            LEFT JOIN tenants t ON u.tenant_id = t.id 
            WHERE u.username = ? OR u.email = ?
        `).all(username, username);
        
        console.log(`   Encontrados: ${users.length} usuário(s)`);
        
        const user = users[0];
        if (!user) {
            console.log('   ❌ Usuário não encontrado');
            return;
        }
        
        console.log(`   Usuário: ${user.name} (${user.role})`);
        console.log(`   Active: ${user.active}`);
        console.log(`   Tenant: ${user.tenant_id || 'N/A'}`);
        
        // 2. Verificar senha
        console.log('\n2. Verificando senha...');
        const validPassword = await bcrypt.compare(password, user.password_hash);
        console.log(`   Senha válida: ${validPassword}`);
        
        if (!validPassword) {
            console.log('   ❌ Senha incorreta');
            return;
        }
        
        // 3. Gerar token
        console.log('\n3. Gerando token JWT...');
        const tokenPayload = {
            userId: user.id,
            username: user.username,
            email: user.email,
            name: user.name,
            role: user.role,
            tenantId: user.tenant_id,
            tenantSlug: user.tenant_slug
        };
        
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
        console.log(`   Token gerado: ${token.substring(0, 50)}...`);
        
        // 4. Verificar token
        console.log('\n4. Verificando token...');
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log(`   Token válido!`);
        console.log(`   Expira em: ${new Date(decoded.exp * 1000).toLocaleString()}`);
        
        console.log('\n✅ Login simulado com sucesso!');
        
    } catch (error) {
        console.log(`\n❌ Erro: ${error.message}`);
        console.log(error.stack);
    }
}

async function main() {
    console.log('🔧 Debug do Sistema de Autenticação');
    console.log('='.repeat(50));
    console.log(`Banco de dados: ${dbPath}`);
    
    await testLogin('superadmin', 'SuperAdmin@2026');
    await testLogin('admin', 'admin123');
    
    db.close();
}

main().catch(console.error);
