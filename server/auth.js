/**
 * Sistema de Autenticação e Multi-Tenant - VERSÃO COMPLETA
 * 
 * Níveis de acesso:
 * - superadmin: Dono do sistema - gerencia empresas e seus admins
 * - admin: Administrador da empresa - gerencia funcionários
 * - gerente: Gerente - acesso avançado sem gerenciar usuários
 * - caixa: Operador de caixa - acesso ao PDV e movimentações
 * - user: Usuário comum - acesso limitado
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// Chave secreta para JWT (em produção, usar variável de ambiente)
const JWT_SECRET = process.env.JWT_SECRET || 'gestao-comercial-secret-key-2026-super-segura-v2';
const JWT_EXPIRES_IN = '24h';

// Diretório para bancos de dados dos tenants
const TENANTS_DB_DIR = path.join(__dirname, 'tenants');

// Garantir que o diretório de tenants existe
if (!fs.existsSync(TENANTS_DB_DIR)) {
    fs.mkdirSync(TENANTS_DB_DIR, { recursive: true });
}

// Cache de conexões de tenants
const tenantConnections = new Map();

let masterDb = null;

/**
 * Hierarquia de roles (quanto maior, mais permissões)
 */
const ROLE_HIERARCHY = {
    'superadmin': 100,
    'admin': 50,
    'gerente': 30,
    'caixa': 20,
    'user': 10
};

/**
 * Inicializa o banco de dados master para autenticação
 */
async function initializeMasterDb(db) {
    masterDb = db;
    
    // Criar tabelas de autenticação
    const createAuthTables = `
        -- Tabela de Tenants (Empresas/Lojas)
        CREATE TABLE IF NOT EXISTS tenants (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(100) UNIQUE NOT NULL,
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
        );
        
        -- Tabela de Usuários com autenticação
        CREATE TABLE IF NOT EXISTS auth_users (
            id VARCHAR(36) PRIMARY KEY,
            tenant_id VARCHAR(36),
            username VARCHAR(100) UNIQUE NOT NULL,
            email VARCHAR(255),
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            role VARCHAR(50) DEFAULT 'user',
            permissions TEXT,
            active INTEGER DEFAULT 1,
            must_change_password INTEGER DEFAULT 0,
            last_login TIMESTAMP,
            login_attempts INTEGER DEFAULT 0,
            locked_until TIMESTAMP,
            created_by VARCHAR(36),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );
        
        -- Tabela de Sessões
        CREATE TABLE IF NOT EXISTS auth_sessions (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            token_hash VARCHAR(255) NOT NULL,
            ip_address VARCHAR(50),
            user_agent TEXT,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
        );
        
        -- Tabela de Caixas por Funcionário
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );
        
        -- Tabela de Movimentações do Caixa do Funcionário
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (caixa_id) REFERENCES caixas_funcionarios(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
        );
        
        -- Tabela de Log de Auditoria
        CREATE TABLE IF NOT EXISTS auth_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id VARCHAR(36),
            user_id VARCHAR(36),
            action VARCHAR(100) NOT NULL,
            details TEXT,
            ip_address VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    
    // Executar cada statement separadamente
    const statements = createAuthTables.split(';').filter(s => s.trim());
    for (const stmt of statements) {
        if (stmt.trim()) {
            try {
                await db.query(stmt);
            } catch (e) {
                if (!e.message.includes('already exists')) {
                    console.error('Erro ao criar tabela de auth:', e.message);
                }
            }
        }
    }
    
    // Migração: Adicionar coluna phone se não existir
    try {
        await db.query("ALTER TABLE auth_users ADD COLUMN phone VARCHAR(50)");
        console.log('📱 Coluna phone adicionada à tabela auth_users');
    } catch (e) {
        // Coluna já existe - ignorar erro
    }
    
    // Criar super admin se não existir
    await createSuperAdmin();
    
    // Criar tenant e usuário padrão se não existirem
    await createDefaultTenantAndUser();
    
    console.log('✅ Sistema de autenticação inicializado');
}

/**
 * Cria o Super Admin do sistema (você!)
 */
async function createSuperAdmin() {
    try {
        // Verificar se já existe super admin
        const existing = await masterDb.query(
            "SELECT COUNT(*) as count FROM auth_users WHERE role = 'superadmin'"
        );
        const count = existing[0]?.count || existing?.count || 0;
        
        if (count === 0) {
            const superAdminId = uuidv4();
            const passwordHash = await bcrypt.hash('SuperAdmin@2026', 12); // Senha mais forte
            
            await masterDb.query(
                `INSERT INTO auth_users (id, tenant_id, username, email, password_hash, name, role, active, must_change_password) 
                 VALUES (?, NULL, ?, ?, ?, ?, ?, 1, 1)`,
                [superAdminId, 'superadmin', 'superadmin@sistema.local', passwordHash, 'Super Administrador', 'superadmin']
            );
            
            console.log('');
            console.log('╔══════════════════════════════════════════════════════════════════╗');
            console.log('║     🔐 SUPER ADMIN CRIADO - ACESSO MASTER DO SISTEMA             ║');
            console.log('╠══════════════════════════════════════════════════════════════════╣');
            console.log('║  Usuário: superadmin                                             ║');
            console.log('║  Senha:   SuperAdmin@2026                                        ║');
            console.log('║                                                                  ║');
            console.log('║  ⚠️  GUARDE ESTAS CREDENCIAIS EM LOCAL SEGURO!                   ║');
            console.log('║  ⚠️  ALTERE A SENHA NO PRIMEIRO ACESSO!                          ║');
            console.log('║                                                                  ║');
            console.log('║  📌 Acesse: /super-admin.html para gerenciar empresas            ║');
            console.log('╚══════════════════════════════════════════════════════════════════╝');
            console.log('');
        }
    } catch (error) {
        console.error('Erro ao criar super admin:', error);
    }
}

/**
 * Cria tenant e usuário padrão para primeiro acesso
 */
async function createDefaultTenantAndUser() {
    try {
        const tenants = await masterDb.query('SELECT COUNT(*) as count FROM tenants');
        const tenantCount = tenants[0]?.count || tenants?.count || 0;
        
        if (tenantCount === 0) {
            const tenantId = uuidv4();
            const tenantSlug = 'principal';
            const dbName = 'gestao_comercial.db';
            
            await masterDb.query(
                `INSERT INTO tenants (id, name, slug, database_name, status, max_users) VALUES (?, ?, ?, ?, ?, ?)`,
                [tenantId, 'Loja Principal', tenantSlug, dbName, 'active', 10]
            );
            
            // Criar usuário admin padrão para o tenant
            const userId = uuidv4();
            const passwordHash = await bcrypt.hash('admin123', 10);
            
            await masterDb.query(
                `INSERT INTO auth_users (id, tenant_id, username, email, password_hash, name, role, active, must_change_password) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
                [userId, tenantId, 'admin', 'admin@lojaprincipal.local', passwordHash, 'Administrador', 'admin']
            );
            
            console.log('');
            console.log('╔════════════════════════════════════════════════════════════╗');
            console.log('║     🏪 EMPRESA PADRÃO CRIADA                               ║');
            console.log('╠════════════════════════════════════════════════════════════╣');
            console.log('║  Empresa: Loja Principal                                   ║');
            console.log('║  Admin:   admin                                            ║');
            console.log('║  Senha:   admin123                                         ║');
            console.log('║                                                            ║');
            console.log('║  ⚠️  ALTERE A SENHA NO PRIMEIRO ACESSO!                    ║');
            console.log('╚════════════════════════════════════════════════════════════╝');
            console.log('');
        }
    } catch (error) {
        console.error('Erro ao criar tenant/usuário padrão:', error);
    }
}

/**
 * Autentica um usuário e retorna um token JWT
 */
async function login(username, password, ipAddress = null, userAgent = null) {
    try {
        if (!masterDb) {
            console.error('❌ masterDb não inicializado!');
            return { success: false, error: 'Sistema não inicializado corretamente' };
        }
        
        console.log('🔐 Tentando login para:', username);
        
        // Buscar usuário (pode ser super admin sem tenant)
        const users = await masterDb.query(
            `SELECT u.id, u.tenant_id, u.username, u.email, u.password_hash, u.name, u.role, 
                    u.permissions, u.active, u.must_change_password, u.last_login, 
                    u.login_attempts, u.locked_until, u.created_by, u.created_at,
                    t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status 
             FROM auth_users u 
             LEFT JOIN tenants t ON u.tenant_id = t.id 
             WHERE u.username = ? OR u.email = ?`,
            [username, username]
        );
        
        console.log('📊 Resultado da query:', Array.isArray(users) ? `${users.length} usuário(s)` : 'objeto único');
        
        const user = Array.isArray(users) ? users[0] : users;
        
        if (!user || !user.id) {
            console.log('❌ Usuário não encontrado:', username);
            await logAudit(null, null, 'login_failed', `Usuário não encontrado: ${username}`, ipAddress);
            return { success: false, error: 'Usuário ou senha inválidos' };
        }
        
        console.log('👤 Usuário encontrado:', user.name, '- Role:', user.role);
        
        // Verificar se usuário está ativo
        if (!user.active) {
            await logAudit(user.tenant_id, user.id, 'login_failed', 'Conta desativada', ipAddress);
            return { success: false, error: 'Conta desativada. Contate o administrador.' };
        }
        
        // Verificar se conta está bloqueada
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
            return { success: false, error: `Conta bloqueada. Tente novamente em ${remaining} minutos.` };
        }
        
        // Super admin não precisa de tenant ativo
        if (user.role !== 'superadmin') {
            if (user.tenant_status && user.tenant_status !== 'active') {
                await logAudit(user.tenant_id, user.id, 'login_failed', 'Tenant inativo', ipAddress);
                return { success: false, error: 'Sua empresa está com acesso suspenso. Contate o suporte.' };
            }
        }
        
        // Verificar senha
        const validPassword = await bcrypt.compare(password, user.password_hash);
        console.log('🔑 Senha válida:', validPassword);
        
        if (!validPassword) {
            const attempts = (user.login_attempts || 0) + 1;
            const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
            
            await masterDb.query(
                'UPDATE auth_users SET login_attempts = ?, locked_until = ? WHERE id = ?',
                [attempts, lockUntil, user.id]
            );
            
            await logAudit(user.tenant_id, user.id, 'login_failed', `Senha incorreta (tentativa ${attempts})`, ipAddress);
            
            if (attempts >= 5) {
                return { success: false, error: 'Muitas tentativas incorretas. Conta bloqueada por 15 minutos.' };
            }
            
            return { success: false, error: 'Usuário ou senha inválidos' };
        }
        
        // Login bem sucedido
        await masterDb.query(
            'UPDATE auth_users SET login_attempts = 0, locked_until = NULL, last_login = ? WHERE id = ?',
            [new Date().toISOString(), user.id]
        );
        
        // Gerar token JWT
        const tokenPayload = {
            userId: user.id,
            username: user.username,
            email: user.email,
            name: user.name,
            role: user.role,
            tenantId: user.tenant_id,
            tenantSlug: user.tenant_slug
        };
        
        console.log('🔑 Token payload - tenantId:', user.tenant_id, '- tenantSlug:', user.tenant_slug);
        
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        console.log('🎫 Token gerado com sucesso');
        
        // Salvar sessão
        const sessionId = uuidv4();
        const tokenHash = await bcrypt.hash(token.split('.')[2], 5);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        await masterDb.query(
            'INSERT INTO auth_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
            [sessionId, user.id, tokenHash, ipAddress, userAgent, expiresAt.toISOString()]
        );
        
        await logAudit(user.tenant_id, user.id, 'login_success', 'Login realizado com sucesso', ipAddress);
        
        console.log('✅ Login bem sucedido para:', user.name);
        
        return {
            success: true,
            token,
            userId: user.id,
            userName: user.name,
            username: user.username,
            email: user.email,
            role: user.role,
            tenantId: user.tenant_id,
            tenantName: user.tenant_name,
            tenantSlug: user.tenant_slug,
            mustChangePassword: Boolean(user.must_change_password)
        };
    } catch (error) {
        console.error('❌ Erro no login:', error);
        return { success: false, error: 'Erro interno no servidor' };
    }
}

/**
 * Valida um token JWT
 */
async function validateToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('🔓 [validateToken] decoded.tenantId:', decoded.tenantId);
        
        const users = await masterDb.query('SELECT active, role, tenant_id FROM auth_users WHERE id = ?', [decoded.userId]);
        const user = users[0] || users;
        console.log('🔓 [validateToken] user.tenant_id do banco:', user?.tenant_id);
        
        if (!user || !user.active) {
            return { valid: false, error: 'Usuário não encontrado ou inativo' };
        }
        
        // Retorna dados atualizados do usuário - usa tenant_id do banco como fallback
        const finalTenantId = decoded.tenantId || user.tenant_id;
        console.log('🔓 [validateToken] finalTenantId:', finalTenantId);
        
        return { 
            valid: true, 
            user: {
                ...decoded,
                tenantId: finalTenantId, // Garante tenantId do JWT ou banco
                role: user.role // Role atualizado do banco
            }
        };
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return { valid: false, error: 'Token expirado' };
        }
        return { valid: false, error: 'Token inválido' };
    }
}

/**
 * Logout
 */
async function logout(token, userId) {
    try {
        await masterDb.query('DELETE FROM auth_sessions WHERE user_id = ?', [userId]);
        await logAudit(null, userId, 'logout', 'Logout realizado');
        return { success: true };
    } catch (error) {
        console.error('Erro no logout:', error);
        return { success: false, error: 'Erro ao fazer logout' };
    }
}

/**
 * Middleware de autenticação
 */
function authMiddleware(requiredRole = null) {
    return async (req, res, next) => {
        // Rotas públicas
        const publicPaths = [
            '/api/auth/login',
            '/api/auth/validate',
            '/login.html',
            '/css/',
            '/js/',
            '/vendor/',
            '/favicon'
        ];
        
        const isPublic = publicPaths.some(p => req.path.startsWith(p) || req.path === '/');
        if (isPublic) {
            return next();
        }
        
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        
        if (!token) {
            if (!req.path.startsWith('/api/')) {
                return res.redirect('/login.html');
            }
            return res.status(401).json({ error: 'Token não fornecido' });
        }
        
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            req.tenantId = decoded.tenantId;
            
            // Verificar role se especificado
            if (requiredRole) {
                const userLevel = ROLE_HIERARCHY[decoded.role] || 0;
                const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
                
                if (userLevel < requiredLevel) {
                    return res.status(403).json({ error: 'Permissão negada' });
                }
            }
            
            next();
        } catch (error) {
            if (!req.path.startsWith('/api/')) {
                return res.redirect('/login.html');
            }
            return res.status(401).json({ error: 'Token inválido ou expirado' });
        }
    };
}

/**
 * Middleware que requer super admin
 */
function requireSuperAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'superadmin') {
            return res.status(403).json({ error: 'Acesso restrito ao Super Administrador' });
        }
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
}

/**
 * Middleware que requer admin ou superior
 */
function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!['superadmin', 'admin'].includes(decoded.role)) {
            return res.status(403).json({ error: 'Acesso restrito a administradores' });
        }
        req.user = decoded;
        req.tenantId = decoded.tenantId;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
}

/**
 * Log de auditoria
 */
async function logAudit(tenantId, userId, action, details, ipAddress = null) {
    try {
        await masterDb.query(
            'INSERT INTO auth_audit_log (tenant_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?)',
            [tenantId, userId, action, details, ipAddress]
        );
    } catch (error) {
        console.error('Erro ao registrar auditoria:', error);
    }
}

// =====================================================
// GESTÃO DE TENANTS (SUPER ADMIN)
// =====================================================

/**
 * Cria um novo tenant (empresa)
 */
async function createTenant(data, createdBy) {
    try {
        const tenantId = uuidv4();
        const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const dbName = `tenant_${slug}_${Date.now()}.db`;
        
        // Inserir tenant
        await masterDb.query(
            `INSERT INTO tenants (id, name, slug, database_name, cnpj, email, phone, address, plan, status, max_users, expires_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenantId, data.name, slug, dbName,
                data.cnpj || null, data.email || null, data.phone || null, data.address || null,
                data.plan || 'basic', 'active', data.maxUsers || 5, data.expiresAt || null
            ]
        );
        
        // Criar banco de dados do tenant
        await createTenantDatabase(tenantId, dbName);
        
        // Criar usuário admin para o tenant
        const adminId = uuidv4();
        const passwordHash = await bcrypt.hash(data.adminPassword || 'mudar123', 10);
        
        await masterDb.query(
            `INSERT INTO auth_users (id, tenant_id, username, email, password_hash, name, role, active, must_change_password, created_by) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
            [adminId, tenantId, data.adminUsername || 'admin', data.email, passwordHash, data.adminName || 'Administrador', 'admin', createdBy]
        );
        
        await logAudit(tenantId, createdBy, 'tenant_created', `Novo tenant criado: ${data.name}`);
        
        return {
            success: true,
            tenantId,
            slug,
            adminUsername: data.adminUsername || 'admin',
            message: 'Empresa criada com sucesso'
        };
    } catch (error) {
        console.error('Erro ao criar tenant:', error);
        if (error.message && error.message.includes('UNIQUE')) {
            return { success: false, error: 'Já existe uma empresa com este nome ou slug' };
        }
        return { success: false, error: error.message };
    }
}

/**
 * Lista todos os tenants
 */
async function listTenants() {
    try {
        const tenants = await masterDb.query(`
            SELECT t.*, 
                   (SELECT COUNT(*) FROM auth_users WHERE tenant_id = t.id) as user_count
            FROM tenants t 
            ORDER BY t.name
        `);
        return { success: true, tenants };
    } catch (error) {
        console.error('Erro ao listar tenants:', error);
        return { success: false, error: 'Erro ao listar empresas' };
    }
}

/**
 * Atualiza um tenant
 */
async function updateTenant(tenantId, data) {
    try {
        const fields = [];
        const params = [];
        
        if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
        if (data.cnpj !== undefined) { fields.push('cnpj = ?'); params.push(data.cnpj); }
        if (data.email !== undefined) { fields.push('email = ?'); params.push(data.email); }
        if (data.phone !== undefined) { fields.push('phone = ?'); params.push(data.phone); }
        if (data.address !== undefined) { fields.push('address = ?'); params.push(data.address); }
        if (data.plan !== undefined) { fields.push('plan = ?'); params.push(data.plan); }
        if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
        if (data.maxUsers !== undefined) { fields.push('max_users = ?'); params.push(data.maxUsers); }
        if (data.expiresAt !== undefined) { fields.push('expires_at = ?'); params.push(data.expiresAt); }
        
        if (fields.length === 0) {
            return { success: false, error: 'Nenhum campo para atualizar' };
        }
        
        params.push(tenantId);
        await masterDb.query(`UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`, params);
        
        return { success: true, message: 'Empresa atualizada com sucesso' };
    } catch (error) {
        console.error('Erro ao atualizar tenant:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Deleta um tenant e todos os seus dados COMPLETAMENTE do sistema
 */
async function deleteTenant(tenantId) {
    try {
        console.log('🗑️ Iniciando exclusão completa do tenant:', tenantId);
        
        // Buscar info do tenant
        const tenants = await masterDb.query('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        const tenant = tenants[0] || tenants;
        
        if (!tenant) {
            return { success: false, error: 'Empresa não encontrada' };
        }
        
        const deletedItems = [];
        
        // 1. Fechar conexão do tenant se existir no cache (usando Map corretamente)
        if (tenantConnections.has(tenantId)) {
            try {
                const conn = tenantConnections.get(tenantId);
                if (conn && typeof conn.close === 'function') {
                    conn.close();
                }
                tenantConnections.delete(tenantId);
                console.log('🔓 Conexão do tenant fechada:', tenantId);
                deletedItems.push('conexão do cache');
            } catch (closeErr) {
                console.log('⚠️ Erro ao fechar conexão do tenant:', closeErr.message);
            }
        }
        
        // 2. Deletar todas as sessões ativas do tenant
        try {
            const sessResult = await masterDb.query('DELETE FROM auth_sessions WHERE tenant_id = ?', [tenantId]);
            const sessCount = sessResult.changes || sessResult.affectedRows || 0;
            if (sessCount > 0) {
                console.log(`🗑️ ${sessCount} sessões deletadas`);
                deletedItems.push(`${sessCount} sessões`);
            }
        } catch (e) { /* tabela pode não existir */ }
        
        // 3. Deletar logs de auditoria do tenant
        try {
            const logResult = await masterDb.query('DELETE FROM auth_audit_log WHERE tenant_id = ?', [tenantId]);
            const logCount = logResult.changes || logResult.affectedRows || 0;
            if (logCount > 0) {
                console.log(`🗑️ ${logCount} logs de auditoria deletados`);
                deletedItems.push(`${logCount} logs`);
            }
        } catch (e) { /* tabela pode não existir */ }
        
        // 4. Deletar caixas do tenant
        try {
            const caixaResult = await masterDb.query('DELETE FROM caixas_funcionarios WHERE tenant_id = ?', [tenantId]);
            const caixaCount = caixaResult.changes || caixaResult.affectedRows || 0;
            if (caixaCount > 0) {
                console.log(`🗑️ ${caixaCount} caixas deletados`);
                deletedItems.push(`${caixaCount} caixas`);
            }
        } catch (e) { /* tabela pode não existir */ }
        
        // 5. Deletar movimentos do tenant
        try {
            const movResult = await masterDb.query('DELETE FROM movimentos_caixa WHERE tenant_id = ?', [tenantId]);
            const movCount = movResult.changes || movResult.affectedRows || 0;
            if (movCount > 0) {
                console.log(`🗑️ ${movCount} movimentos deletados`);
                deletedItems.push(`${movCount} movimentos`);
            }
        } catch (e) { /* tabela pode não existir */ }
        
        // 6. Deletar todos os usuários do tenant
        try {
            const userResult = await masterDb.query('DELETE FROM auth_users WHERE tenant_id = ?', [tenantId]);
            const userCount = userResult.changes || userResult.affectedRows || 0;
            if (userCount > 0) {
                console.log(`🗑️ ${userCount} usuários deletados`);
                deletedItems.push(`${userCount} usuários`);
            }
        } catch (e) {
            console.error('Erro ao deletar usuários:', e.message);
        }
        
        // 7. Deletar registro do tenant
        await masterDb.query('DELETE FROM tenants WHERE id = ?', [tenantId]);
        console.log('🗑️ Registro do tenant deletado');
        deletedItems.push('registro da empresa');
        
        // 8. Remover arquivo do banco de dados (se existir)
        if (tenant.database_name) {
            const dbPath = path.join(TENANTS_DB_DIR, tenant.database_name);
            
            // Tentar deletar imediatamente
            const deleteDbFile = () => {
                try {
                    if (fs.existsSync(dbPath)) {
                        fs.unlinkSync(dbPath);
                        console.log('🗑️ Arquivo do banco deletado:', dbPath);
                        
                        // Também deletar arquivos WAL e SHM do SQLite se existirem
                        const walPath = dbPath + '-wal';
                        const shmPath = dbPath + '-shm';
                        if (fs.existsSync(walPath)) {
                            fs.unlinkSync(walPath);
                            console.log('🗑️ Arquivo WAL deletado:', walPath);
                        }
                        if (fs.existsSync(shmPath)) {
                            fs.unlinkSync(shmPath);
                            console.log('🗑️ Arquivo SHM deletado:', shmPath);
                        }
                        return true;
                    }
                } catch (unlinkErr) {
                    console.log('⚠️ Não foi possível deletar arquivo do banco:', unlinkErr.message);
                    return false;
                }
                return false;
            };
            
            // Tentar imediatamente
            if (!deleteDbFile()) {
                // Se falhar, tentar novamente após 1 segundo (conexão pode ainda não ter fechado)
                setTimeout(deleteDbFile, 1000);
                // E uma terceira tentativa após 3 segundos
                setTimeout(deleteDbFile, 3000);
            } else {
                deletedItems.push('banco de dados');
            }
        }
        
        const summary = deletedItems.length > 0 
            ? `Itens removidos: ${deletedItems.join(', ')}` 
            : 'Empresa removida';
        
        console.log('✅ Exclusão completa do tenant finalizada:', tenantId);
        console.log('📋 Resumo:', summary);
        
        return { 
            success: true, 
            message: 'Empresa e todos os dados foram completamente removidos do sistema',
            details: summary,
            deletedItems
        };
    } catch (error) {
        console.error('❌ Erro ao deletar tenant:', error);
        return { success: false, error: error.message };
    }
}

// =====================================================
// GESTÃO DE USUÁRIOS (ADMIN DA EMPRESA)
// =====================================================

/**
 * Lista usuários de um tenant
 */
async function listUsers(tenantId) {
    try {
        const users = await masterDb.query(`
            SELECT id, username, email, name, role, active, last_login, created_at, must_change_password
            FROM auth_users 
            WHERE tenant_id = ? 
            ORDER BY name
        `, [tenantId]);
        return { success: true, users };
    } catch (error) {
        console.error('Erro ao listar usuários:', error);
        return { success: false, error: 'Erro ao listar usuários' };
    }
}

/**
 * Cria um novo usuário (funcionário)
 */
async function createUser(tenantId, data, createdBy) {
    try {
        // Verificar limite de usuários do tenant
        const countResult = await masterDb.query(
            'SELECT COUNT(*) as count FROM auth_users WHERE tenant_id = ?', [tenantId]
        );
        const userCount = countResult[0]?.count || countResult?.count || 0;
        
        const tenantResult = await masterDb.query(
            'SELECT max_users FROM tenants WHERE id = ?', [tenantId]
        );
        const maxUsers = tenantResult[0]?.max_users || tenantResult?.max_users || 5;
        
        if (userCount >= maxUsers) {
            return { success: false, error: `Limite de ${maxUsers} usuários atingido. Contate o suporte para aumentar o limite.` };
        }
        
        const userId = uuidv4();
        const passwordHash = await bcrypt.hash(data.password || 'mudar123', 10);
        
        // Admin da empresa só pode criar usuários com role inferior
        const allowedRoles = ['gerente', 'caixa', 'user'];
        const role = allowedRoles.includes(data.role) ? data.role : 'user';
        
        await masterDb.query(
            `INSERT INTO auth_users (id, tenant_id, username, email, password_hash, name, role, permissions, active, must_change_password, created_by) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [userId, tenantId, data.username, data.email || null, passwordHash, data.name, role, JSON.stringify(data.permissions || []), data.active !== false ? 1 : 0, createdBy]
        );
        
        await logAudit(tenantId, createdBy, 'user_created', `Novo usuário criado: ${data.username}`);
        
        return { success: true, userId, message: 'Funcionário criado com sucesso' };
    } catch (error) {
        if (error.message && error.message.includes('UNIQUE')) {
            return { success: false, error: 'Nome de usuário já existe' };
        }
        console.error('Erro ao criar usuário:', error);
        return { success: false, error: 'Erro ao criar usuário' };
    }
}

/**
 * Atualiza um usuário
 */
async function updateUser(userId, data, updatedBy) {
    try {
        const fields = [];
        const params = [];
        
        if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
        if (data.email !== undefined) { fields.push('email = ?'); params.push(data.email); }
        if (data.role !== undefined) { fields.push('role = ?'); params.push(data.role); }
        if (data.active !== undefined) { fields.push('active = ?'); params.push(data.active ? 1 : 0); }
        if (data.permissions !== undefined) { fields.push('permissions = ?'); params.push(JSON.stringify(data.permissions)); }
        
        if (data.password) {
            const passwordHash = await bcrypt.hash(data.password, 10);
            fields.push('password_hash = ?');
            params.push(passwordHash);
            fields.push('must_change_password = 1');
        }
        
        if (fields.length === 0) {
            return { success: false, error: 'Nenhum campo para atualizar' };
        }
        
        params.push(userId);
        await masterDb.query(`UPDATE auth_users SET ${fields.join(', ')} WHERE id = ?`, params);
        
        await logAudit(null, updatedBy, 'user_updated', `Usuário atualizado: ${userId}`);
        
        return { success: true, message: 'Usuário atualizado com sucesso' };
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Busca um usuário por ID
 */
async function getUserById(userId) {
    try {
        const users = await masterDb.query(
            `SELECT id, tenant_id, username, email, name, role, active, phone, 
                    last_login, created_at, must_change_password
             FROM auth_users WHERE id = ?`,
            [userId]
        );
        return users[0] || users || null;
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        return null;
    }
}

/**
 * Atualiza o perfil do usuário (nome, email, telefone)
 */
async function updateUserProfile(userId, data) {
    try {
        const { name, email, phone } = data;
        
        // Verificar se email já está em uso por outro usuário
        if (email) {
            const existing = await masterDb.query(
                'SELECT id FROM auth_users WHERE email = ? AND id != ?',
                [email, userId]
            );
            if (existing.length > 0) {
                return { success: false, error: 'Este email já está em uso' };
            }
        }
        
        const updates = [];
        const params = [];
        
        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (email !== undefined) {
            updates.push('email = ?');
            params.push(email);
        }
        if (phone !== undefined) {
            updates.push('phone = ?');
            params.push(phone);
        }
        
        if (updates.length === 0) {
            return { success: false, error: 'Nenhum campo para atualizar' };
        }
        
        params.push(userId);
        
        await masterDb.query(
            `UPDATE auth_users SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
        
        return { success: true, message: 'Perfil atualizado' };
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Deleta um usuário
 */
async function deleteUser(userId, deletedBy) {
    try {
        // Verificar se não é o próprio usuário
        if (userId === deletedBy) {
            return { success: false, error: 'Você não pode deletar a si mesmo' };
        }
        
        // Verificar se não é super admin
        const users = await masterDb.query('SELECT role FROM auth_users WHERE id = ?', [userId]);
        const user = users[0] || users;
        
        if (user?.role === 'superadmin') {
            return { success: false, error: 'Não é possível deletar o Super Admin' };
        }
        
        await masterDb.query('DELETE FROM auth_sessions WHERE user_id = ?', [userId]);
        await masterDb.query('DELETE FROM auth_users WHERE id = ?', [userId]);
        
        await logAudit(null, deletedBy, 'user_deleted', `Usuário deletado: ${userId}`);
        
        return { success: true, message: 'Usuário deletado com sucesso' };
    } catch (error) {
        console.error('Erro ao deletar usuário:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Lista todos os administradores de todas as empresas (para super admin)
 */
async function listAllAdmins() {
    try {
        const admins = await masterDb.query(`
            SELECT u.id, u.username, u.email, u.name, u.role, u.active, u.last_login, u.created_at, 
                   u.must_change_password, u.tenant_id, t.name as tenant_name
            FROM auth_users u
            LEFT JOIN tenants t ON u.tenant_id = t.id
            WHERE u.role = 'admin'
            ORDER BY t.name, u.name
        `);
        return { success: true, admins };
    } catch (error) {
        console.error('Erro ao listar admins:', error);
        return { success: false, error: 'Erro ao listar administradores' };
    }
}

/**
 * Lista administradores de um tenant (para super admin)
 */
async function listTenantAdmins(tenantId) {
    try {
        const admins = await masterDb.query(`
            SELECT id, username, email, name, role, active, last_login, created_at, must_change_password
            FROM auth_users 
            WHERE tenant_id = ? AND role = 'admin'
            ORDER BY name
        `, [tenantId]);
        return { success: true, admins };
    } catch (error) {
        console.error('Erro ao listar admins:', error);
        return { success: false, error: 'Erro ao listar administradores' };
    }
}

/**
 * Cria um administrador para um tenant (para super admin)
 */
async function createTenantAdmin(tenantId, data) {
    try {
        // Verificar se tenant existe
        const tenants = await masterDb.query('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        const tenant = tenants[0] || tenants;
        
        if (!tenant || !tenant.id) {
            return { success: false, error: 'Empresa não encontrada' };
        }
        
        // Verificar username único
        const existingUsers = await masterDb.query(
            'SELECT id FROM auth_users WHERE username = ?',
            [data.username]
        );
        
        if (existingUsers.length > 0 || existingUsers?.id) {
            return { success: false, error: 'Nome de usuário já está em uso' };
        }
        
        const userId = uuidv4();
        const passwordHash = await bcrypt.hash(data.password, 10);
        
        await masterDb.query(
            `INSERT INTO auth_users (id, tenant_id, username, email, password_hash, name, role, active, must_change_password) 
             VALUES (?, ?, ?, ?, ?, ?, 'admin', 1, 1)`,
            [userId, tenantId, data.username, data.email || null, passwordHash, data.name]
        );
        
        await logAudit(tenantId, null, 'admin_created', `Admin criado: ${data.username} para empresa ${tenant.name}`);
        
        return { 
            success: true, 
            userId,
            message: 'Administrador criado com sucesso'
        };
    } catch (error) {
        console.error('Erro ao criar admin:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Reset de senha pelo admin (versão simplificada para API)
 */
async function resetUserPassword(userId, newPassword) {
    try {
        if (!newPassword || newPassword.length < 6) {
            return { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres' };
        }
        
        const newHash = await bcrypt.hash(newPassword, 10);
        await masterDb.query(
            'UPDATE auth_users SET password_hash = ?, must_change_password = 1, login_attempts = 0, locked_until = NULL WHERE id = ?', 
            [newHash, userId]
        );
        
        await logAudit(null, null, 'password_reset', `Senha resetada para usuário: ${userId}`);
        
        return { success: true, message: 'Senha resetada com sucesso. Usuário deverá alterar no próximo login.' };
    } catch (error) {
        console.error('Erro ao resetar senha:', error);
        return { success: false, error: 'Erro ao resetar senha' };
    }
}

/**
 * Altera a senha do usuário
 */
async function changePassword(userId, currentPassword, newPassword) {
    try {
        const users = await masterDb.query('SELECT password_hash FROM auth_users WHERE id = ?', [userId]);
        const user = users[0] || users;
        
        if (!user) {
            return { success: false, error: 'Usuário não encontrado' };
        }
        
        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
        if (!validPassword) {
            return { success: false, error: 'Senha atual incorreta' };
        }
        
        const newHash = await bcrypt.hash(newPassword, 10);
        await masterDb.query('UPDATE auth_users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [newHash, userId]);
        
        await logAudit(null, userId, 'password_changed', 'Senha alterada pelo usuário');
        
        return { success: true, message: 'Senha alterada com sucesso' };
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        return { success: false, error: 'Erro ao alterar senha' };
    }
}

/**
 * Reset de senha pelo admin
 */
async function resetPassword(userId, newPassword, adminId) {
    try {
        const newHash = await bcrypt.hash(newPassword, 10);
        await masterDb.query('UPDATE auth_users SET password_hash = ?, must_change_password = 1, login_attempts = 0, locked_until = NULL WHERE id = ?', [newHash, userId]);
        
        await logAudit(null, adminId, 'password_reset', `Senha resetada para usuário: ${userId}`);
        
        return { success: true, message: 'Senha resetada com sucesso. Usuário deverá alterar no próximo login.' };
    } catch (error) {
        console.error('Erro ao resetar senha:', error);
        return { success: false, error: 'Erro ao resetar senha' };
    }
}

// =====================================================
// GESTÃO DE CAIXA POR FUNCIONÁRIO
// =====================================================

/**
 * Abre um caixa para o funcionário
 */
async function abrirCaixa(userId, tenantId, valorInicial = 0) {
    try {
        // Verificar se já tem caixa aberto
        const caixasAbertos = await masterDb.query(
            "SELECT id FROM caixas_funcionarios WHERE user_id = ? AND status = 'aberto'",
            [userId]
        );
        
        if (caixasAbertos.length > 0 || caixasAbertos?.id) {
            return { success: false, error: 'Você já possui um caixa aberto' };
        }
        
        const caixaId = uuidv4();
        const agora = new Date();
        const dataAbertura = agora.toISOString().split('T')[0];
        const horaAbertura = agora.toTimeString().split(' ')[0];
        
        await masterDb.query(
            `INSERT INTO caixas_funcionarios (id, user_id, tenant_id, data_abertura, hora_abertura, valor_inicial, status) 
             VALUES (?, ?, ?, ?, ?, ?, 'aberto')`,
            [caixaId, userId, tenantId, dataAbertura, horaAbertura, valorInicial]
        );
        
        await logAudit(tenantId, userId, 'caixa_aberto', `Caixa aberto com valor inicial: ${valorInicial}`);
        
        return { 
            success: true, 
            caixaId, 
            message: 'Caixa aberto com sucesso',
            dataAbertura,
            horaAbertura,
            valorInicial
        };
    } catch (error) {
        console.error('Erro ao abrir caixa:', error);
        return { success: false, error: 'Erro ao abrir caixa' };
    }
}

/**
 * Fecha o caixa do funcionário
 */
async function fecharCaixa(caixaId, userId, valorFinal, observacoes = '') {
    try {
        const agora = new Date();
        const horaFechamento = agora.toTimeString().split(' ')[0];
        
        await masterDb.query(
            `UPDATE caixas_funcionarios 
             SET valor_final = ?, hora_fechamento = ?, status = 'fechado', observacoes = ? 
             WHERE id = ? AND user_id = ?`,
            [valorFinal, horaFechamento, observacoes, caixaId, userId]
        );
        
        await logAudit(null, userId, 'caixa_fechado', `Caixa fechado com valor final: ${valorFinal}`);
        
        return { 
            success: true, 
            message: 'Caixa fechado com sucesso',
            horaFechamento,
            valorFinal
        };
    } catch (error) {
        console.error('Erro ao fechar caixa:', error);
        return { success: false, error: 'Erro ao fechar caixa' };
    }
}

/**
 * Obtém caixa aberto do funcionário
 */
async function getCaixaAberto(userId) {
    try {
        const caixas = await masterDb.query(
            "SELECT * FROM caixas_funcionarios WHERE user_id = ? AND status = 'aberto' ORDER BY created_at DESC LIMIT 1",
            [userId]
        );
        
        const caixa = caixas[0] || caixas;
        
        if (!caixa || !caixa.id) {
            return { success: true, caixa: null };
        }
        
        // Buscar movimentações do caixa
        const movimentos = await masterDb.query(
            'SELECT * FROM movimentos_caixa WHERE caixa_id = ? ORDER BY created_at DESC',
            [caixa.id]
        );
        
        return { success: true, caixa, movimentos };
    } catch (error) {
        console.error('Erro ao buscar caixa:', error);
        return { success: false, error: 'Erro ao buscar caixa' };
    }
}

/**
 * Registra movimento no caixa
 */
async function registrarMovimentoCaixa(caixaId, userId, tenantId, data) {
    try {
        const movimentoId = uuidv4();
        
        await masterDb.query(
            `INSERT INTO movimentos_caixa (id, caixa_id, user_id, tenant_id, tipo, valor, forma_pagamento, descricao, venda_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [movimentoId, caixaId, userId, tenantId, data.tipo, data.valor, data.formaPagamento || null, data.descricao || null, data.vendaId || null]
        );
        
        return { success: true, movimentoId };
    } catch (error) {
        console.error('Erro ao registrar movimento:', error);
        return { success: false, error: 'Erro ao registrar movimento' };
    }
}

/**
 * Relatório do caixa
 */
async function getRelatorioCaixa(caixaId, userId) {
    try {
        const caixas = await masterDb.query(
            'SELECT * FROM caixas_funcionarios WHERE id = ? AND user_id = ?',
            [caixaId, userId]
        );
        
        const caixa = caixas[0] || caixas;
        if (!caixa) {
            return { success: false, error: 'Caixa não encontrado' };
        }
        
        const movimentos = await masterDb.query(
            'SELECT * FROM movimentos_caixa WHERE caixa_id = ? ORDER BY created_at ASC',
            [caixaId]
        );
        
        // Calcular totais
        let totalEntradas = 0;
        let totalSaidas = 0;
        const porFormaPagamento = {};
        
        for (const mov of movimentos) {
            if (mov.tipo === 'entrada' || mov.tipo === 'venda') {
                totalEntradas += parseFloat(mov.valor);
            } else {
                totalSaidas += parseFloat(mov.valor);
            }
            
            const forma = mov.forma_pagamento || 'Outros';
            porFormaPagamento[forma] = (porFormaPagamento[forma] || 0) + parseFloat(mov.valor);
        }
        
        const valorInicial = parseFloat(caixa.valor_inicial) || 0;
        const saldoFinal = valorInicial + totalEntradas - totalSaidas;
        
        return {
            success: true,
            caixa,
            movimentos,
            resumo: {
                valorInicial,
                totalEntradas,
                totalSaidas,
                saldoFinal,
                porFormaPagamento,
                totalOperacoes: movimentos.length
            }
        };
    } catch (error) {
        console.error('Erro ao gerar relatório do caixa:', error);
        return { success: false, error: 'Erro ao gerar relatório' };
    }
}

/**
 * Lista caixas do funcionário (histórico)
 */
async function listarCaixasFuncionario(userId, limit = 30) {
    try {
        const caixas = await masterDb.query(
            `SELECT * FROM caixas_funcionarios WHERE user_id = ? ORDER BY data_abertura DESC, hora_abertura DESC LIMIT ?`,
            [userId, limit]
        );
        return { success: true, caixas };
    } catch (error) {
        console.error('Erro ao listar caixas:', error);
        return { success: false, error: 'Erro ao listar caixas' };
    }
}

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Cria banco de dados para um tenant
 */
async function createTenantDatabase(tenantId, dbName) {
    const dbPath = path.join(TENANTS_DB_DIR, dbName);
    const sqlite = require('better-sqlite3');
    const tenantDb = new sqlite(dbPath);
    
    // Configurar pragma para performance
    tenantDb.pragma('journal_mode = WAL');
    
    const sqliteModule = require('./database-sqlite');
    
    const wrapper = {
        db: tenantDb,
        query: (sql, params = []) => {
            const trimmedSql = sql.trim();
            const newParams = params.map(p => typeof p === 'boolean' ? (p ? 1 : 0) : p);
            if (/^(select|pragma)/i.test(trimmedSql)) {
                return tenantDb.prepare(trimmedSql.replace(/`/g, '')).all(newParams);
            } else {
                return tenantDb.prepare(trimmedSql.replace(/`/g, '')).run(newParams);
            }
        }
    };
    
    await sqliteModule.createTables(wrapper);
    
    console.log(`✅ Banco de dados criado para tenant: ${tenantId} em ${dbPath}`);
    
    tenantDb.close();
}

/**
 * Obtém conexão do banco de dados de um tenant específico
 * Retorna um wrapper com a mesma interface do database.js
 */
function getTenantConnection(tenantId) {
    // Verifica se já tem conexão no cache
    if (tenantConnections.has(tenantId)) {
        return tenantConnections.get(tenantId);
    }
    
    // Busca o tenant no banco master (síncrono para SQLite)
    // Como masterDb pode ser MySQL (async) ou SQLite (sync), 
    // precisamos usar uma abordagem que funcione para ambos
    let tenants;
    try {
        // Para SQLite, query é síncrono e retorna direto
        // Para MySQL, isso vai falhar e precisamos de tratamento diferente
        if (masterDb.getDatabaseType && masterDb.getDatabaseType() === 'sqlite') {
            // Acesso direto ao banco SQLite para query síncrona
            const sqlite = require('better-sqlite3');
            const mainDbPath = require('path').join(__dirname, 'gestao_comercial.db');
            const tempDb = new sqlite(mainDbPath, { readonly: true });
            tenants = tempDb.prepare('SELECT database_name FROM tenants WHERE id = ?').all([tenantId]);
            tempDb.close();
        } else {
            // Fallback: tentar query normal (pode não funcionar para MySQL aqui)
            tenants = masterDb.query('SELECT database_name FROM tenants WHERE id = ?', [tenantId]);
        }
    } catch (e) {
        console.error('Erro ao buscar tenant:', e.message);
        return null;
    }
    const tenant = Array.isArray(tenants) ? tenants[0] : tenants;
    
    if (!tenant || !tenant.database_name) {
        console.error(`Tenant não encontrado: ${tenantId}`);
        return null;
    }
    
    const dbPath = path.join(TENANTS_DB_DIR, tenant.database_name);
    
    // Verifica se o arquivo existe
    if (!fs.existsSync(dbPath)) {
        console.error(`Banco do tenant não encontrado: ${dbPath}`);
        return null;
    }
    
    const sqlite = require('better-sqlite3');
    const tenantDb = new sqlite(dbPath);
    tenantDb.pragma('journal_mode = WAL');
    
    // Aplicar migrações para garantir que colunas novas existam (type, quantity em transacoes)
    try {
        const transInfo = tenantDb.prepare("PRAGMA table_info(transacoes)").all();
        const transCols = transInfo.map(c => c.name);
        if (!transCols.includes('type')) {
            tenantDb.exec("ALTER TABLE transacoes ADD COLUMN type TEXT");
            console.log(`✓ Coluna type adicionada em transacoes (tenant: ${tenantId})`);
        }
        if (!transCols.includes('quantity')) {
            tenantDb.exec("ALTER TABLE transacoes ADD COLUMN quantity REAL");
            console.log(`✓ Coluna quantity adicionada em transacoes (tenant: ${tenantId})`);
        }
    } catch (e) {
        // Ignora erros de migração (coluna já existe, etc)
    }
    
    // Criar wrapper com mesma interface do database.js
    const wrapper = {
        db: tenantDb,
        query: (sql, params = []) => {
            const trimmedSql = sql.trim();
            const newParams = params.map(p => typeof p === 'boolean' ? (p ? 1 : 0) : p);
            if (/^(select|pragma)/i.test(trimmedSql)) {
                return tenantDb.prepare(trimmedSql.replace(/`/g, '')).all(newParams);
            } else {
                return tenantDb.prepare(trimmedSql.replace(/`/g, '')).run(newParams);
            }
        },
        transaction: (callback) => {
            const runTransaction = tenantDb.transaction(callback);
            return runTransaction(wrapper);
        },
        getDatabaseType: () => 'sqlite',
        close: () => {
            tenantDb.close();
            tenantConnections.delete(tenantId);
        }
    };
    
    // Adiciona ao cache
    tenantConnections.set(tenantId, wrapper);
    
    console.log(`🔗 Conexão criada para tenant: ${tenantId}`);
    
    return wrapper;
}

/**
 * Fecha todas as conexões de tenants (para shutdown graceful)
 */
function closeAllTenantConnections() {
    for (const [tenantId, conn] of tenantConnections) {
        try {
            conn.close();
            console.log(`🔒 Conexão fechada para tenant: ${tenantId}`);
        } catch (e) {
            console.error(`Erro ao fechar conexão do tenant ${tenantId}:`, e);
        }
    }
    tenantConnections.clear();
}

/**
 * Busca logs de auditoria
 */
async function getAuditLogs(tenantId = null, limit = 100) {
    try {
        let sql = 'SELECT * FROM auth_audit_log';
        const params = [];
        
        if (tenantId) {
            sql += ' WHERE tenant_id = ?';
            params.push(tenantId);
        }
        
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);
        
        const logs = await masterDb.query(sql, params);
        return { success: true, logs };
    } catch (error) {
        console.error('Erro ao buscar logs:', error);
        return { success: false, error: 'Erro ao buscar logs' };
    }
}

module.exports = {
    initializeMasterDb,
    login,
    logout,
    validateToken,
    authMiddleware,
    requireSuperAdmin,
    requireAdmin,
    createTenant,
    updateTenant,
    deleteTenant,
    listTenants,
    listAllAdmins,
    listTenantAdmins,
    createTenantAdmin,
    listUsers,
    createUser,
    updateUser,
    deleteUser,
    changePassword,
    resetPassword,
    resetUserPassword,
    getUserById,
    updateUserProfile,
    abrirCaixa,
    fecharCaixa,
    getCaixaAberto,
    registrarMovimentoCaixa,
    getRelatorioCaixa,
    listarCaixasFuncionario,
    getTenantConnection,
    closeAllTenantConnections,
    logAudit,
    getAuditLogs,
    JWT_SECRET,
    ROLE_HIERARCHY
};
