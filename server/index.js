const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const fs = require('fs');
const path = require('path');
const printService = require('./print-service');
const DateTimeUtils = require('./datetime-utils');
const auth = require('./auth');

const app = express();
app.use(cors());
// Increase JSON/body size limit to allow larger (but controlled) payloads; frontend now strips images from notes
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));
app.use(express.static('frontend'));

/**
 * Helper para obter o banco de dados correto (tenant ou principal)
 * Use em endpoints que precisam de isolamento por empresa
 */
function getDatabase(req) {
  return req.tenantDb || db;
}

// Inicializa o banco de dados e, em seguida, inicia o servidor
async function startServer() {
  await db.initializeDatabase();
  
  // Inicializar sistema de autenticação
  await auth.initializeMasterDb(db);

  // ============================================
  // MIDDLEWARE DE TENANT - Isolamento de dados por empresa
  // ============================================
  
  /**
   * Middleware que identifica o tenant do usuário logado e 
   * injeta a conexão correta do banco de dados em req.tenantDb
   */
  const tenantMiddleware = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      console.log('🔍 [TENANT-MW] Path:', req.path, '- Token presente:', !!token);
      
      if (token) {
        const result = await auth.validateToken(token);
        console.log('🔍 [TENANT-MW] Token validado:', result.valid, '- tenantId:', result.user?.tenantId || 'NENHUM');
        if (result.valid && result.user) {
          req.user = result.user;
          
          // Se o usuário tem um tenant associado, conectar ao banco específico
          if (result.user.tenantId) {
            console.log('🔍 [TENANT-MW] Buscando conexão para tenant:', result.user.tenantId);
            const tenantConn = auth.getTenantConnection(result.user.tenantId);
            console.log('🔗 [TENANT-MW] Conexão obtida:', tenantConn ? 'OK' : 'NULL/FALLBACK');
            if (tenantConn) {
              req.tenantDb = tenantConn;
              req.tenantId = result.user.tenantId;
              console.log('✅ [TENANT-MW] Usando banco do TENANT:', result.user.tenantId);
            }
          }
        }
      }
      
      // Se não tem tenant específico, usa o banco principal
      if (!req.tenantDb) {
        console.log('⚠️ [TENANT] Usando banco PRINCIPAL (fallback)');
        req.tenantDb = db;
      }
      
      next();
    } catch (error) {
      console.error('Erro no middleware de tenant:', error);
      req.tenantDb = db; // Fallback para banco principal
      next();
    }
  };
  
  // Aplicar middleware de tenant em todas as rotas /api (exceto auth)
  app.use('/api', (req, res, next) => {
    // Rotas de auth não precisam do middleware de tenant
    if (req.path.startsWith('/auth/')) {
      return next();
    }
    return tenantMiddleware(req, res, next);
  });
  
  // ============================================
  // API DE AUTENTICAÇÃO
  // ============================================
  
  // Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const ip = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];
      
      console.log('📝 Tentativa de login:', username);
      
      const result = await auth.login(username, password, ip, userAgent);
      
      console.log('📝 Resultado do login:', result.success ? 'Sucesso' : 'Falha', result.error || '');
      
      if (result.success) {
        res.json({
          token: result.token,
          userId: result.userId,
          userName: result.userName,
          email: result.email,
          role: result.role,
          tenantId: result.tenantId,
          tenantName: result.tenantName
        });
      } else {
        res.status(401).json({ error: result.error });
      }
    } catch (error) {
      console.error('❌ Erro no login:', error);
      res.status(500).json({ error: 'Erro interno no servidor' });
    }
  });
  
  // Validar token
  app.get('/api/auth/validate', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      if (!token) {
        return res.json({ valid: false, error: 'Token não fornecido' });
      }
      
      const result = await auth.validateToken(token);
      res.json(result);
    } catch (error) {
      res.json({ valid: false, error: 'Erro ao validar token' });
    }
  });
  
  // Logout
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const { userId } = req.body;
      
      const result = await auth.logout(token, userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao fazer logout' });
    }
  });
  
  // Obter perfil do usuário logado
  app.get('/api/auth/profile', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
      }
      const token = authHeader.split(' ')[1];
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gestao-comercial-secret-key-2024');
      
      const user = await auth.getUserById(decoded.userId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
      
      res.json({
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        createdAt: user.created_at,
        lastLogin: user.last_login
      });
    } catch (error) {
      console.error('Erro ao obter perfil:', error);
      res.status(500).json({ error: 'Erro ao obter perfil' });
    }
  });

  // Atualizar perfil do usuário logado
  app.put('/api/auth/profile', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
      }
      const token = authHeader.split(' ')[1];
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gestao-comercial-secret-key-2024');
      
      const { name, email, phone } = req.body;
      const result = await auth.updateUserProfile(decoded.userId, { name, email, phone });
      
      if (result.success) {
        res.json({ success: true, message: 'Perfil atualizado' });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      res.status(500).json({ error: 'Erro ao atualizar perfil' });
    }
  });

  // Alterar senha
  app.post('/api/auth/change-password', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      let userId = req.body.userId;
      
      // Se não passou userId, pega do token
      if (!userId && authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gestao-comercial-secret-key-2024');
        userId = decoded.userId;
      }
      
      const { currentPassword, newPassword } = req.body;
      const result = await auth.changePassword(userId, currentPassword, newPassword);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro ao alterar senha' });
    }
  });
  
  // Listar usuários (admin)
  app.get('/api/auth/users', async (req, res) => {
    try {
      const tenantId = req.headers['x-tenant-id'];
      if (!tenantId) return res.status(400).json({ error: 'Tenant não especificado' });
      
      const result = await auth.listUsers(tenantId);
      res.json(result.success ? result.users : []);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao listar usuários' });
    }
  });
  
  // Obter usuário específico (admin)
  app.get('/api/auth/users/:id', async (req, res) => {
    try {
      const tenantId = req.headers['x-tenant-id'];
      if (!tenantId) return res.status(400).json({ error: 'Tenant não especificado' });
      
      const result = await auth.listUsers(tenantId);
      if (result.success) {
        const user = result.users.find(u => u.id === req.params.id);
        if (user) {
          res.json(user);
        } else {
          res.status(404).json({ error: 'Usuário não encontrado' });
        }
      } else {
        res.status(500).json({ error: 'Erro ao buscar usuário' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
  });
  
  // Criar usuário (admin)
  app.post('/api/auth/users', async (req, res) => {
    try {
      const tenantId = req.headers['x-tenant-id'];
      if (!tenantId) return res.status(400).json({ error: 'Tenant não especificado' });
      
      const result = await auth.createUser(tenantId, req.body);
      
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro ao criar usuário' });
    }
  });
  
  // Listar tenants (super admin)
  app.get('/api/auth/tenants', async (req, res) => {
    try {
      const result = await auth.listTenants();
      res.json(result.success ? result.tenants : []);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao listar empresas' });
    }
  });
  
  // Obter tenant específico (super admin)
  app.get('/api/auth/tenants/:id', async (req, res) => {
    try {
      const result = await auth.listTenants();
      if (result.success) {
        const tenant = result.tenants.find(t => t.id === req.params.id);
        if (tenant) {
          res.json(tenant);
        } else {
          res.status(404).json({ error: 'Empresa não encontrada' });
        }
      } else {
        res.status(500).json({ error: 'Erro ao buscar empresa' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar empresa' });
    }
  });
  
  // Criar tenant (super admin)
  app.post('/api/auth/tenants', async (req, res) => {
    try {
      const result = await auth.createTenant(req.body);
      
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro ao criar empresa' });
    }
  });
  
  // Atualizar tenant (super admin)
  app.put('/api/auth/tenants/:id', async (req, res) => {
    try {
      const result = await auth.updateTenant(req.params.id, req.body);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar empresa' });
    }
  });
  
  // Deletar tenant (super admin)
  app.delete('/api/auth/tenants/:id', async (req, res) => {
    try {
      const result = await auth.deleteTenant(req.params.id);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro ao deletar empresa' });
    }
  });
  
  // Listar todos os admins (super admin) - para gerenciamento centralizado
  app.get('/api/auth/admins', async (req, res) => {
    try {
      const result = await auth.listAllAdmins();
      res.json(result.success ? result.admins : []);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao listar administradores' });
    }
  });
  
  // Listar admins de um tenant (super admin)
  app.get('/api/auth/tenants/:tenantId/admins', async (req, res) => {
    try {
      const result = await auth.listTenantAdmins(req.params.tenantId);
      res.json(result.success ? result.admins : []);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao listar administradores' });
    }
  });
  
  // Criar admin para um tenant (super admin)
  app.post('/api/auth/tenants/:tenantId/admins', async (req, res) => {
    try {
      const result = await auth.createTenantAdmin(req.params.tenantId, req.body);
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro ao criar administrador' });
    }
  });
  
  // Atualizar usuário
  app.put('/api/auth/users/:id', async (req, res) => {
    try {
      const result = await auth.updateUser(req.params.id, req.body);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
  });
  
  // Deletar usuário
  app.delete('/api/auth/users/:id', async (req, res) => {
    try {
      const result = await auth.deleteUser(req.params.id);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro ao deletar usuário' });
    }
  });
  
  // Reset de senha (admin ou super admin)
  app.post('/api/auth/users/:id/reset-password', async (req, res) => {
    try {
      const result = await auth.resetUserPassword(req.params.id, req.body.newPassword);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro ao resetar senha' });
    }
  });
  
  // Logs de auditoria (super admin)
  app.get('/api/auth/audit-logs', async (req, res) => {
    try {
      const { limit = 100, tenantId } = req.query;
      const result = await auth.getAuditLogs(tenantId, parseInt(limit));
      res.json(result.success ? result.logs : []);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar logs' });
    }
  });
  
  // ============================================
  // API DE CAIXA DO FUNCIONÁRIO
  // ============================================
  
  // Obter caixa aberto do funcionário atual
  app.get('/api/caixa/meu-caixa', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
      }
      
      const validation = await auth.validateToken(token);
      if (!validation.valid) {
        return res.status(401).json({ error: 'Token inválido' });
      }
      
      const result = await auth.getCaixaAberto(validation.user.userId, validation.user.tenantId);
      res.json(result);
    } catch (error) {
      console.error('Erro ao buscar caixa:', error);
      res.status(500).json({ error: 'Erro ao buscar caixa' });
    }
  });
  
  // Abrir caixa
  app.post('/api/caixa/abrir', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
      }
      
      const validation = await auth.validateToken(token);
      if (!validation.valid) {
        return res.status(401).json({ error: 'Token inválido' });
      }
      
      const { valorInicial = 0 } = req.body;
      const result = await auth.abrirCaixa(validation.user.userId, validation.user.tenantId, valorInicial);
      
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      console.error('Erro ao abrir caixa:', error);
      res.status(500).json({ error: 'Erro ao abrir caixa' });
    }
  });
  
  // Fechar caixa
  app.post('/api/caixa/fechar', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
      }
      
      const validation = await auth.validateToken(token);
      if (!validation.valid) {
        return res.status(401).json({ error: 'Token inválido' });
      }
      
      const { caixaId, valorFinal, observacoes } = req.body;
      const result = await auth.fecharCaixa(caixaId, valorFinal, observacoes);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      console.error('Erro ao fechar caixa:', error);
      res.status(500).json({ error: 'Erro ao fechar caixa' });
    }
  });
  
  // Registrar movimento no caixa
  app.post('/api/caixa/movimento', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
      }
      
      const validation = await auth.validateToken(token);
      if (!validation.valid) {
        return res.status(401).json({ error: 'Token inválido' });
      }
      
      const { caixaId, tipo, valor, formaPagamento, descricao, vendaId } = req.body;
      const result = await auth.registrarMovimentoCaixa(
        caixaId, 
        validation.user.userId, 
        validation.user.tenantId,
        tipo, 
        valor, 
        formaPagamento, 
        descricao, 
        vendaId
      );
      
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      console.error('Erro ao registrar movimento:', error);
      res.status(500).json({ error: 'Erro ao registrar movimento' });
    }
  });
  
  // Relatório do caixa
  app.get('/api/caixa/:caixaId/relatorio', async (req, res) => {
    try {
      const result = await auth.getRelatorioCaixa(req.params.caixaId);
      res.json(result);
    } catch (error) {
      console.error('Erro ao buscar relatório:', error);
      res.status(500).json({ error: 'Erro ao buscar relatório' });
    }
  });
  
  // Histórico de caixas do funcionário
  app.get('/api/caixa/historico', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
      }
      
      const validation = await auth.validateToken(token);
      if (!validation.valid) {
        return res.status(401).json({ error: 'Token inválido' });
      }
      
      const { limit = 30 } = req.query;
      const result = await auth.listarCaixasFuncionario(validation.user.userId, parseInt(limit));
      res.json(result);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
  });

  // ============================================
  // API DE TRANSAÇÕES (MOVIMENTOS)
  // ============================================

  app.get('/api/transactions', async (req, res) => {
    try {
      const { page = 1, pageSize = 10, search = '', status = '', month = '' } = req.query;
      
      let sql = 'SELECT * FROM transacoes WHERE 1=1';
      const params = [];

      if (search) {
        sql += ' AND (description LIKE ? OR person LIKE ? OR category LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      if (month) {
        // Adapta a query de data para funcionar tanto em MySQL quanto em SQLite
        if (db.getDatabaseType() === 'sqlite') {
          sql += ' AND strftime("%Y-%m", due_date) = ?';
        } else {
          sql += ' AND DATE_FORMAT(due_date, "%Y-%m") = ?';
        }
        params.push(month);
      }

      sql += ' ORDER BY due_date DESC';

      const allResults = await getDatabase(req).query(sql, params);
      const total = allResults.length;

      const p = parseInt(page, 10);
      const ps = parseInt(pageSize, 10);
      const start = (p - 1) * ps;
      const pageItems = allResults.slice(start, start + ps);

      // Converte snake_case para camelCase
      const formattedItems = pageItems.map(item => {
        const value = parseFloat(item.value);
        const inferredType = (item.category && /venda/i.test(item.category)) ? 'venda'
          : (value < 0 ? 'saida' : (item.status === 'vencido' && !/venda/i.test(item.category) ? 'saida' : 'entrada'));
        return {
          id: item.id,
          category: item.category,
          dueDate: item.due_date,
          createdAt: item.created_at,
          description: item.description,
          person: item.person,
          value: value,
          // alias para frontends que usam `amount`
          amount: value,
          valueDue: parseFloat(item.value_due),
          paid: Boolean(item.paid),
          status: item.status,
          paymentDate: item.payment_date,
          paymentMethod: item.payment_method,
          notes: item.notes,
          quantity: item.quantity || 1,
          // usa type do banco se existir, senão infere
          type: item.type || inferredType
        };
      });

      res.json({ data: formattedItems, total });
    } catch (error) {
      console.error('Erro ao buscar transações:', error);
      res.status(500).json({ error: 'Erro ao buscar transações' });
    }
  });

  app.post('/api/transactions', async (req, res) => {
    try {
      const t = req.body;
      const id = uuidv4();
      // Suporta `value` (padronizado) ou `amount` (usado por algumas UIs)
      let amount = t.value !== undefined ? t.value : (t.amount !== undefined ? t.amount : 0);
      console.log('POST /api/transactions payload:', t);
      console.log('Computed amount before sign normalization:', amount);
      // Se o tipo enviado for 'saida', armazenar valor negativo para facilitar agregações (caixa)
      if (t.type === 'saida' && amount > 0) {
        amount = -Math.abs(amount);
      }

      // Se o tipo não foi fornecido, tentar inferir a partir do status/categoria.
      let postType = t.type;
      const category = t.category || (t.type ? (t.type === 'venda' ? 'Vendas' : (t.type === 'saida' ? 'Despesas' : 'Outros')) : 'Outros');

      // Se não for venda e estiver pendente/vencido (conta a pagar), assumir 'saida'
      if (!postType && /(venda)/i.test(category) === false) {
        if (t.status === 'vencido' || (t.paid === false && t.status !== 'pago')) {
          postType = 'saida';
          if (amount > 0) amount = -Math.abs(amount);
        }
      }

      console.log('Normalized amount:', amount, 'postType:', postType);
      const valueDue = t.valueDue !== undefined ? t.valueDue : amount;
      const quantity = t.quantity !== undefined ? t.quantity : 1;
      const createdAt = DateTimeUtils.nowForDB(); // Usar horário de Brasília
      
      const sql = `INSERT INTO transacoes 
        (id, category, due_date, description, person, value, value_due, paid, status, payment_date, payment_method, notes, type, quantity, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const params = [
        id,
        category,
        t.dueDate || DateTimeUtils.todayISO(),
        t.description || '',
        t.person || '',
        amount,
        valueDue,
        t.paid || false,
        t.status || (t.paid ? 'pago' : 'pendente'),
        t.paymentDate || null,
        t.paymentMethod || null,
        t.notes || null,
        postType || t.type || null,
        quantity,
        createdAt
      ];

      await getDatabase(req).query(sql, params);
      
      const newTransaction = {
        id,
        category,
        dueDate: t.dueDate,
        description: t.description,
        person: t.person,
        value: amount,
        amount: amount,
        valueDue: valueDue,
        paid: t.paid || false,
        status: t.status || (t.paid ? 'pago' : 'pendente'),
        type: t.type || (/(venda)/i.test(category) ? 'venda' : undefined)
      };

      // add PDV event for dashboard/activity feed
      try {
        addPdvEvent('transaction', `Transação criada: ${id}`, { id, amount, person: t.person, status: newTransaction.status, notes: t.notes ? (typeof t.notes === 'string' ? (t.notes.length > 2000 ? t.notes.slice(0,2000) + '...' : t.notes) : null) : null });
      } catch (e) { console.error('Erro ao registrar evento PDV:', e); }

      res.status(201).json(newTransaction);
    } catch (error) {
      console.error('Erro ao criar transação:', error);
      res.status(500).json({ error: 'Erro ao criar transação' });
    }
  });

  app.put('/api/transactions/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const t = req.body;

      // Se o status for 'pago', defina 'paid' como true
      if (t.status === 'pago') {
        t.paid = true;
      }

      // Suporta `amount` como alias para value
      let amount = t.value !== undefined ? t.value : (t.amount !== undefined ? t.amount : undefined);
      // Normalizar sinal: se tipo for 'saida', garante valor negativo; se for 'entrada', garante positivo
      if (t.type === 'saida' && amount !== undefined && amount > 0) {
        amount = -Math.abs(amount);
      }
      if (t.type === 'entrada' && amount !== undefined && amount < 0) {
        amount = Math.abs(amount);
      }

      const sql = `UPDATE transacoes SET 
        category = COALESCE(?, category),
        due_date = COALESCE(?, due_date),
        description = COALESCE(?, description),
        person = COALESCE(?, person),
        value = COALESCE(?, value),
        value_due = COALESCE(?, value_due),
        paid = COALESCE(?, paid),
        status = COALESCE(?, status),
        payment_date = ?,
        payment_method = ?,
        notes = ?
        WHERE id = ?`;

      const params = [
        t.category,
        t.dueDate,
        t.description,
        t.person,
        amount,
        t.valueDue,
        t.paid,
        t.status,
        t.paymentDate || null,
        t.paymentMethod || null,
        t.notes || null,
        id
      ];

      const result = await getDatabase(req).query(sql, params);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Transação não encontrada' });
      }

      // Buscar transação atualizada
      const [updated] = await getDatabase(req).query('SELECT * FROM transacoes WHERE id = ?', [id]);
      
      const value = parseFloat(updated.value);
      const inferredType = (updated.category && /venda/i.test(updated.category)) ? 'venda'
        : (value < 0 ? 'saida' : (updated.status === 'vencido' && !/venda/i.test(updated.category) ? 'saida' : 'entrada'));

      const formattedTransaction = {
        id: updated.id,
        category: updated.category,
        dueDate: updated.due_date,
        description: updated.description,
        person: updated.person,
        value: value,
        amount: value,
        valueDue: parseFloat(updated.value_due),
        paid: Boolean(updated.paid),
        status: updated.status,
        paymentDate: updated.payment_date,
        paymentMethod: updated.payment_method,
        notes: updated.notes,
        type: updated.type || inferredType
      };

      res.json(formattedTransaction);
    } catch (error) {
      console.error('Erro ao atualizar transação:', error);
      res.status(500).json({ error: 'Erro ao atualizar transação' });
    }
  });

  // Registrar recebimento para uma transação e gerar recibo
  app.post('/api/transactions/:id/receive', async (req, res) => {
    try {
      const id = req.params.id;
      const { amount, method, note, createdBy } = req.body;
      const amt = parseFloat(amount);
      if (!amt || isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Valor inválido' });

      const txRows = await getDatabase(req).query('SELECT * FROM transacoes WHERE id = ?', [id]);
      const tx = txRows && txRows.length ? txRows[0] : null;
      if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });

      const currentDue = parseFloat(tx.value_due !== null && tx.value_due !== undefined ? tx.value_due : tx.value);
      const newDue = Math.max(0, currentDue - amt);

      const receiptId = uuidv4();
      const insertSql = 'INSERT INTO receipts (id, transaction_id, amount, method, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
      await getDatabase(req).query(insertSql, [receiptId, id, amt, method || null, note || null, createdBy || null, DateTimeUtils.nowForDB()]);

      // Se pagamento parcial (novo saldo > 0), simplesmente atualizar o value_due
      // NÃO redistribuir entre parcelas - isso causava confusão e bugs
      let remainingTransactionId = null;
      if (newDue > 0 && newDue < currentDue) {
        // Pagamento parcial (HAVER): simplesmente atualizar o value_due da transação
        // O saldo restante fica na mesma transação para o cliente pagar depois
        const status = 'parcial';
        await getDatabase(req).query("UPDATE transacoes SET value_due = ?, paid = ?, status = ?, payment_method = CASE WHEN LOWER(COALESCE(payment_method,'')) = 'prazo' THEN payment_method ELSE COALESCE(?, payment_method) END WHERE id = ?", [newDue, false, status, method || null, id]);
      } else {
        // Atualiza a transação normalmente (pagamento total)
        const paymentDate = newDue === 0 ? DateTimeUtils.nowForDB() : null;
        const status = newDue === 0 ? 'pago' : 'parcial';
        await getDatabase(req).query("UPDATE transacoes SET value_due = ?, paid = ?, status = ?, payment_date = ?, payment_method = CASE WHEN LOWER(COALESCE(payment_method,'')) = 'prazo' THEN payment_method ELSE COALESCE(?, payment_method) END WHERE id = ?", [newDue, newDue === 0, status, paymentDate, method || null, id]);
      }

      const [receipt] = await getDatabase(req).query('SELECT * FROM receipts WHERE id = ?', [receiptId]);
      res.status(201).json({ id: receiptId, receipt, remainingTransactionId });
    } catch (err) {
      // Log mais detalhado para depuração
      console.error('Erro ao registrar recebimento:', err && err.message ? err.message : err);
      if (err && err.stack) console.error(err.stack);
      try { console.error('Request body:', JSON.stringify(req.body)); } catch(e) { /* ignore */ }
      res.status(500).json({ error: 'Erro ao registrar recebimento', detail: err && err.message ? err.message : String(err) });
    }
  });

  // Buscar recibo (JSON)
  app.get('/api/receipts/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const rows = await getDatabase(req).query('SELECT r.*, t.description as tx_description, t.person as tx_person, t.due_date as tx_due_date FROM receipts r LEFT JOIN transacoes t ON t.id = r.transaction_id WHERE r.id = ?', [id]);


      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Recibo não encontrado' });
      const r = rows[0];
      res.json({ data: r });
    } catch (err) {
      console.error('Erro ao buscar recibo:', err);
      res.status(500).json({ error: 'Erro ao buscar recibo' });
    }
  });

  // Listar recibos (por transactionId ou por pessoa)
  app.get('/api/receipts', async (req, res) => {
    try {
      const { transactionId, person, page = 1, pageSize = 50 } = req.query;
      let sql = 'SELECT r.*, t.description as tx_description, t.person as tx_person, t.due_date as tx_due_date FROM receipts r LEFT JOIN transacoes t ON t.id = r.transaction_id WHERE 1=1';
      const params = [];
      if (transactionId) {
        sql += ' AND r.transaction_id = ?';
        params.push(transactionId);
      }
      if (person) {
        sql += ' AND t.person = ?';
        params.push(person);
      }
      sql += ' ORDER BY r.created_at DESC';

      const all = await getDatabase(req).query(sql, params);
      const p = parseInt(page, 10);
      const ps = parseInt(pageSize, 10);
      const start = (p - 1) * ps;
      const pageItems = all.slice(start, start + ps);

      const items = pageItems.map(r => ({
        id: r.id,
        transactionId: r.transaction_id,
        amount: parseFloat(r.amount),
        method: r.method,
        note: r.note || r.notes || '',
        createdAt: r.created_at,
        createdBy: r.created_by,
        txDescription: r.tx_description,
        txPerson: r.tx_person,
        txDueDate: r.tx_due_date
      }));

      res.json({ data: items, total: all.length });
    } catch (err) {
      console.error('Erro ao listar recibos:', err);
      res.status(500).json({ error: 'Erro ao listar recibos' });
    }
  });

  // Receber requisição de impressão para Elgin i8 (mock)
  app.post('/api/print/elgin', async (req, res) => {
    try {
      const { coupon, sale, device } = req.body || {};
      if (!coupon) return res.status(400).json({ error: 'Cupom vazio' });
      const dir = path.join(__dirname, '..', 'printouts');
      try { if (!fs.existsSync(dir)) fs.mkdirSync(dir); } catch(e) { console.warn('Não foi possível criar pasta printouts:', e); }
      const filename = path.join(dir, 'elgin-' + Date.now() + '.txt');
      fs.writeFileSync(filename, coupon);
      console.log('Elgin print saved to', filename, 'device:', device || 'unknown');

      // Try ESC/POS direct print for Elgin i8 (optional, requires `escpos` and native libs)
      let escposResult = null;
      let elginEscpos = null;
      try {
        elginEscpos = require('./elgin-escpos');
      } catch(e) {
        // optional module not available
        elginEscpos = null;
      }

      const wantEscpos = (device === 'elgin-i8') && (!!req.body && (req.body.escpos || process.env.ELGIN_ESC_POS === '1'));
      if (wantEscpos && elginEscpos) {
        try {
          escposResult = await elginEscpos.printEscpos(coupon, { printerName: req.body.printerName || process.env.ELGIN_PRINTER_NAME, usbVidPid: req.body.usbVidPid || process.env.ELGIN_USB_VID_PID, network: req.body.network });
          console.log('Elgin ESC/POS result:', escposResult);
        } catch (escErr) {
          console.error('ESC/POS print error:', escErr);
          escposResult = { error: String(escErr) };
        }
      }

      // If auto-print enabled (env var) or request requested it, also attempt to send to local printer (text fallback)
      const autoPrint = (!!req.body && (req.body.autoPrint || req.body.autoSend)) || (process.env.ELGIN_PRINT_ENABLED === '1');
      let printResult = null;
      if (autoPrint) {
        try {
          const printerName = process.env.ELGIN_PRINTER_NAME || null;
          printResult = await printService.printFile(filename, { printerName });
          console.log('Print service result:', printResult);
        } catch (printErr) {
          console.error('Falha ao imprimir localmente:', printErr);
        }
      }

      return res.json({ status: 'saved', file: filename, escposResult, printResult });
    } catch (err) {
      console.error('Erro ao processar impressão Elgin:', err);
      return res.status(500).json({ error: 'Erro interno ao processar impressão' });
    }
  });

  // Recebimento em lote (bulk)
  // Recebimento em lote (bulk) - NÃO redistribui entre parcelas
  // Cada item é tratado individualmente, atualizando apenas seu próprio value_due
  app.post('/api/transactions/bulk-receive', async (req, res) => {
    try {
      const { items } = req.body || {};
      if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Nenhum item fornecido' });

      const receipts = [];

      // Função auxiliar para processar um item (mesma lógica do endpoint individual /receive)
      const processItem = async (conn, it) => {
        const { id, amount, method, note, createdBy } = it;
        const txRows = await (conn || getDatabase(req)).query('SELECT * FROM transacoes WHERE id = ?', [id]);
        const tx = txRows && txRows.length ? txRows[0] : null;
        if (!tx) throw new Error('Transação não encontrada: ' + id);
        
        const currentDue = parseFloat(tx.value_due !== null && tx.value_due !== undefined ? tx.value_due : tx.value);
        const newDue = Math.max(0, currentDue - amount);
        const receiptId = uuidv4();
        
        // Inserir recibo
        const insertSql = 'INSERT INTO receipts (id, transaction_id, amount, method, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
        if (conn) {
          await conn.execute(insertSql, [receiptId, id, amount, method || null, note || null, createdBy || null, DateTimeUtils.nowForDB()]);
        } else {
          await getDatabase(req).query(insertSql, [receiptId, id, amount, method || null, note || null, createdBy || null, DateTimeUtils.nowForDB()]);
        }

        // Atualizar apenas a transação específica - SEM redistribuir entre parcelas irmãs
        // Isso é o comportamento correto: haver na parcela 1 afeta APENAS a parcela 1
        const paymentDate = newDue === 0 ? DateTimeUtils.nowForDB() : null;
        const status = newDue === 0 ? 'pago' : (newDue < currentDue ? 'parcial' : 'pendente');
        const updateSql = "UPDATE transacoes SET value_due = ?, paid = ?, status = ?, payment_date = ?, payment_method = CASE WHEN LOWER(COALESCE(payment_method,'')) = 'prazo' THEN payment_method ELSE COALESCE(?, payment_method) END WHERE id = ?";
        
        if (conn) {
          await conn.execute(updateSql, [newDue, newDue === 0 ? 1 : 0, status, paymentDate, method || null, id]);
        } else {
          await getDatabase(req).query(updateSql, [newDue, newDue === 0, status, paymentDate, method || null, id]);
        }

        return { id: receiptId, transaction_id: id };
      };

      if (db.getDatabaseType() === 'mysql') {
        await db.transaction(async (conn) => {
          for (const it of items) {
            const receipt = await processItem(conn, it);
            receipts.push(receipt);
          }
        });
      } else {
        // SQLite style (sequential processing; non-atomic)
        for (const it of items) {
          const receipt = await processItem(null, it);
          receipts.push(receipt);
        }
      }

      res.status(201).json({ receipts });
    } catch (err) {
      console.error('Erro no recebimento em lote:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Gerar HTML imprimível do recibo
  app.get('/api/receipts/:id/pdf', async (req, res) => {
    try {
      const id = req.params.id;
      const rows = await getDatabase(req).query('SELECT r.*, t.description as tx_description, t.person as tx_person, t.due_date as tx_due_date FROM receipts r LEFT JOIN transacoes t ON t.id = r.transaction_id WHERE r.id = ?', [id]);
      if (!rows || rows.length === 0) return res.status(404).send('<h3>Recibo não encontrado</h3>');
      const r = rows[0];

      // Attempt to get company info if present
      let empresa = null;
      try {
        const erows = await getDatabase(req).query('SELECT razao_social, nome_fantasia, cnpj FROM empresas LIMIT 1');
        if (erows && erows.length) empresa = erows[0];
      } catch(e) { /* ignore */ }

      const companyName = (empresa && (empresa.nome_fantasia || empresa.razao_social)) ? (empresa.nome_fantasia || empresa.razao_social) : 'Minha Empresa';

      const receiptDate = DateTimeUtils.formatDateTime(r.created_at);
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Recibo ${r.id}</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#222} .header{display:flex;justify-content:space-between;align-items:center} .company{font-weight:800;font-size:20px;color:#2b2b2b} .muted{color:#666;font-size:13px} .box{border:1px solid #e6e6e6;padding:14px;margin-top:12px;border-radius:6px;background:#fff} .row{display:flex;justify-content:space-between;margin-bottom:6px} .label{color:#555;font-weight:700;width:120px}</style></head><body><div class="header"><div class="company">${companyName}</div><div class="muted">Recibo: ${r.id}</div></div><div class="box"><div class="row"><div><span class="label">Cliente:</span> ${r.tx_person || '-'}</div><div><span class="label">Valor:</span> ${parseFloat(r.amount).toFixed(2)}</div></div><div class="row"><div><span class="label">Descrição:</span> ${r.tx_description || '-'}</div><div><span class="label">Método:</span> ${r.method || '-'}</div></div><div class="row"><div><span class="label">Data:</span> ${receiptDate}</div><div><span class="label">Venc.:</span> ${r.tx_due_date || '-'}</div></div><div style="margin-top:12px"><strong>Observações:</strong><div>${r.note || '-'}</div></div></div><div style="margin-top:18px"><button onclick="window.print()">Imprimir</button></div></body></html>`;

      // If puppeteer is available, render PDF and return
      let puppeteerAvailable = false;
      try { require.resolve('puppeteer'); puppeteerAvailable = true; } catch(e) { puppeteerAvailable = false; }

      if (puppeteerAvailable) {
        try {
          const puppeteer = require('puppeteer');
          const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle0' });
          const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
          await browser.close();
          res.set('Content-Type', 'application/pdf');
          res.set('Content-Disposition', `inline; filename="recibo_${r.id}.pdf"`);
          return res.send(pdfBuffer);
        } catch (e) {
          console.warn('Puppeteer PDF failed, falling back to HTML:', e.message);
          // fallback to HTML below
        }
      }

      // Fallback: return printable HTML
      res.set('Content-Type', 'text/html');
      res.send(html);
    } catch (err) {
      console.error('Erro ao gerar PDF do recibo:', err);
      res.status(500).send('<h3>Erro ao gerar recibo</h3>');
    }
  });

  app.delete('/api/transactions/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const result = await getDatabase(req).query('DELETE FROM transacoes WHERE id = ?', [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Transação não encontrada' });
      }

      res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao deletar transação:', error);
      res.status(500).json({ error: 'Erro ao deletar transação' });
    }
  });

  // Endpoint de resumo/dashboard (lucro real)
  app.get('/api/dashboard', async (req, res) => {
    try {
      const { month = '' } = req.query; // formato YYYY-MM

      // Filtrar vendas por mês se fornecido
      let vendasDateCond = '';
      let vendasParams = [];
      if (month) {
        if (db.getDatabaseType() === 'sqlite') {
          vendasDateCond = "WHERE strftime('%Y-%m', sale_date) = ?";
        } else {
          vendasDateCond = 'WHERE DATE_FORMAT(sale_date, "%Y-%m") = ?';
        }
        vendasParams.push(month);
      }

      // Total de vendas no período
      const totalVendasRow = await getDatabase(req).query(`SELECT COALESCE(SUM(total),0) as totalSales FROM vendas ${vendasDateCond}`, vendasParams);
      const totalSales = parseFloat(totalVendasRow[0].totalSales || 0);

      // Custo dos itens vendidos (Custo * quantidade)
      const totalCostRow = await getDatabase(req).query(
        `SELECT COALESCE(SUM(vi.quantity * COALESCE(p.cost,0)),0) as totalCost FROM vendas_itens vi
         JOIN vendas v ON vi.sale_id = v.id
         LEFT JOIN produtos p ON vi.product_id = p.id
         ${vendasDateCond}`,
        vendasParams
      );
      const totalCost = parseFloat(totalCostRow[0].totalCost || 0);

      // Transações financeiras no período (entradas/saídas)
      let txDateCond = '';
      let txParams = [];
      if (month) {
        if (db.getDatabaseType() === 'sqlite') {
          txDateCond = "AND strftime('%Y-%m', due_date) = ?";
        } else {
          txDateCond = 'AND DATE_FORMAT(due_date, "%Y-%m") = ?';
        }
        txParams.push(month);
      }

      const txRows = await getDatabase(req).query(`SELECT value FROM transacoes WHERE 1=1 ${txDateCond}`, txParams);
      const entradas = txRows.filter(r => parseFloat(r.value) > 0).reduce((s, r) => s + parseFloat(r.value), 0);
      const saidas = txRows.filter(r => parseFloat(r.value) < 0).reduce((s, r) => s + Math.abs(parseFloat(r.value)), 0);

      const profit = totalSales - totalCost;

      res.json({ totalSales, totalCost, profit, entradas, saidas });
    } catch (error) {
      console.error('Erro ao calcular dashboard:', error);
      res.status(500).json({ error: 'Erro ao calcular dashboard' });
    }
  });

  // Endpoint: agregados por período (por dia) para uso no dashboard
  app.get('/api/dashboard/period', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.json({ salesMap: {}, entradasMap: {}, saidasMap: {}, totalSales: 0, totalEntradas: 0, totalSaidas: 0 });

      // Sales per day
      let saleSql;
      const params = [startDate, endDate + ' 23:59:59'];
      if (db.getDatabaseType() === 'sqlite') {
        saleSql = `SELECT strftime('%Y-%m-%d', sale_date) as day, COALESCE(SUM(total),0) as total FROM vendas WHERE sale_date >= ? AND sale_date <= ? GROUP BY day ORDER BY day`;
      } else {
        saleSql = `SELECT DATE(sale_date) as day, IFNULL(SUM(total),0) as total FROM vendas WHERE sale_date >= ? AND sale_date <= ? GROUP BY day ORDER BY day`;
      }
      const salesRows = await getDatabase(req).query(saleSql, params);
      const salesMap = {};
      salesRows.forEach(r => { salesMap[r.day] = parseFloat(r.total || 0); });

      // Transactions per day (entradas/saidas)
      let txSql;
      if (db.getDatabaseType() === 'sqlite') {
        // Excluir vendas da soma de 'entradas' para evitar duplicidade (vendas aparecem separadas)
        txSql = `SELECT strftime('%Y-%m-%d', due_date) as day, SUM(CASE WHEN value>0 AND LOWER(COALESCE(category,'')) != 'vendas' THEN value ELSE 0 END) as entradas, SUM(CASE WHEN value<0 THEN ABS(value) ELSE 0 END) as saidas FROM transacoes WHERE due_date >= ? AND due_date <= ? GROUP BY day ORDER BY day`;
      } else {
        txSql = `SELECT DATE(due_date) as day, SUM(CASE WHEN value>0 AND LOWER(COALESCE(category,'')) != 'vendas' THEN value ELSE 0 END) as entradas, SUM(CASE WHEN value<0 THEN ABS(value) ELSE 0 END) as saidas FROM transacoes WHERE due_date >= ? AND due_date <= ? GROUP BY day ORDER BY day`;
      }
      const txRows = await getDatabase(req).query(txSql, params);
      const entradasMap = {};
      const saidasMap = {};
      txRows.forEach(r => { entradasMap[r.day] = parseFloat(r.entradas || 0); saidasMap[r.day] = parseFloat(r.saidas || 0); });

      // Também agregamos vendas registradas como transações (categoria 'Vendas') para assegurar que vendas do PDV apareçam
      let txSaleSql;
      // Evita dupla contagem incluindo transações geradas pelo PDV (descrição/notes com 'Venda PDV' ou 'Parcela')
      if (db.getDatabaseType() === 'sqlite') {
        txSaleSql = `SELECT strftime('%Y-%m-%d', due_date) as day, COALESCE(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(category,'')) = 'vendas' AND LOWER(COALESCE(description,'')) NOT LIKE '%venda pdv%' AND LOWER(COALESCE(notes,'')) NOT LIKE '%parcela%' AND due_date >= ? AND due_date <= ? GROUP BY day ORDER BY day`;
      } else {
        txSaleSql = `SELECT DATE(due_date) as day, IFNULL(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(category,'')) = 'vendas' AND LOWER(COALESCE(description,'')) NOT LIKE '%venda pdv%' AND LOWER(COALESCE(notes,'')) NOT LIKE '%parcela%' AND due_date >= ? AND due_date <= ? GROUP BY day ORDER BY day`;
      }
      const txSaleRows = await getDatabase(req).query(txSaleSql, params);
      txSaleRows.forEach(r => { salesMap[r.day] = (salesMap[r.day] || 0) + parseFloat(r.total || 0); });

      const totalSales = Object.values(salesMap).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      const totalEntradas = Object.values(entradasMap).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      const totalSaidas = Object.values(saidasMap).reduce((s, v) => s + (parseFloat(v) || 0), 0);

      res.json({ salesMap, entradasMap, saidasMap, totalSales, totalEntradas, totalSaidas });
    } catch (error) {
      console.error('Erro ao agregar período do dashboard:', error);
      res.status(500).json({ error: 'Erro ao agregar período' });
    }
  });

  // Fiado (créditos a receber) — total e mapas por dia
  app.get('/api/dashboard/fiado', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      // Helper: format params
      const hasRange = startDate && endDate;
      const params = hasRange ? [startDate, endDate + ' 23:59:59'] : [];

      // credit sales per day (payment_method = 'prazo')
      let creditSalesMap = {};
      let creditReceiptsMap = {};

      if (hasRange) {
        let csSql;
        if (db.getDatabaseType() === 'sqlite') {
          csSql = `SELECT strftime('%Y-%m-%d', sale_date) as day, COALESCE(SUM(total),0) as total FROM vendas WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND sale_date >= ? AND sale_date <= ? GROUP BY day ORDER BY day`;
        } else {
          csSql = `SELECT DATE(sale_date) as day, IFNULL(SUM(total),0) as total FROM vendas WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND sale_date >= ? AND sale_date <= ? GROUP BY day ORDER BY day`;
        }
        const csRows = await getDatabase(req).query(csSql, params);
        csRows.forEach(r => { creditSalesMap[r.day] = parseFloat(r.total || 0); });

        // Also include credit sales that were recorded as transactions (category = 'Vendas' with payment_method = 'prazo')
        let csTxSql;
        if (db.getDatabaseType() === 'sqlite') {
          csTxSql = `SELECT strftime('%Y-%m-%d', due_date) as day, COALESCE(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'vendas' AND due_date >= ? AND due_date <= ? GROUP BY day ORDER BY day`;
        } else {
          csTxSql = `SELECT DATE(due_date) as day, IFNULL(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'vendas' AND due_date >= ? AND due_date <= ? GROUP BY day ORDER BY day`;
        }
        try {
          const csTxRows = await getDatabase(req).query(csTxSql, params);
          csTxRows.forEach(r => { creditSalesMap[r.day] = (creditSalesMap[r.day] || 0) + parseFloat(r.total || 0); });
        } catch(e) { console.warn('Erro ao agregar transacoes como credit sales:', e); }

        // receipts per day (transacoes with payment_method = 'prazo' and category = 'entrada' and paid = 1)
        let crSql;
        if (db.getDatabaseType() === 'sqlite') {
          crSql = `SELECT strftime('%Y-%m-%d', payment_date) as day, COALESCE(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'entrada' AND paid = 1 AND payment_date >= ? AND payment_date <= ? GROUP BY day ORDER BY day`;
        } else {
          crSql = `SELECT DATE(payment_date) as day, IFNULL(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'entrada' AND paid = 1 AND payment_date >= ? AND payment_date <= ? GROUP BY day ORDER BY day`;
        }
        const crRows = await getDatabase(req).query(crSql, params);
        crRows.forEach(r => { creditReceiptsMap[r.day] = parseFloat(r.total || 0); });
      }

      // Totals up to endDate (or all time if not provided)
      const endParam = (endDate ? endDate + ' 23:59:59' : null);
      let totalCreditSalesSql, totalCreditReceiptsSql, beforeSalesSql, beforeReceiptsSql;
      if (db.getDatabaseType() === 'sqlite') {
        totalCreditSalesSql = endParam ? `SELECT COALESCE(SUM(total),0) as total FROM vendas WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND sale_date <= ?` : `SELECT COALESCE(SUM(total),0) as total FROM vendas WHERE LOWER(COALESCE(payment_method,'')) = 'prazo'`;
        totalCreditReceiptsSql = endParam ? `SELECT COALESCE(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'entrada' AND paid = 1 AND payment_date <= ?` : `SELECT COALESCE(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'entrada' AND paid = 1`;
        beforeSalesSql = startDate ? `SELECT COALESCE(SUM(total),0) as total FROM vendas WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND sale_date < ?` : null;
        beforeReceiptsSql = startDate ? `SELECT COALESCE(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'entrada' AND paid = 1 AND payment_date < ?` : null;
      } else {
        totalCreditSalesSql = endParam ? `SELECT IFNULL(SUM(total),0) as total FROM vendas WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND sale_date <= ?` : `SELECT IFNULL(SUM(total),0) as total FROM vendas WHERE LOWER(COALESCE(payment_method,'')) = 'prazo'`;
        totalCreditReceiptsSql = endParam ? `SELECT IFNULL(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'entrada' AND paid = 1 AND payment_date <= ?` : `SELECT IFNULL(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'entrada' AND paid = 1`;
        beforeSalesSql = startDate ? `SELECT IFNULL(SUM(total),0) as total FROM vendas WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND sale_date < ?` : null;
        beforeReceiptsSql = startDate ? `SELECT IFNULL(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'entrada' AND paid = 1 AND payment_date < ?` : null;
      }

      const totalCreditSalesRow = endParam ? await getDatabase(req).query(totalCreditSalesSql, [endParam]) : await getDatabase(req).query(totalCreditSalesSql);
      let totalCreditSales = parseFloat((totalCreditSalesRow[0] && (totalCreditSalesRow[0].total || 0)) || 0);

      // Include transacoes that represent credit sales (category = 'vendas', payment_method = 'prazo') in totals
      try {
        let txTotalSql;
        // Evita somar transações geradas pelo PDV que já estão representadas em `vendas` (ex.: "Venda PDV - Parcela")
        // Filtra descrições/notes que contenham indicadores de parcela/PDV para prevenir dupla contagem.
        if (db.getDatabaseType() === 'sqlite') {
          txTotalSql = endParam ? `SELECT COALESCE(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'vendas' AND LOWER(COALESCE(description,'')) NOT LIKE '%venda pdv%' AND LOWER(COALESCE(notes,'')) NOT LIKE '%parcela%' AND due_date <= ?` : `SELECT COALESCE(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'vendas' AND LOWER(COALESCE(description,'')) NOT LIKE '%venda pdv%' AND LOWER(COALESCE(notes,'')) NOT LIKE '%parcela%'`;
        } else {
          txTotalSql = endParam ? `SELECT IFNULL(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'vendas' AND LOWER(COALESCE(description,'')) NOT LIKE '%venda pdv%' AND LOWER(COALESCE(notes,'')) NOT LIKE '%parcela%' AND due_date <= ?` : `SELECT IFNULL(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'vendas' AND LOWER(COALESCE(description,'')) NOT LIKE '%venda pdv%' AND LOWER(COALESCE(notes,'')) NOT LIKE '%parcela%'`;
        }
        const txTotalRow = endParam ? await getDatabase(req).query(txTotalSql, [endParam]) : await getDatabase(req).query(txTotalSql);
        const txTotal = parseFloat((txTotalRow[0] && (txTotalRow[0].total || 0)) || 0);
        totalCreditSales += txTotal;
      } catch (e) { console.warn('Erro ao agregar totalCreditSales com transacoes:', e); }

      const totalCreditReceiptsRow = endParam ? await getDatabase(req).query(totalCreditReceiptsSql, [endParam]) : await getDatabase(req).query(totalCreditReceiptsSql);
      const totalCreditReceipts = parseFloat((totalCreditReceiptsRow[0] && (totalCreditReceiptsRow[0].total || 0)) || 0);

      // --- Novo: considerar apenas pagamentos IMEDIATOS (dinheiro / PIX / cartão) registrados em `receipts` como redução do fiado ---
      const immediateMethods = ['dinheiro','cash','pix','card','cartao','cartão','credit_card','debito','debit'];
      const methodsList = immediateMethods.map(m => m.toLowerCase()).join("','");

      let payReceiptsSql;
      // Considera tanto transacoes com payment_method = 'prazo' quanto transacoes que aparentam ser vendas do PDV
      // (descrição/note com "Venda PDV" ou "Parcela") para cobrir dados antigos onde payment_method foi sobrescrito.
      if (db.getDatabaseType() === 'sqlite') {
        // Somar apenas recibos que são pagamentos IMEDIATOS referentes a vendas a prazo
        payReceiptsSql = `SELECT COALESCE(SUM(r.amount),0) as total 
          FROM receipts r 
          JOIN transacoes t ON t.id = r.transaction_id 
          WHERE LOWER(COALESCE(r.method,'')) IN ('${methodsList}') 
            AND LOWER(COALESCE(t.payment_method,'')) = 'prazo'` + (endParam ? ' AND r.created_at <= ?' : '');
      } else {
        // Somar apenas recibos que são pagamentos IMEDIATOS referentes a vendas a prazo
        payReceiptsSql = `SELECT IFNULL(SUM(r.amount),0) as total 
          FROM receipts r 
          JOIN transacoes t ON t.id = r.transaction_id 
          WHERE LOWER(COALESCE(r.method,'')) IN ('${methodsList}') 
            AND LOWER(COALESCE(t.payment_method,'')) = 'prazo'` + (endParam ? ' AND r.created_at <= ?' : '');
      }
      const payReceiptsRow = endParam ? await getDatabase(req).query(payReceiptsSql, [endParam]) : await getDatabase(req).query(payReceiptsSql);
      console.log('DEBUG: payReceiptsSql executed', payReceiptsSql, '=>', payReceiptsRow && payReceiptsRow[0]);
      const totalPaidImmediateReceipts = parseFloat((payReceiptsRow[0] && (payReceiptsRow[0].total || 0)) || 0);

      let beforeSales = 0, beforeReceipts = 0, beforePaidImmediateReceipts = 0;
      if (beforeSalesSql) {
        const row = await getDatabase(req).query(beforeSalesSql, [startDate]);
        beforeSales = parseFloat((row[0] && (row[0].total || 0)) || 0);
      }
      if (beforeReceiptsSql) {
        const row = await getDatabase(req).query(beforeReceiptsSql, [startDate]);
        beforeReceipts = parseFloat((row[0] && (row[0].total || 0)) || 0);
      }
      if (startDate) {
        let beforePayReceiptsSql = null;
        if (db.getDatabaseType() === 'sqlite') {
          beforePayReceiptsSql = `SELECT COALESCE(SUM(r.amount),0) as total FROM receipts r JOIN transacoes t ON t.id = r.transaction_id WHERE LOWER(COALESCE(t.payment_method,'')) = 'prazo' AND LOWER(COALESCE(r.method,'')) IN ('${methodsList}') AND r.created_at < ?`;
        } else {
          beforePayReceiptsSql = `SELECT IFNULL(SUM(r.amount),0) as total FROM receipts r JOIN transacoes t ON t.id = r.transaction_id WHERE LOWER(COALESCE(t.payment_method,'')) = 'prazo' AND LOWER(COALESCE(r.method,'')) IN ('${methodsList}') AND r.created_at < ?`;
        }
        const beforePayRow = await getDatabase(req).query(beforePayReceiptsSql, [startDate]);
        beforePaidImmediateReceipts = parseFloat((beforePayRow[0] && (beforePayRow[0].total || 0)) || 0);
      }

      // outstanding agora desconta apenas pagamentos imediatos (cash/pix/cartão) registrados em receipts
      const outstanding = totalCreditSales - totalPaidImmediateReceipts;
      const outstandingBeforeStart = beforeSales - beforePaidImmediateReceipts;

      res.json({ creditSalesMap, creditReceiptsMap, totalCreditSales, totalCreditReceipts, totalPaidImmediateReceipts, outstanding, outstandingBeforeStart });
    } catch (error) {
      console.error('Erro ao calcular fiado:', error);
      res.status(500).json({ error: 'Erro ao calcular fiado' });
    }
  });

  // TOP produtos vendidos no período
  app.get('/api/dashboard/top-products', async (req, res) => {
    try {
      const { startDate, endDate, limit = 5 } = req.query;
      const params = [];
      let where = '';
      if (startDate && endDate) {
        where = ' WHERE v.sale_date >= ? AND v.sale_date <= ? ';
        params.push(startDate, endDate + ' 23:59:59');
      }
      const sql = `SELECT vi.product_id as id, vi.product_name as name, SUM(vi.quantity) as qty, SUM(vi.total_price) as revenue FROM vendas_itens vi JOIN vendas v ON vi.sale_id = v.id ${where} GROUP BY vi.product_id, vi.product_name ORDER BY qty DESC LIMIT ?`;
      params.push(parseInt(limit, 10));
      const rows = await getDatabase(req).query(sql, params);
      res.json({ data: rows.map(r => ({ id: r.id, name: r.name, qty: parseFloat(r.qty || 0), revenue: parseFloat(r.revenue || 0) })) });
    } catch (error) {
      console.error('Erro ao buscar top-products:', error);
      res.status(500).json({ error: 'Erro ao buscar top-products' });
    }
  });

  // Debug status endpoint (read-only, non-sensitive)
  app.get('/api/debug/status', async (req, res) => {
    try {
      const dbType = db && db.getDatabaseType ? db.getDatabaseType() : null;
      // counts (best-effort, ignore errors)
      let productsCount = null, salesCount = null;
      try { const p = await db.query('SELECT COUNT(*) as count FROM produtos'); productsCount = p && p[0] && (p[0].count || p[0]['COUNT(*)']) || 0; } catch(e) { productsCount = null; }
      try { const s = await db.query('SELECT COUNT(*) as count FROM vendas'); salesCount = s && s[0] && (s[0].count || s[0]['COUNT(*)']) || 0; } catch(e) { salesCount = null; }
      const info = {
        pid: process.pid,
        uptime: process.uptime(),
        node: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        dbType,
        productsCount,
        salesCount,
        serverDebugMode: serverDebugMode,
        pdvEventsCount: (typeof pdvEvents !== 'undefined') ? pdvEvents.length : null
      };
      res.json(info);
    } catch (error) {
      console.error('Erro em /api/debug/status:', error);
      res.status(500).json({ error: 'Erro ao buscar status' });
    }
  });

  // In-memory PDV events buffer (shows recent actions from PDV like sales and stock updates)
  const pdvEvents = [];
  function addPdvEvent(type, message, data) {
    const ev = { id: uuidv4(), type: type || 'info', message: message || '', data: data || null, ts: DateTimeUtils.nowForDB() };
    pdvEvents.push(ev);
    if (pdvEvents.length > 500) pdvEvents.shift();
    return ev;
  }

  app.get('/api/debug/events', async (req, res) => {
    try {
      const { limit = 50 } = req.query;
      const l = Math.min(parseInt(limit, 10) || 50, 500);
      // return newest first
      const list = pdvEvents.slice(-l).reverse();
      res.json({ data: list });
    } catch (error) {
      console.error('Erro em /api/debug/events:', error);
      res.status(500).json({ error: 'Erro ao buscar eventos' });
    }
  });

  app.post('/api/debug/events', async (req, res) => {
    try {
      const { type, message, data } = req.body;
      const ev = addPdvEvent(type, message, data);
      res.status(201).json(ev);
    } catch (error) {
      console.error('Erro ao criar /api/debug/events:', error);
      res.status(500).json({ error: 'Erro ao criar evento' });
    }
  });

  app.delete('/api/debug/events', async (req, res) => {
    try {
      pdvEvents.length = 0;
      res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao deletar eventos:', error);
      res.status(500).json({ error: 'Erro ao deletar eventos' });
    }
  });

  // TOP clientes por total de vendas no período
  app.get('/api/dashboard/top-clients', async (req, res) => {
    try {
      const { startDate, endDate, limit = 5 } = req.query;
      const params = [];
      let where = '';
      if (startDate && endDate) {
        where = ' WHERE sale_date >= ? AND sale_date <= ? ';
        params.push(startDate, endDate + ' 23:59:59');
      }
      const sql = `SELECT COALESCE(client_name, 'Cliente') as name, COUNT(*) as salesCount, COALESCE(SUM(total),0) as total FROM vendas ${where} GROUP BY client_name ORDER BY total DESC LIMIT ?`;
      params.push(parseInt(limit, 10));
      const rows = await getDatabase(req).query(sql, params);
      res.json({ data: rows.map(r => ({ name: r.name, salesCount: parseInt(r.salesCount || 0, 10), total: parseFloat(r.total || 0) })) });
    } catch (error) {
      console.error('Erro ao buscar top-clients:', error);
      res.status(500).json({ error: 'Erro ao buscar top-clients' });
    }
  });

  // Totais por forma de pagamento no período
  app.get('/api/dashboard/payments', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const params = [];
      let where = '';
      if (startDate && endDate) {
        where = ' WHERE sale_date >= ? AND sale_date <= ? ';
        params.push(startDate, endDate + ' 23:59:59');
      }
      const sql = `SELECT payment_method as method, COUNT(*) as count, COALESCE(SUM(total),0) as total FROM vendas ${where} GROUP BY payment_method ORDER BY total DESC`;
      const rows = await getDatabase(req).query(sql, params);
      res.json({ data: rows.map(r => ({ method: r.method || 'Desconhecido', count: parseInt(r.count || 0, 10), total: parseFloat(r.total || 0) })) });
    } catch (error) {
      console.error('Erro ao buscar pagamentos:', error);
      res.status(500).json({ error: 'Erro ao buscar pagamentos' });
    }
  });

  // ============================================
  // API DE PRODUTOS
  // ============================================

  app.get('/api/products', async (req, res) => {
    try {
      const tenantDb = getDatabase(req);
      const { page = 1, pageSize = 1000, search = '', category = '' } = req.query;
      
      let sql = 'SELECT * FROM produtos WHERE active = TRUE';
      const params = [];

      if (search) {
        sql += ' AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      if (category) {
        sql += ' AND category = ?';
        params.push(category);
      }

      sql += ' ORDER BY name ASC';

      const allResults = await tenantDb.query(sql, params);
      const total = allResults.length;

      const p = parseInt(page, 10);
      const ps = parseInt(pageSize, 10);
      const start = (p - 1) * ps;
      const pageItems = allResults.slice(start, start + ps);

      const formattedItems = pageItems.map(item => ({
        id: item.id,
        code: item.code,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        shortDescription: item.short_description,
        price: parseFloat(item.price),
        cost: parseFloat(item.cost || 0),
        margin: parseFloat(item.margin || 0),
        stock: item.stock,
        minStock: item.min_stock,
        category: item.category,
        subCategory: item.sub_category,
        brand: item.brand,
        description: item.description,
        barcode: item.barcode,
        photo: item.photo,
        active: Boolean(item.active)
      }));

      res.json({ data: formattedItems, total });
    } catch (error) {
      console.error('Erro ao buscar produtos:', error);
      res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
  });

  app.post('/api/products', async (req, res) => {
    try {
      const p = req.body;
      // Normalize barcode placeholder values to null before saving
      const barcodeNormalized = (p.barcode && String(p.barcode).trim().toUpperCase() === 'SEM GTIN') ? null : (p.barcode || null);
      // Safely log payload (avoid throws on circular structures)
      let payloadLog;
      try {
        payloadLog = JSON.stringify(p);
      } catch (e) {
        try { payloadLog = require('util').inspect(p, { depth: 2, maxArrayLength: 20 }); } catch (e2) { payloadLog = '[unserializable payload]'; }
      }
      console.log('POST /api/products payload:', payloadLog);
      const id = uuidv4();
      // Generate an automatic product code if none provided
      const generatedCode = (p.code && String(p.code).trim()) ? String(p.code).trim() : `PRD-${Date.now().toString(36)}-${Math.floor(Math.random()*9000+1000)}`;
      
      const sql = `INSERT INTO produtos 
        (id, code, name, sku, unit, short_description, price, cost, margin, stock, min_stock, 
         category, sub_category, brand, description, barcode, photo, active, ncm,
         icms_value, icms_rate, pis_value, pis_rate, cofins_value, cofins_rate, ipi_value, ipi_rate) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const params = [
        id,
        generatedCode,
        p.name || '',
        p.sku || null,
        p.unit || 'UN',
        p.shortDescription || null,
        p.price || 0,
        p.cost || 0,
        p.margin || 0,
        p.stock || 0,
        p.minStock || 0,
        p.category || 'Produtos',
        p.subCategory || null,
        p.brand || null,
        p.description || null,
        barcodeNormalized,
        p.photo || null,
        p.active !== undefined ? p.active : true,
        p.ncm || null,
        p.icms_value || 0,
        p.icms_rate || 0,
        p.pis_value || 0,
        p.pis_rate || 0,
        p.cofins_value || 0,
        p.cofins_rate || 0,
        p.ipi_value || 0,
        p.ipi_rate || 0
      ];

      await getDatabase(req).query(sql, params);
      
      const newProduct = {
        id,
        code: generatedCode,
        name: p.name,
        sku: p.sku,
        unit: p.unit || 'UN',
        shortDescription: p.shortDescription,
        price: p.price,
        cost: p.cost,
        stock: p.stock,
        minStock: p.minStock,
        category: p.category,
        subCategory: p.subCategory,
        brand: p.brand,
        description: p.description,
        barcode: barcodeNormalized,
        photo: p.photo,
        active: p.active !== undefined ? p.active : true,
        ncm: p.ncm || null,
        margin: p.margin || 0,
        icms_value: p.icms_value || 0,
        icms_rate: p.icms_rate || 0,
        pis_value: p.pis_value || 0,
        pis_rate: p.pis_rate || 0,
        cofins_value: p.cofins_value || 0,
        cofins_rate: p.cofins_rate || 0,
        ipi_value: p.ipi_value || 0,
        ipi_rate: p.ipi_rate || 0
      };

      res.status(201).json(newProduct);
    } catch (error) {
      console.error('Erro ao criar produto:', error && (error.message || error));
      console.error('Stack:', error && (error.stack || '(no stack)'));
      try { console.error('Payload (truncated):', JSON.stringify(p).slice(0,2000)); } catch(e) { console.error('Payload not serializable'); }

      // Tentativa de recovery: se for UNIQUE constraint (sku/code), tentar localizar e atualizar o registro existente
      try {
        const skuOrCode = p.sku || p.code || null;
        // Normalize error indicators for UNIQUE/duplicate constraint detection (supports SQLite and MySQL)
        const errCodeStr = error && error.code ? String(error.code).toLowerCase() : '';
        const errMsgStr = error && error.message ? String(error.message).toLowerCase() : '';
        console.log('Product insert error code/message:', errCodeStr, errMsgStr);
        if (skuOrCode && (
          (errCodeStr.includes('unique') || errCodeStr.includes('sqlite_constraint') || errCodeStr.includes('er_dup') || errCodeStr.includes('er_dup_entry')) ||
          (errMsgStr.includes('unique') || errMsgStr.includes('duplicate') || errMsgStr.includes('duplicate entry'))
        )) {
          const rows = await getDatabase(req).query('SELECT * FROM produtos WHERE sku = ? OR code = ? LIMIT 1', [skuOrCode, skuOrCode]);
          const found = rows && rows[0];
          if (found) {
            // Atualiza apenas campos fornecidos pelo payload
            const updateSql = `UPDATE produtos SET 
              code = COALESCE(?, code),
              name = COALESCE(?, name),
              sku = COALESCE(?, sku),
              unit = COALESCE(?, unit),
              short_description = ?,
              price = COALESCE(?, price),
              cost = COALESCE(?, cost),
              stock = COALESCE(?, stock),
              min_stock = COALESCE(?, min_stock),
              category = COALESCE(?, category),
              sub_category = ?,
              brand = ?,
              description = ?,
              barcode = ?,
              photo = ?,
              active = COALESCE(?, active),
              ncm = COALESCE(?, ncm),
              icms_value = COALESCE(?, icms_value),
              icms_rate = COALESCE(?, icms_rate),
              pis_value = COALESCE(?, pis_value),
              pis_rate = COALESCE(?, pis_rate),
              cofins_value = COALESCE(?, cofins_value),
              cofins_rate = COALESCE(?, cofins_rate),
              ipi_value = COALESCE(?, ipi_value),
              ipi_rate = COALESCE(?, ipi_rate)
              WHERE id = ?`;

            const paramsUpd = [
              p.code,
              p.name,
              p.sku,
              p.unit,
              p.shortDescription || null,
              p.price,
              p.cost,
              p.stock,
              p.minStock,
              p.category,
              p.subCategory || null,
              p.brand || null,
              p.description || null,
              p.barcode || null,
              p.photo || null,
              p.active,
              p.ncm || null,
              p.icms_value || 0,
              p.icms_rate || 0,
              p.pis_value || 0,
              p.pis_rate || 0,
              p.cofins_value || 0,
              p.cofins_rate || 0,
              p.ipi_value || 0,
              p.ipi_rate || 0,
              found.id
            ];

            await getDatabase(req).query(updateSql, paramsUpd);
            const [updated] = await getDatabase(req).query('SELECT * FROM produtos WHERE id = ?', [found.id]);
            const formattedProduct = {
              id: updated.id,
              code: updated.code,
              name: updated.name,
              sku: updated.sku,
              unit: updated.unit,
              shortDescription: updated.short_description,
              price: parseFloat(updated.price),
              cost: parseFloat(updated.cost || 0),
              stock: updated.stock,
              minStock: updated.min_stock,
              category: updated.category,
              subCategory: updated.sub_category,
              brand: updated.brand,
              description: updated.description,
              barcode: updated.barcode,
              photo: updated.photo,
              active: Boolean(updated.active),
              ncm: updated.ncm,
              icms_value: parseFloat(updated.icms_value || 0),
              icms_rate: parseFloat(updated.icms_rate || 0),
              pis_value: parseFloat(updated.pis_value || 0),
              pis_rate: parseFloat(updated.pis_rate || 0),
              cofins_value: parseFloat(updated.cofins_value || 0),
              cofins_rate: parseFloat(updated.cofins_rate || 0),
              ipi_value: parseFloat(updated.ipi_value || 0),
              ipi_rate: parseFloat(updated.ipi_rate || 0)
            };

            return res.json(formattedProduct);
          }
        }
      } catch (mergeErr) {
        console.error('Erro ao tentar merge após UNIQUE constraint:', mergeErr && (mergeErr.message || mergeErr));
      }

      const detail = (error && (error.message || String(error))) || 'unknown';
      const code = error && (error.code || null);
      const stackSnippet = error && error.stack ? error.stack.split('\n').slice(0,6).join('\n') : null;
      // Retorna informação adicional para debug em ambiente local
      res.status(500).json({ error: 'Erro ao criar produto', detail, code, stack: stackSnippet });
    }
  });

  // Bulk import endpoint - accepts array of items and will attempt insert or update per item
  app.post('/api/products/import', async (req, res) => {
    try {
      const items = Array.isArray(req.body) ? req.body : (req.body && req.body.items) ? req.body.items : [];
      if (!items || !items.length) return res.status(400).json({ error: 'Nenhum item fornecido para importação' });

      const results = [];
      for (const it of items) {
        try {
          // Build insert params similar to single create
          const id = uuidv4();
          const generatedCode = (it.code && String(it.code).trim()) ? String(it.code).trim() : `PRD-${Date.now().toString(36)}-${Math.floor(Math.random()*9000+1000)}`;
          const sqlIns = `INSERT INTO produtos (id, code, name, sku, unit, short_description, price, cost, margin, stock, min_stock, category, sub_category, brand, description, barcode, photo, active, ncm, icms_value, icms_rate, pis_value, pis_rate, cofins_value, cofins_rate, ipi_value, ipi_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
          const normalizedBarcode = (it.barcode && String(it.barcode).trim().toUpperCase() === 'SEM GTIN') ? null : (it.barcode || null);
          const paramsIns = [
            id,
            generatedCode,
            it.name || '',
            it.sku || null,
            it.unit || 'UN',
            it.shortDescription || null,
            it.price || 0,
            it.cost || 0,
            it.margin || 0,
            it.stock || 0,
            it.minStock || 0,
            it.category || 'Importado',
            it.subCategory || null,
            it.brand || null,
            it.description || null,
            normalizedBarcode,
            it.photo || null,
            it.active !== undefined ? it.active : true,
            it.ncm || null,
            it.icms_value || 0,
            it.icms_rate || 0,
            it.pis_value || 0,
            it.pis_rate || 0,
            it.cofins_value || 0,
            it.cofins_rate || 0,
            it.ipi_value || 0,
            it.ipi_rate || 0
          ];

          await getDatabase(req).query(sqlIns, paramsIns);
          // Fetch what was actually stored (barcode/stock) for confirmation
          try {
            const [stored] = await getDatabase(req).query('SELECT barcode, stock FROM produtos WHERE id = ?', [id]);
            console.log('Imported product created:', { id, barcode: stored && stored.barcode, stock: stored && stored.stock });
            results.push({ status: 'created', id, item: it, message: 'created', storedBarcode: stored && stored.barcode, storedStock: stored && stored.stock });
          } catch (fetchErr) {
            console.error('Erro ao buscar produto criado:', fetchErr);
            results.push({ status: 'created', id, item: it, message: 'created' });
          }
        } catch (err) {
          // Duplicate / unique handling: try to find existing product and update
          const skuOrCode = it.sku || it.code || null;
          const errCodeStr = err && err.code ? String(err.code).toLowerCase() : '';
          const errMsgStr = err && err.message ? String(err.message).toLowerCase() : '';
          if (skuOrCode && ((errCodeStr.includes('unique') || errCodeStr.includes('sqlite_constraint') || errCodeStr.includes('er_dup') || errCodeStr.includes('er_dup_entry')) || (errMsgStr.includes('unique') || errMsgStr.includes('duplicate') || errMsgStr.includes('duplicate entry')))) {
            // Normalize barcode in the update path as well
            const normalizedBarcode = (it.barcode && String(it.barcode).trim().toUpperCase() === 'SEM GTIN') ? null : (it.barcode || null);
            try {
              const rows = await getDatabase(req).query('SELECT * FROM produtos WHERE sku = ? OR code = ? LIMIT 1', [skuOrCode, skuOrCode]);
              const found = rows && rows[0];
              if (found) {
                const updateSql = `UPDATE produtos SET code = COALESCE(?, code), name = COALESCE(?, name), sku = COALESCE(?, sku), unit = COALESCE(?, unit), short_description = ?, price = COALESCE(?, price), cost = COALESCE(?, cost), stock = COALESCE(?, stock), min_stock = COALESCE(?, min_stock), category = COALESCE(?, category), sub_category = ?, brand = ?, description = ?, barcode = ?, photo = ?, active = COALESCE(?, active), ncm = COALESCE(?, ncm), icms_value = COALESCE(?, icms_value), icms_rate = COALESCE(?, icms_rate), pis_value = COALESCE(?, pis_value), pis_rate = COALESCE(?, pis_rate), cofins_value = COALESCE(?, cofins_value), cofins_rate = COALESCE(?, cofins_rate), ipi_value = COALESCE(?, ipi_value), ipi_rate = COALESCE(?, ipi_rate) WHERE id = ?`;
                const paramsUpd = [
                  it.code,
                  it.name,
                  it.sku,
                  it.unit,
                  it.shortDescription || null,
                  it.price,
                  it.cost,
                  it.stock,
                  it.minStock,
                  it.category,
                  it.subCategory || null,
                  it.brand || null,
                  it.description || null,
                  normalizedBarcode,
                  it.photo || null,
                  it.active,
                  it.ncm || null,
                  it.icms_value || 0,
                  it.icms_rate || 0,
                  it.pis_value || 0,
                  it.pis_rate || 0,
                  it.cofins_value || 0,
                  it.cofins_rate || 0,
                  it.ipi_value || 0,
                  it.ipi_rate || 0,
                  found.id
                ];
                await getDatabase(req).query(updateSql, paramsUpd);
                // Fetch stored values to confirm barcode/stock
                try {
                  const [stored] = await getDatabase(req).query('SELECT barcode, stock FROM produtos WHERE id = ?', [found.id]);
                  console.log('Imported product updated:', { id: found.id, barcode: stored && stored.barcode, stock: stored && stored.stock });
                  results.push({ status: 'updated', id: found.id, item: it, message: 'updated', storedBarcode: stored && stored.barcode, storedStock: stored && stored.stock });
                } catch (fetchErr) {
                  console.error('Erro ao buscar produto atualizado:', fetchErr);
                  results.push({ status: 'updated', id: found.id, item: it, message: 'updated' });
                }
                continue;
              }
            } catch (mergeErr) {
              results.push({ status: 'error', error: mergeErr.message || String(mergeErr), item: it, message: mergeErr.message || String(mergeErr) });
              continue;
            }
          }

          results.push({ status: 'error', error: err.message || String(err), item: it, message: err.message || String(err) });
        }
      }

      const created = results.filter(r => r.status === 'created').length;
      const updated = results.filter(r => r.status === 'updated').length;
      const failed = results.filter(r => r.status === 'error').length;
      res.json({ total: results.length, created, updated, failed, results });
    } catch (ex) {
      console.error('Erro no import bulk:', ex);
      res.status(500).json({ error: 'Erro ao importar produtos em lote', detail: ex.message });
    }
  });

  app.put('/api/products/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const p = req.body;
      // Normalize barcode placeholder values to null before updating
      const barcodeNormalized = (p.barcode && String(p.barcode).trim().toUpperCase() === 'SEM GTIN') ? null : (p.barcode || null);

      const sql = `UPDATE produtos SET 
        code = COALESCE(?, code),
        name = COALESCE(?, name),
        sku = COALESCE(?, sku),
        unit = COALESCE(?, unit),
        short_description = ?,
        price = COALESCE(?, price),
        cost = COALESCE(?, cost),
        margin = COALESCE(?, margin),
        stock = COALESCE(?, stock),
        min_stock = COALESCE(?, min_stock),
        category = COALESCE(?, category),
        sub_category = ?,
        brand = ?,
        description = ?,
        barcode = ?,
        photo = ?,
        active = COALESCE(?, active),
        ncm = COALESCE(?, ncm),
        icms_value = COALESCE(?, icms_value),
        icms_rate = COALESCE(?, icms_rate),
        pis_value = COALESCE(?, pis_value),
        pis_rate = COALESCE(?, pis_rate),
        cofins_value = COALESCE(?, cofins_value),
        cofins_rate = COALESCE(?, cofins_rate),
        ipi_value = COALESCE(?, ipi_value),
        ipi_rate = COALESCE(?, ipi_rate)
        WHERE id = ?`;

      const params = [
        p.code,
        p.name,
        p.sku,
        p.unit,
        p.shortDescription || null,
        p.price,
        p.cost,
        p.margin !== undefined ? p.margin : 0,
        p.stock,
        p.minStock,
        p.category,
        p.subCategory || null,
        p.brand || null,
        p.description || null,
        barcodeNormalized,
        p.photo || null,
        p.active,
        p.ncm || null,
        p.icms_value || 0,
        p.icms_rate || 0,
        p.pis_value || 0,
        p.pis_rate || 0,
        p.cofins_value || 0,
        p.cofins_rate || 0,
        p.ipi_value || 0,
        p.ipi_rate || 0,
        id
      ];

      const result = await getDatabase(req).query(sql, params);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      const [updated] = await getDatabase(req).query('SELECT * FROM produtos WHERE id = ?', [id]);
      
      const formattedProduct = {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        sku: updated.sku,
        unit: updated.unit,
        shortDescription: updated.short_description,
        price: parseFloat(updated.price),
        cost: parseFloat(updated.cost || 0),
        margin: parseFloat(updated.margin || 0),
        stock: updated.stock,
        minStock: updated.min_stock,
        category: updated.category,
        subCategory: updated.sub_category,
        brand: updated.brand,
        description: updated.description,
        barcode: updated.barcode,
        photo: updated.photo,
        active: Boolean(updated.active),
        ncm: updated.ncm,
        icms_value: parseFloat(updated.icms_value || 0),
        icms_rate: parseFloat(updated.icms_rate || 0),
        pis_value: parseFloat(updated.pis_value || 0),
        pis_rate: parseFloat(updated.pis_rate || 0),
        cofins_value: parseFloat(updated.cofins_value || 0),
        cofins_rate: parseFloat(updated.cofins_rate || 0),
        ipi_value: parseFloat(updated.ipi_value || 0),
        ipi_rate: parseFloat(updated.ipi_rate || 0)
      };

      try { addPdvEvent('product', `Produto atualizado: ${formattedProduct.code || formattedProduct.id}`, { id: formattedProduct.id, code: formattedProduct.code, stock: formattedProduct.stock }); } catch (e) { console.error('Erro ao registrar evento PDV (produto):', e); }

      res.json(formattedProduct);
    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      res.status(500).json({ error: 'Erro ao atualizar produto' });
    }
  });

  app.get('/api/products/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const [product] = await getDatabase(req).query('SELECT * FROM produtos WHERE id = ?', [id]);
      
      if (!product) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      
      const formattedProduct = {
        id: product.id,
        code: product.code,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        shortDescription: product.short_description,
        price: parseFloat(product.price),
        cost: parseFloat(product.cost || 0),
        margin: parseFloat(product.margin || 0),
        stock: product.stock,
        minStock: product.min_stock,
        category: product.category,
        subCategory: product.sub_category,
        brand: product.brand,
        description: product.description,
        barcode: product.barcode,
        photo: product.photo,
        active: Boolean(product.active),
        ncm: product.ncm,
        icms_value: parseFloat(product.icms_value || 0),
        icms_rate: parseFloat(product.icms_rate || 0),
        pis_value: parseFloat(product.pis_value || 0),
        pis_rate: parseFloat(product.pis_rate || 0),
        cofins_value: parseFloat(product.cofins_value || 0),
        cofins_rate: parseFloat(product.cofins_rate || 0),
        ipi_value: parseFloat(product.ipi_value || 0),
        ipi_rate: parseFloat(product.ipi_rate || 0)
      };
      
      res.json(formattedProduct);
    } catch (error) {
      console.error('Erro ao buscar produto:', error);
      res.status(500).json({ error: 'Erro ao buscar produto' });
    }
  });

  app.delete('/api/products/:id', async (req, res) => {
    try {
      const id = req.params.id;
      // Soft delete - marca como inativo ao invés de deletar
      const result = await getDatabase(req).query('UPDATE produtos SET active = FALSE WHERE id = ?', [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao deletar produto:', error);
      res.status(500).json({ error: 'Erro ao deletar produto' });
    }
  });

  // ============================================
  // API DE PESSOAS (CLIENTES/FORNECEDORES)
  // ============================================

  app.get('/api/people', async (req, res) => {
    try {
      const { page = 1, pageSize = 1000, search = '', type = '' } = req.query;
      
      let sql = 'SELECT * FROM pessoas WHERE 1=1';
      const params = [];

      if (search) {
        sql += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR document LIKE ? OR code LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }

      if (type) {
        sql += ' AND type = ?';
        params.push(type);
      }

      sql += ' ORDER BY name ASC';

      const allResults = await getDatabase(req).query(sql, params);
      const total = allResults.length;

      const p = parseInt(page, 10);
      const ps = parseInt(pageSize, 10);
      const start = (p - 1) * ps;
      const pageItems = allResults.slice(start, start + ps);

      const formattedItems = pageItems.map(item => ({
        id: item.id,
        code: item.code,
        name: item.name,
        fantasyName: item.fantasy_name,
        legalType: item.legal_type,
        type: item.type,
        document: item.document,
        rgIe: item.rg_ie,
        birthDate: item.birth_date,
        gender: item.gender,
        email: item.email,
        phone: item.phone,
        phone2: item.phone2,
        cep: item.cep,
        street: item.street,
        number: item.number,
        complement: item.complement,
        neighborhood: item.neighborhood,
        city: item.city,
        state: item.state,
        reference: item.reference,
        notes: item.notes,
        photo: item.photo,
        address: item.address
      }));

      res.json({ data: formattedItems, total });
    } catch (error) {
      console.error('Erro ao buscar pessoas:', error);
      res.status(500).json({ error: 'Erro ao buscar pessoas' });
    }
  });

  // Alias em Português para compatibilidade com frontends antigos
  app.get('/api/pessoas', async (req, res) => {
    try {
      const { page = 1, pageSize = 1000, search = '', type = '' } = req.query;
      let sql = 'SELECT * FROM pessoas WHERE 1=1';
      const params = [];

      if (search) {
        sql += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR document LIKE ? OR code LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }

      if (type) {
        sql += ' AND type = ?';
        params.push(type);
      }

      sql += ' ORDER BY name ASC';

      const allResults = await getDatabase(req).query(sql, params);
      const total = allResults.length;

      const p = parseInt(page, 10);
      const ps = parseInt(pageSize, 10);
      const start = (p - 1) * ps;
      const pageItems = allResults.slice(start, start + ps);

      const formattedItems = pageItems.map(item => ({
        id: item.id,
        code: item.code,
        name: item.name,
        fantasyName: item.fantasy_name,
        legalType: item.legal_type,
        type: item.type,
        document: item.document,
        rgIe: item.rg_ie,
        birthDate: item.birth_date,
        gender: item.gender,
        email: item.email,
        phone: item.phone,
        phone2: item.phone2,
        cep: item.cep,
        street: item.street,
        number: item.number,
        complement: item.complement,
        neighborhood: item.neighborhood,
        city: item.city,
        state: item.state,
        reference: item.reference,
        notes: item.notes,
        photo: item.photo,
        address: item.address
      }));

      res.json({ data: formattedItems, total });
    } catch (error) {
      console.error('Erro ao buscar pessoas (alias):', error);
      res.status(500).json({ error: 'Erro ao buscar pessoas' });
    }
  });

  app.post('/api/people', async (req, res) => {
    try {
      const p = req.body;
      const id = uuidv4();
      
      const sql = `INSERT INTO pessoas 
        (id, code, name, fantasy_name, legal_type, type, document, rg_ie, birth_date, gender, 
         email, phone, phone2, cep, street, number, complement, neighborhood, city, state, 
         reference, notes, photo, address) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const params = [
        id,
        p.code || null,
        p.name || '',
        p.fantasyName || null,
        p.legalType || 'PF',
        p.type || 'Cliente',
        p.document || null,
        p.rgIe || null,
        p.birthDate || null,
        p.gender || null,
        p.email || null,
        p.phone || null,
        p.phone2 || null,
        p.cep || null,
        p.street || null,
        p.number || null,
        p.complement || null,
        p.neighborhood || null,
        p.city || null,
        p.state || null,
        p.reference || null,
        p.notes || null,
        p.photo || null,
        p.address || null // Mantém compatibilidade com campo antigo
      ];

      await getDatabase(req).query(sql, params);
      
      const newPerson = {
        id,
        code: p.code,
        name: p.name,
        fantasyName: p.fantasyName,
        legalType: p.legalType,
        type: p.type || 'Cliente',
        document: p.document,
        rgIe: p.rgIe,
        birthDate: p.birthDate,
        gender: p.gender,
        email: p.email,
        phone: p.phone,
        phone2: p.phone2,
        cep: p.cep,
        street: p.street,
        number: p.number,
        complement: p.complement,
        neighborhood: p.neighborhood,
        city: p.city,
        state: p.state,
        reference: p.reference,
        notes: p.notes,
        photo: p.photo,
        address: p.address
      };

      res.status(201).json(newPerson);
    } catch (error) {
      console.error('Erro ao criar pessoa:', error);
      // Em ambiente de desenvolvimento, envie a mensagem de erro no detalhe para facilitar o debug
      res.status(500).json({ error: 'Erro ao criar pessoa', detail: error.message || String(error) });
    }
  });

  app.put('/api/people/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const p = req.body;

      const sql = `UPDATE pessoas SET 
        code = COALESCE(?, code),
        name = COALESCE(?, name),
        fantasy_name = ?,
        legal_type = COALESCE(?, legal_type),
        type = COALESCE(?, type),
        document = ?,
        rg_ie = ?,
        birth_date = ?,
        gender = ?,
        email = ?,
        phone = ?,
        phone2 = ?,
        cep = ?,
        street = ?,
        number = ?,
        complement = ?,
        neighborhood = ?,
        city = ?,
        state = ?,
        reference = ?,
        notes = ?,
        photo = ?,
        address = ?
        WHERE id = ?`;

      const params = [
        p.code,
        p.name,
        p.fantasyName || null,
        p.legalType,
        p.type,
        p.document || null,
        p.rgIe || null,
        p.birthDate || null,
        p.gender || null,
        p.email || null,
        p.phone || null,
        p.phone2 || null,
        p.cep || null,
        p.street || null,
        p.number || null,
        p.complement || null,
        p.neighborhood || null,
        p.city || null,
        p.state || null,
        p.reference || null,
        p.notes || null,
        p.photo || null,
        p.address || null,
        id
      ];

      const result = await getDatabase(req).query(sql, params);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Pessoa não encontrada' });
      }

      const [updated] = await getDatabase(req).query('SELECT * FROM pessoas WHERE id = ?', [id]);
      
      const formattedPerson = {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        fantasyName: updated.fantasy_name,
        legalType: updated.legal_type,
        type: updated.type,
        document: updated.document,
        rgIe: updated.rg_ie,
        birthDate: updated.birth_date,
        gender: updated.gender,
        email: updated.email,
        phone: updated.phone,
        phone2: updated.phone2,
        cep: updated.cep,
        street: updated.street,
        number: updated.number,
        complement: updated.complement,
        neighborhood: updated.neighborhood,
        city: updated.city,
        state: updated.state,
        reference: updated.reference,
        notes: updated.notes,
        photo: updated.photo,
        address: updated.address
      };

      res.json(formattedPerson);
    } catch (error) {
      console.error('Erro ao atualizar pessoa:', error);
      res.status(500).json({ error: 'Erro ao atualizar pessoa' });
    }
  });

  app.delete('/api/people/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const result = await getDatabase(req).query('DELETE FROM pessoas WHERE id = ?', [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Pessoa não encontrada' });
      }

      res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao deletar pessoa:', error);
      res.status(500).json({ error: 'Erro ao deletar pessoa' });
    }
  });

  // ============================================
  // API DE VENDAS (PDV)
  // ============================================

  app.get('/api/sales', async (req, res) => {
    try {
      const { startDate, endDate, limit = 100 } = req.query;
      
      let sql = `SELECT v.*, 
        (SELECT COUNT(*) FROM vendas_itens WHERE sale_id = v.id) as items_count 
        FROM vendas v WHERE 1=1`;
      const params = [];

      if (startDate) {
        sql += ' AND v.sale_date >= ?';
        params.push(startDate);
      }

      if (endDate) {
        sql += ' AND v.sale_date <= ?';
        params.push(endDate + ' 23:59:59');
      }

      sql += ' ORDER BY v.sale_date DESC LIMIT ?';
      params.push(parseInt(limit));

      const sales = await getDatabase(req).query(sql, params);

      const formattedSales = sales.map(sale => ({
        id: sale.id,
        clientName: sale.client_name,
        clientPhone: sale.client_phone,
        clientEmail: sale.client_email,
        subtotal: parseFloat(sale.subtotal),
        discount: parseFloat(sale.discount || 0),
        total: parseFloat(sale.total),
        paymentMethod: sale.payment_method,
        amountPaid: parseFloat(sale.amount_paid || 0),
        changeAmount: parseFloat(sale.change_amount || 0),
        saleDate: sale.sale_date,
        notes: sale.notes,
        itemsCount: sale.items_count
      }));

      res.json({ data: formattedSales, total: formattedSales.length });
    } catch (error) {
      console.error('Erro ao buscar vendas:', error);
      res.status(500).json({ error: 'Erro ao buscar vendas' });
    }
  });

  // Alias em português para compatibilidade com front-end existente
  app.get('/api/vendas', async (req, res) => {
    try {
      const { startDate, endDate, limit = 100 } = req.query;
      let sql = `SELECT v.*, (SELECT COUNT(*) FROM vendas_itens WHERE sale_id = v.id) as items_count FROM vendas v WHERE 1=1`;
      const params = [];

      if (startDate) {
        sql += ' AND v.sale_date >= ?';
        params.push(startDate);
      }

      if (endDate) {
        sql += ' AND v.sale_date <= ?';
        params.push(endDate + ' 23:59:59');
      }

      sql += ' ORDER BY v.sale_date DESC LIMIT ?';
      params.push(parseInt(limit));

      const sales = await getDatabase(req).query(sql, params);

      const formattedSales = sales.map(sale => ({
        id: sale.id,
        client_name: sale.client_name,
        client_phone: sale.client_phone,
        client_email: sale.client_email,
        subtotal: parseFloat(sale.subtotal),
        discount: parseFloat(sale.discount || 0),
        total: parseFloat(sale.total),
        payment_method: sale.payment_method,
        amount_paid: parseFloat(sale.amount_paid || 0),
        change_amount: parseFloat(sale.change_amount || 0),
        sale_date: sale.sale_date,
        notes: sale.notes,
        items_count: sale.items_count
      }));

      res.json({ data: formattedSales, total: formattedSales.length });
    } catch (error) {
      console.error('Erro ao buscar vendas (alias):', error);
      res.status(500).json({ error: 'Erro ao buscar vendas' });
    }
  });

  app.get('/api/sales/:id', async (req, res) => {
    try {
      const id = req.params.id;
      
      const [sale] = await getDatabase(req).query('SELECT * FROM vendas WHERE id = ?', [id]);
      
      if (!sale) {
        return res.status(404).json({ error: 'Venda não encontrada' });
      }

      const items = await getDatabase(req).query('SELECT * FROM vendas_itens WHERE sale_id = ?', [id]);

      const formattedSale = {
        id: sale.id,
        clientName: sale.client_name,
        clientPhone: sale.client_phone,
        clientEmail: sale.client_email,
        subtotal: parseFloat(sale.subtotal),
        discount: parseFloat(sale.discount || 0),
        total: parseFloat(sale.total),
        paymentMethod: sale.payment_method,
        amountPaid: parseFloat(sale.amount_paid || 0),
        changeAmount: parseFloat(sale.change_amount || 0),
        saleDate: sale.sale_date,
        notes: sale.notes,
        items: items.map(item => ({
          id: item.id,
          productId: item.product_id,
          productName: item.product_name,
          productSku: item.product_sku,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unit_price),
          totalPrice: parseFloat(item.total_price)
        }))
      };

      res.json(formattedSale);
    } catch (error) {
      console.error('Erro ao buscar venda:', error);
      res.status(500).json({ error: 'Erro ao buscar venda' });
    }
  });

  app.post('/api/sales', async (req, res) => {
    try {
      const sale = req.body;
      const saleId = uuidv4();

      // Basic validation
      const items = Array.isArray(sale.items) ? sale.items : [];
      if (!items.length) return res.status(400).json({ error: 'Nenhum item na venda' });

      // Pré-validação de estoque: consultar estoque atual do(s) produto(s)
      try {
        const byId = {};
        items.forEach(it => { if (it.productId) byId[it.productId] = (byId[it.productId] || 0) + (it.quantity || 1); });
        const ids = Object.keys(byId);
        if (ids.length) {
          // Buscar produtos em lote (SELECT WHERE id IN (...))
          const placeholders = ids.map(_=>'?').join(',');
          const rows = await getDatabase(req).query(`SELECT id, stock FROM produtos WHERE id IN (${placeholders})`, ids);
          const stockMap = {};
          rows.forEach(r => stockMap[r.id] = (r.stock || 0));
          const insufficient = ids.filter(id => (stockMap[id] || 0) < byId[id]);
          if (insufficient.length) {
            const details = insufficient.map(id => `Produto ${id} disponível: ${stockMap[id] || 0}, solicitado: ${byId[id]}`).join(' • ');
            return res.status(400).json({ error: 'Estoque insuficiente: ' + details });
          }
        }
      } catch (preErr) {
        console.warn('Erro ao validar estoque antes da venda:', preErr);
      }

      const createdTransactions = [];
      const createdReceipts = [];

      // Use DB transaction to ensure atomicity (MySQL uses async trans, SQLite needs sync callback)
      const tenantDb = getDatabase(req);
      console.log('🔍 [SALES] tenantDb:', {
        hasTenantDb: !!req.tenantDb,
        hasDb: !!tenantDb.db,
        dbType: tenantDb.getDatabaseType(),
        isWrapped: !!tenantDb.db?.pragma,
        transactionType: typeof tenantDb.transaction,
        isSameAsModule: tenantDb === db
      });
      
      // VERIFICAÇÃO: Garantir que estamos no banco do tenant
      if (!tenantDb.db && req.tenantId) {
        console.error('❌ [SALES] ERRO: tenantDb não é um wrapper de tenant válido! Usando fallback.');
      }
      
      if (tenantDb.getDatabaseType() === 'mysql') {
        await tenantDb.transaction(async (conn) => {
          const execute = conn.execute.bind(conn);

          // Insert sale
          const saleSql = `INSERT INTO vendas 
            (id, client_name, client_phone, client_email, subtotal, discount, total, 
             payment_method, amount_paid, change_amount, notes, sale_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

          const saleParams = [
            saleId,
            sale.clientName || null,
            sale.clientPhone || null,
            sale.clientEmail || null,
            sale.subtotal || 0,
            sale.discount || 0,
            sale.total || 0,
            sale.paymentMethod || 'Dinheiro',
            sale.amountPaid || 0,
            sale.changeAmount || 0,
            sale.notes || null,
            sale.saleDate || DateTimeUtils.nowForDB()
          ];

          await execute(saleSql, saleParams);

          // Insert items and update stock atomically (check stock availability)
          for (const item of items) {
            const itemSql = `INSERT INTO vendas_itens 
              (sale_id, product_id, product_name, product_sku, quantity, unit_price, total_price) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`;

            const itemParams = [
              saleId,
              item.productId || null,
              item.productName || item.name,
              item.productSku || item.sku || null,
              item.quantity || 1,
              item.unitPrice || item.price || 0,
              item.totalPrice || ((item.quantity || 1) * (item.unitPrice || item.price || 0))
            ];

            await execute(itemSql, itemParams);

            // Atomically decrement stock only if available
            const [updateResult] = await execute('UPDATE produtos SET stock = stock - ? WHERE id = ? AND stock >= ?', [item.quantity, item.productId, item.quantity]);
            if (!updateResult || updateResult.affectedRows === 0) throw new Error('Estoque insuficiente para o produto: ' + (item.productName || item.productId));
          }

          // Create financial transactions and receipts depending on payment method
          // SISTEMA DE PAGAMENTO MISTO INTELIGENTE
          const now = new Date();
          const nowStr = DateTimeUtils.nowForDB();
          const todayStr = DateTimeUtils.todayISO();
          const total = parseFloat(sale.total || 0);
          const installments = parseInt(sale.installments || 1, 10) || 1;
          
          // Processar pagamentos mistos (novo formato)
          const payments = Array.isArray(sale.payments) ? sale.payments : [];
          const amountPrazo = parseFloat(sale.amountPrazo || 0);
          const amountPaidUpfront = parseFloat(sale.amountPaid || 0);
          
          // Se tem payments (novo sistema), processar cada pagamento separadamente
          if (payments.length > 0) {
            // Agrupar pagamentos por método
            const paymentsByMethod = {};
            payments.forEach(p => {
              const method = p.method || 'cash';
              const amount = parseFloat(p.amount) || 0;
              if (amount > 0) {
                if (!paymentsByMethod[method]) paymentsByMethod[method] = 0;
                paymentsByMethod[method] += amount;
              }
            });
            
            // Processar pagamentos à vista (não prazo)
            for (const [method, amount] of Object.entries(paymentsByMethod)) {
              if (method === 'prazo') continue; // Prazo é processado separadamente
              
              const tId = uuidv4();
              await execute(`INSERT INTO transacoes (id, category, due_date, description, person, value, value_due, paid, status, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                tId,
                'Vendas',
                todayStr,
                `Venda PDV - Pagamento ${method} - ${items.length} item(ns)`,
                sale.clientName || null,
                amount,
                0,
                1,
                'pago',
                nowStr,
                method,
                `sale:${saleId} • Pagamento à vista`
              ]);
              createdTransactions.push(tId);
              
              const receiptId = uuidv4();
              await execute('INSERT INTO receipts (id, transaction_id, amount, method, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
                receiptId, tId, amount, method, 'Recebimento PDV', sale.clientName || null, DateTimeUtils.nowForDB()
              ]);
              createdReceipts.push(receiptId);
            }
            
            // Processar valor a prazo (parcelado)
            const prazoAmount = paymentsByMethod['prazo'] || 0;
            if (prazoAmount > 0) {
              const valuePer = prazoAmount / installments;
              
              for (let i = 1; i <= installments; i++) {
                const tId = uuidv4();
                const dueDate = DateTimeUtils.addDays(now, i * 30);
                const dueDateStr = DateTimeUtils.formatDateISO(dueDate);

                await execute(`INSERT INTO transacoes (id, category, due_date, description, person, value, value_due, paid, status, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                  tId,
                  'Vendas',
                  dueDateStr,
                  `Venda PDV - Parcela ${i}/${installments}`,
                  sale.clientName || null,
                  valuePer,
                  valuePer,
                  0,
                  'pendente',
                  null,
                  'prazo',
                  `Parcela ${i}/${installments} • sale:${saleId}`
                ]);
                createdTransactions.push(tId);
              }
            }
          } else {
            // Fallback: comportamento anterior para compatibilidade
            const payMethod = sale.paymentMethod || 'cash';

            if ((payMethod === 'card' || payMethod === 'prazo') && installments > 1) {
              // CORREÇÃO: Criar parcelas com valor CHEIO e aplicar entrada como recebimento parcial
              const valuePer = total / installments; // Valor integral por parcela
              
              for (let i = 1; i <= installments; i++) {
                const tId = uuidv4();
                const dueDate = DateTimeUtils.addDays(now, i * 30);
                const dueDateStr = DateTimeUtils.formatDateISO(dueDate);
                const isPaid = (payMethod === 'card');
                const initialValueDue = isPaid ? 0 : valuePer;
                const status = isPaid ? 'pago' : 'pendente';

                await execute(`INSERT INTO transacoes (id, category, due_date, description, person, value, value_due, paid, status, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                  tId,
                  'Vendas',
                  dueDateStr,
                  `Venda PDV - Parcela ${i}/${installments} - ${payMethod}`,
                  sale.clientName || null,
                  valuePer,
                  initialValueDue,
                  isPaid ? 1 : 0,
                  status,
                  isPaid ? nowStr : null,
                  payMethod,
                  `Parcela ${i}/${installments} • sale:${saleId}`
                ]);

                createdTransactions.push(tId);

                if (isPaid) {
                  const receiptId = uuidv4();
                  await execute('INSERT INTO receipts (id, transaction_id, amount, method, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [receiptId, tId, valuePer, payMethod, 'Recebimento PDV - parcela', sale.clientName || null, DateTimeUtils.nowForDB()]);
                  createdReceipts.push(receiptId);
                }
              }
              
              // Se houve entrada a prazo, registrar recebimento parcial na 1ª parcela e atualizar value_due
              if (payMethod === 'prazo' && amountPaidUpfront > 0 && createdTransactions.length > 0) {
                const firstInstallmentId = createdTransactions[0];
                const entryReceiptId = uuidv4();
                await execute('INSERT INTO receipts (id, transaction_id, amount, method, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
                  entryReceiptId, firstInstallmentId, amountPaidUpfront, 'cash', 'Entrada paga no ato da compra', sale.clientName || null, DateTimeUtils.nowForDB()
                ]);
                createdReceipts.push(entryReceiptId);
                
                // IMPORTANTE: Atualizar o value_due da primeira parcela
                const newValueDue = Math.max(0, valuePer - amountPaidUpfront);
                const newStatus = newValueDue <= 0 ? 'pago' : 'parcial';
                const newPaid = newValueDue <= 0 ? 1 : 0;
                await execute('UPDATE transacoes SET value_due = ?, status = ?, paid = ? WHERE id = ?', [
                  newValueDue, newStatus, newPaid, firstInstallmentId
                ]);
              }
            } else {
              const tId = uuidv4();
              const isPrazo = payMethod === 'prazo';
              const valueDue = isPrazo ? total : 0;
              const paid = isPrazo ? 0 : 1;
              const status = isPrazo ? 'pendente' : 'pago';
              const paymentDate = paid ? nowStr : null;

              await execute(`INSERT INTO transacoes (id, category, due_date, description, person, value, value_due, paid, status, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                tId,
                'Vendas',
                todayStr,
                `Venda PDV - ${items.length} item(ns) - ${payMethod}`,
                sale.clientName || null,
                total,
                valueDue,
                paid,
                status,
                paymentDate,
                payMethod,
                sale.notes || null
              ]);

              createdTransactions.push(tId);

              if (paid) {
                const receiptId = uuidv4();
                await execute('INSERT INTO receipts (id, transaction_id, amount, method, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [receiptId, tId, total, payMethod, 'Recebimento PDV', sale.clientName || null, DateTimeUtils.nowForDB()]);
                createdReceipts.push(receiptId);
              }
            }
          }

          // Add PDV event
          try { addPdvEvent('sale', `Venda registrada: ${saleId}`, { id: saleId, total, client: sale.clientName }); } catch (e) { /* ignore */ }
        });
      } else {
        // SQLite path: use synchronous transaction wrapper provided by better-sqlite3
        tenantDb.transaction((conn) => {
          // Insert sale
          conn.query(`INSERT INTO vendas 
            (id, client_name, client_phone, client_email, subtotal, discount, total, 
             payment_method, amount_paid, change_amount, notes, sale_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            saleId,
            sale.clientName || null,
            sale.clientPhone || null,
            sale.clientEmail || null,
            sale.subtotal || 0,
            sale.discount || 0,
            sale.total || 0,
            sale.paymentMethod || 'Dinheiro',
            sale.amountPaid || 0,
            sale.changeAmount || 0,
            sale.notes || null,
            sale.saleDate || DateTimeUtils.nowForDB()
          ]);

          for (const item of items) {
            conn.query(`INSERT INTO vendas_itens 
              (sale_id, product_id, product_name, product_sku, quantity, unit_price, total_price) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`, [
              saleId,
              item.productId || null,
              item.productName || item.name,
              item.productSku || item.sku || null,
              item.quantity || 1,
              item.unitPrice || item.price || 0,
              item.totalPrice || ((item.quantity || 1) * (item.unitPrice || item.price || 0))
            ]);

            const runRes = conn.query('UPDATE produtos SET stock = stock - ? WHERE id = ? AND stock >= ?', [item.quantity, item.productId, item.quantity]);
            if (!runRes || runRes.changes === 0) throw new Error('Estoque insuficiente para o produto: ' + (item.productName || item.productId));
          }

          // Transactions/receipts
          const now = new Date();
          const nowStr = DateTimeUtils.nowForDB();
          const todayStr = DateTimeUtils.todayISO();
          const total = parseFloat(sale.total || 0);
          const amountPaidUpfront = parseFloat(sale.amountPaid || 0);
          const payMethod = sale.paymentMethod || 'cash';
          const installments = parseInt(sale.installments || 1, 10) || 1;

          if ((payMethod === 'card' || payMethod === 'prazo') && installments > 1) {
            // CORREÇÃO: Criar parcelas com valor CHEIO e aplicar entrada como recebimento parcial
            // Isso garante que ao dar haver, apenas a parcela específica é afetada
            const valuePer = total / installments; // Valor integral por parcela
            
            for (let i = 1; i <= installments; i++) {
              const tId = uuidv4();
              const dueDate = DateTimeUtils.addDays(now, i * 30);
              const dueDateStr = DateTimeUtils.formatDateISO(dueDate);
              const isPaid = (payMethod === 'card');
              
              // Para a primeira parcela de venda a prazo com entrada, 
              // o value_due será atualizado após criar o recibo
              const initialValueDue = isPaid ? 0 : valuePer;
              const status = isPaid ? 'pago' : 'pendente';

              conn.query(`INSERT INTO transacoes (id, category, due_date, description, person, value, value_due, paid, status, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                tId,
                'Vendas',
                dueDateStr,
                `Venda PDV - Parcela ${i}/${installments} - ${payMethod}`,
                sale.clientName || null,
                valuePer,
                initialValueDue,
                isPaid ? 1 : 0,
                status,
                isPaid ? nowStr : null,
                payMethod,
                `Parcela ${i}/${installments} • sale:${saleId}`
              ]);

              createdTransactions.push(tId);

              if (isPaid) {
                const receiptId = uuidv4();
                conn.query('INSERT INTO receipts (id, transaction_id, amount, method, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [receiptId, tId, valuePer, payMethod, 'Recebimento PDV - parcela', sale.clientName || null, DateTimeUtils.nowForDB()]);
                createdReceipts.push(receiptId);
              }
            }
            
            // Se houve pagamento de entrada em venda a prazo, registrar como recebimento parcial na 1ª parcela
            // e atualizar o value_due corretamente
            if (payMethod === 'prazo' && amountPaidUpfront > 0 && createdTransactions.length > 0) {
              const firstInstallmentId = createdTransactions[0];
              const entryReceiptId = uuidv4();
              
              // Criar recibo da entrada
              conn.query('INSERT INTO receipts (id, transaction_id, amount, method, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
                entryReceiptId, firstInstallmentId, amountPaidUpfront, 'cash', 'Entrada paga no ato da compra', sale.clientName || null, DateTimeUtils.nowForDB()
              ]);
              createdReceipts.push(entryReceiptId);
              
              // IMPORTANTE: Atualizar o value_due da primeira parcela para refletir a entrada
              const newValueDue = Math.max(0, valuePer - amountPaidUpfront);
              const newStatus = newValueDue <= 0 ? 'pago' : 'parcial';
              const newPaid = newValueDue <= 0 ? 1 : 0;
              conn.query('UPDATE transacoes SET value_due = ?, status = ?, paid = ? WHERE id = ?', [
                newValueDue, newStatus, newPaid, firstInstallmentId
              ]);
            }
          } else {
            const tId = uuidv4();
            const isPrazo = payMethod === 'prazo';
            const valueDue = isPrazo ? total : 0;
            const paid = isPrazo ? 0 : 1;
            const status = isPrazo ? 'pendente' : 'pago';
            const paymentDate = paid ? nowStr : null;

            conn.query(`INSERT INTO transacoes (id, category, due_date, description, person, value, value_due, paid, status, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
              tId,
              'Vendas',
              todayStr,
              `Venda PDV - ${items.length} item(ns) - ${payMethod}`,
              sale.clientName || null,
              total,
              valueDue,
              paid,
              status,
              paymentDate,
              payMethod,
              sale.notes || null
            ]);

            createdTransactions.push(tId);

            if (paid) {
              const receiptId = uuidv4();
              conn.query('INSERT INTO receipts (id, transaction_id, amount, method, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [receiptId, tId, total, payMethod, 'Recebimento PDV', sale.clientName || null, DateTimeUtils.nowForDB()]);
              createdReceipts.push(receiptId);
            }
          }

          try { addPdvEvent('sale', `Venda registrada: ${saleId}`, { id: saleId, total, client: sale.clientName }); } catch (e) { }
        });
      }

      res.status(201).json({ id: saleId, transactions: createdTransactions, receipts: createdReceipts });
    } catch (error) {
      console.error('Erro ao criar venda:', error);
      if (error && /Estoque insuficiente/i.test(error.message || '')) return res.status(400).json({ error: error.message });
      res.status(500).json({ error: error.message || 'Erro ao criar venda' });
    }
  });

  // ============================================
  // API DE AGENDA
  // ============================================

  app.get('/api/agenda', async (req, res) => {
    try {
      const { start, end } = req.query;
      
      let sql = 'SELECT * FROM agenda WHERE 1=1';
      const params = [];

      if (start) {
        sql += ' AND start_date >= ?';
        params.push(start);
      }

      if (end) {
        sql += ' AND start_date <= ?';
        params.push(end);
      }

      sql += ' ORDER BY start_date ASC';

      const events = await getDatabase(req).query(sql, params);

      const formattedEvents = events.map(event => ({
        id: event.id,
        title: event.title,
        description: event.description,
        start: event.start_date,
        end: event.end_date,
        allDay: Boolean(event.all_day),
        location: event.location,
        personId: event.person_id,
        color: event.color,
        reminderMinutes: event.reminder_minutes,
        status: event.status
      }));

      res.json({ data: formattedEvents, total: formattedEvents.length });
    } catch (error) {
      console.error('Erro ao buscar eventos:', error);
      res.status(500).json({ error: 'Erro ao buscar eventos' });
    }
  });

  app.post('/api/agenda', async (req, res) => {
    try {
      const event = req.body;
      // Validação mínima
      if (!event.title || !event.start) return res.status(400).json({ error: 'Título e data inicial são obrigatórios' });

      const id = uuidv4();

      // Normaliza datas para MySQL quando necessário
      let start = event.start;
      let end = event.end || null;
      if (db.getDatabaseType && db.getDatabaseType() === 'mysql') {
        start = db.formatDateTimeForMySQL(start);
        end = db.formatDateTimeForMySQL(end);
      }

      console.log('Criando evento:', { id, title: event.title, start, end });

      const sql = `INSERT INTO agenda 
        (id, title, description, start_date, end_date, all_day, location, person_id, color, reminder_minutes, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const params = [
        id,
        event.title || '',
        event.description || null,
        start || DateTimeUtils.nowForDB(),
        end || null,
        event.allDay || false,
        event.location || null,
        event.personId || null,
        event.color || '#3788d8',
        event.reminderMinutes || null,
        event.status || 'agendado'
      ];

      await getDatabase(req).query(sql, params);
      
      res.status(201).json({ id, ...event });
    } catch (error) {
      console.error('Erro ao criar evento:', error);
      console.error(error.stack);
      res.status(500).json({ error: 'Erro ao criar evento', details: error.message });
    }
  });

  app.put('/api/agenda/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const event = req.body;

      const sql = `UPDATE agenda SET 
        title = COALESCE(?, title),
        description = ?,
        start_date = COALESCE(?, start_date),
        end_date = ?,
        all_day = COALESCE(?, all_day),
        location = ?,
        person_id = ?,
        color = COALESCE(?, color),
        reminder_minutes = ?,
        status = COALESCE(?, status)
        WHERE id = ?`;

      const params = [
        event.title,
        event.description || null,
        event.start,
        event.end || null,
        event.allDay,
        event.location || null,
        event.personId || null,
        event.color,
        event.reminderMinutes || null,
        event.status,
        id
      ];

      const result = await getDatabase(req).query(sql, params);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Evento não encontrado' });
      }

      res.json({ id, message: 'Evento atualizado com sucesso' });
    } catch (error) {
      console.error('Erro ao atualizar evento:', error);
      res.status(500).json({ error: 'Erro ao atualizar evento' });
    }
  });

  app.delete('/api/agenda/:id', async (req, res) => {
    try {
      const id = req.params.id;
      console.log('Deletando evento:', id);
      const result = await getDatabase(req).query('DELETE FROM agenda WHERE id = ?', [id]);

      // Compatibilidade MySQL/SQLite
      const deleted = (result && (result.affectedRows !== undefined ? result.affectedRows : result.changes !== undefined ? result.changes : 0));
      if (!deleted) {
        return res.status(404).json({ error: 'Evento não encontrado' });
      }

      res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao deletar evento:', error);
      console.error(error.stack);
      res.status(500).json({ error: 'Erro ao deletar evento', details: error.message });
    }
  });

  // ============================================
  // DASHBOARD - Estatísticas
  // ============================================

  app.get('/api/dashboard/stats', async (req, res) => {
    try {
      const today = DateTimeUtils.todayISO();
      const thisMonth = today.substring(0, 7);

      // Adapta a query de data para funcionar tanto em MySQL quanto em SQLite
      const dateFilterField = db.getDatabaseType() === 'sqlite' ? 'strftime("%Y-%m", sale_date)' : 'DATE_FORMAT(sale_date, "%Y-%m")';

      // Total de vendas do mês
      const salesQuery = `
        SELECT 
          COUNT(*) as total_sales,
          COALESCE(SUM(total), 0) as total_revenue
        FROM vendas 
        WHERE ${dateFilterField} = ?`;
      const [salesStats] = await getDatabase(req).query(salesQuery, [thisMonth]);

      // Contas a receber
      const [receivables] = await getDatabase(req).query(
        `SELECT COALESCE(SUM(value_due), 0) as total_receivables
         FROM transacoes 
         WHERE paid = FALSE AND status != 'pago'`
      );

      // Contas a pagar
      const [payables] = await getDatabase(req).query(
        `SELECT COALESCE(SUM(value_due), 0) as total_payables
         FROM transacoes 
         WHERE paid = FALSE AND category IN ('Compras', 'Despesas', 'Fornecedor')`
      );

      // Produtos com estoque baixo
      const [lowStock] = await getDatabase(req).query(
        `SELECT COUNT(*) as low_stock_count
         FROM produtos 
         WHERE stock <= min_stock AND active = TRUE`
      );

      res.json({
        sales: {
          count: salesStats.total_sales || 0,
          revenue: parseFloat(salesStats.total_revenue || 0)
        },
        receivables: parseFloat(receivables.total_receivables || 0),
        payables: parseFloat(payables.total_payables || 0),
        lowStockCount: lowStock.low_stock_count || 0
      });
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
  });

  // ============================================
  // API DE RELATÓRIOS
  // ============================================

  // Resumo Financeiro Geral
  app.get('/api/reports/summary', async (req, res) => {
    try {
      const { from, to } = req.query;
      
      let sql;
      const params = [];
      
      if (db.getDatabaseType() === 'sqlite') {
        sql = `
          SELECT 
            SUM(CASE WHEN category NOT IN ('Pagamento', 'Despesa') THEN value ELSE 0 END) as income,
            SUM(CASE WHEN category IN ('Pagamento', 'Despesa') THEN value ELSE 0 END) as expenses,
            SUM(CASE WHEN category NOT IN ('Pagamento', 'Despesa') AND status = 'pago' THEN value ELSE 0 END) as received,
            SUM(CASE WHEN category NOT IN ('Pagamento', 'Despesa') AND status != 'pago' THEN value ELSE 0 END) as toReceive,
            SUM(CASE WHEN category IN ('Pagamento', 'Despesa') AND status = 'pago' THEN value ELSE 0 END) as paid,
            SUM(CASE WHEN category IN ('Pagamento', 'Despesa') AND status != 'pago' THEN value ELSE 0 END) as toPay
          FROM transacoes
          WHERE due_date BETWEEN ? AND ?
        `;
      } else {
        sql = `
          SELECT 
            SUM(CASE WHEN category NOT IN ('Pagamento', 'Despesa') THEN value ELSE 0 END) as income,
            SUM(CASE WHEN category IN ('Pagamento', 'Despesa') THEN value ELSE 0 END) as expenses,
            SUM(CASE WHEN category NOT IN ('Pagamento', 'Despesa') AND status = 'pago' THEN value ELSE 0 END) as received,
            SUM(CASE WHEN category NOT IN ('Pagamento', 'Despesa') AND status != 'pago' THEN value ELSE 0 END) as toReceive,
            SUM(CASE WHEN category IN ('Pagamento', 'Despesa') AND status = 'pago' THEN value ELSE 0 END) as paid,
            SUM(CASE WHEN category IN ('Pagamento', 'Despesa') AND status != 'pago' THEN value ELSE 0 END) as toPay
          FROM transacoes
          WHERE due_date BETWEEN ? AND ?
        `;
      }
      
      params.push(from, to);
      const results = await db.query(sql, params);
      const summary = results[0] || {};
      
      const income = parseFloat(summary.income || 0);
      const expenses = parseFloat(summary.expenses || 0);
      
      res.json({
        income,
        expenses,
        balance: income - expenses,
        received: parseFloat(summary.received || 0),
        toReceive: parseFloat(summary.toReceive || 0),
        paid: parseFloat(summary.paid || 0),
        toPay: parseFloat(summary.toPay || 0)
      });
    } catch (error) {
      console.error('Erro ao gerar resumo:', error);
      res.status(500).json({ error: 'Erro ao gerar resumo' });
    }
  });

  // Relatórios por Categoria
  app.get('/api/reports/by-category', async (req, res) => {
    try {
      const { from, to } = req.query;
      const params = [from, to];
      
      let sqlIncome, sqlExpense;
      
      if (db.getDatabaseType() === 'sqlite') {
        sqlIncome = `
          SELECT category, SUM(value) as total
          FROM transacoes
          WHERE category NOT IN ('Pagamento', 'Despesa') AND due_date BETWEEN ? AND ?
          GROUP BY category
          ORDER BY total DESC
        `;
        sqlExpense = `
          SELECT category, SUM(value) as total
          FROM transacoes
          WHERE category IN ('Pagamento', 'Despesa') AND due_date BETWEEN ? AND ?
          GROUP BY category
          ORDER BY total DESC
        `;
      } else {
        sqlIncome = `
          SELECT category, SUM(value) as total
          FROM transacoes
          WHERE category NOT IN ('Pagamento', 'Despesa') AND due_date BETWEEN ? AND ?
          GROUP BY category
          ORDER BY total DESC
        `;
        sqlExpense = `
          SELECT category, SUM(value) as total
          FROM transacoes
          WHERE category IN ('Pagamento', 'Despesa') AND due_date BETWEEN ? AND ?
          GROUP BY category
          ORDER BY total DESC
        `;
      }
      
      const income = await db.query(sqlIncome, params);
      const expense = await db.query(sqlExpense, params);
      
      res.json({ income, expense });
    } catch (error) {
      console.error('Erro ao gerar relatório por categoria:', error);
      res.status(500).json({ error: 'Erro ao gerar relatório por categoria' });
    }
  });

  // Relatórios por Forma de Pagamento
  app.get('/api/reports/by-payment', async (req, res) => {
    try {
      const { from, to } = req.query;
      const params = [from, to];
      
      let sql;
      if (db.getDatabaseType() === 'sqlite') {
        sql = `
          SELECT 
            payment_method as method,
            SUM(CASE WHEN category NOT IN ('Pagamento', 'Despesa') THEN value ELSE 0 END) as income,
            SUM(CASE WHEN category IN ('Pagamento', 'Despesa') THEN value ELSE 0 END) as expense
          FROM transacoes
          WHERE payment_date BETWEEN ? AND ? AND status = 'pago'
          GROUP BY payment_method
          ORDER BY income DESC
        `;
      } else {
        sql = `
          SELECT 
            payment_method as method,
            SUM(CASE WHEN category NOT IN ('Pagamento', 'Despesa') THEN value ELSE 0 END) as income,
            SUM(CASE WHEN category IN ('Pagamento', 'Despesa') THEN value ELSE 0 END) as expense
          FROM transacoes
          WHERE payment_date BETWEEN ? AND ? AND status = 'pago'
          GROUP BY payment_method
          ORDER BY income DESC
        `;
      }
      
      const results = await db.query(sql, params);
      res.json(results);
    } catch (error) {
      console.error('Erro ao gerar relatório por forma de pagamento:', error);
      res.status(500).json({ error: 'Erro ao gerar relatório por forma de pagamento' });
    }
  });

  // Vendas - Ranking de Produtos Mais Vendidos
  app.get('/api/reports/top-products', async (req, res) => {
    try {
      const { from, to, limit = 10 } = req.query;
      const params = [from, to];
      
      let sql;
      if (db.getDatabaseType() === 'sqlite') {
        sql = `
          SELECT 
            vi.product_name,
            vi.product_sku,
            SUM(vi.quantity) as total_quantity,
            SUM(vi.total_price) as total_value,
            COUNT(DISTINCT vi.sale_id) as num_sales
          FROM vendas_itens vi
          INNER JOIN vendas v ON vi.sale_id = v.id
          WHERE DATE(v.sale_date) BETWEEN ? AND ?
          GROUP BY vi.product_id, vi.product_name, vi.product_sku
          ORDER BY total_quantity DESC
          LIMIT ?
        `;
      } else {
        sql = `
          SELECT 
            vi.product_name,
            vi.product_sku,
            SUM(vi.quantity) as total_quantity,
            SUM(vi.total_price) as total_value,
            COUNT(DISTINCT vi.sale_id) as num_sales
          FROM vendas_itens vi
          INNER JOIN vendas v ON vi.sale_id = v.id
          WHERE DATE(v.sale_date) BETWEEN ? AND ?
          GROUP BY vi.product_id, vi.product_name, vi.product_sku
          ORDER BY total_quantity DESC
          LIMIT ?
        `;
      }
      
      params.push(parseInt(limit));
      const results = await db.query(sql, params);
      res.json(results);
    } catch (error) {
      console.error('Erro ao gerar ranking de produtos:', error);
      res.status(500).json({ error: 'Erro ao gerar ranking de produtos' });
    }
  });

  // Vendas por Período
  app.get('/api/reports/sales-by-period', async (req, res) => {
    try {
      const { from, to } = req.query;
      const params = [from, to];
      
      let sqlDaily, sqlWeekly, sqlMonthly, sqlYearly;
      
      if (db.getDatabaseType() === 'sqlite') {
        sqlDaily = `
          SELECT SUM(total) as total FROM vendas 
          WHERE DATE(sale_date) = DATE('now')
        `;
        sqlWeekly = `
          SELECT SUM(total) as total FROM vendas 
          WHERE DATE(sale_date) >= DATE('now', '-7 days')
        `;
        sqlMonthly = `
          SELECT SUM(total) as total FROM vendas 
          WHERE strftime('%Y-%m', sale_date) = strftime('%Y-%m', 'now')
        `;
        sqlYearly = `
          SELECT SUM(total) as total FROM vendas 
          WHERE strftime('%Y', sale_date) = strftime('%Y', 'now')
        `;
      } else {
        sqlDaily = `
          SELECT SUM(total) as total FROM vendas 
          WHERE DATE(sale_date) = CURDATE()
        `;
        sqlWeekly = `
          SELECT SUM(total) as total FROM vendas 
          WHERE DATE(sale_date) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        `;
        sqlMonthly = `
          SELECT SUM(total) as total FROM vendas 
          WHERE DATE_FORMAT(sale_date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
        `;
        sqlYearly = `
          SELECT SUM(total) as total FROM vendas 
          WHERE YEAR(sale_date) = YEAR(NOW())
        `;
      }
      
      const [daily, weekly, monthly, yearly] = await Promise.all([
        db.query(sqlDaily),
        db.query(sqlWeekly),
        db.query(sqlMonthly),
        db.query(sqlYearly)
      ]);
      
      res.json({
        daily: parseFloat(daily[0]?.total || 0),
        weekly: parseFloat(weekly[0]?.total || 0),
        monthly: parseFloat(monthly[0]?.total || 0),
        yearly: parseFloat(yearly[0]?.total || 0)
      });
    } catch (error) {
      console.error('Erro ao gerar vendas por período:', error);
      res.status(500).json({ error: 'Erro ao gerar vendas por período' });
    }
  });

  // Estoque - Posição Atual
  app.get('/api/reports/stock-position', async (req, res) => {
    try {
      const sql = `
        SELECT id, code, name, sku, stock, min_stock, category, price, cost
        FROM produtos
        WHERE active = true
        ORDER BY name ASC
      `;
      
      const results = await db.query(sql);
      res.json(results);
    } catch (error) {
      console.error('Erro ao gerar posição de estoque:', error);
      res.status(500).json({ error: 'Erro ao gerar posição de estoque' });
    }
  });

  // Estoque - Alertas de Mínimo/Máximo
  app.get('/api/reports/stock-alerts', async (req, res) => {
    try {
      const sql = `
        SELECT id, code, name, sku, stock, min_stock, category
        FROM produtos
        WHERE active = true AND stock <= min_stock AND min_stock > 0
        ORDER BY stock ASC
      `;
      
      const results = await db.query(sql);
      res.json(results);
    } catch (error) {
      console.error('Erro ao gerar alertas de estoque:', error);
      res.status(500).json({ error: 'Erro ao gerar alertas de estoque' });
    }
  });

  // Produtos com Baixo Giro
  app.get('/api/reports/low-turnover', async (req, res) => {
    try {
      const { days = 30 } = req.query;
      
      let sql;
      if (db.getDatabaseType() === 'sqlite') {
        sql = `
          SELECT 
            p.id, p.code, p.name, p.sku, p.stock, p.category,
            COALESCE(MAX(DATE(v.sale_date)), 'Nunca') as last_sale
          FROM produtos p
          LEFT JOIN vendas_itens vi ON p.id = vi.product_id
          LEFT JOIN vendas v ON vi.sale_id = v.id
          WHERE p.active = true
          GROUP BY p.id
          HAVING last_sale = 'Nunca' OR julianday('now') - julianday(MAX(v.sale_date)) > ?
          ORDER BY last_sale ASC
        `;
      } else {
        sql = `
          SELECT 
            p.id, p.code, p.name, p.sku, p.stock, p.category,
            COALESCE(MAX(DATE(v.sale_date)), 'Nunca') as last_sale
          FROM produtos p
          LEFT JOIN vendas_itens vi ON p.id = vi.product_id
          LEFT JOIN vendas v ON vi.sale_id = v.id
          WHERE p.active = true
          GROUP BY p.id
          HAVING last_sale = 'Nunca' OR DATEDIFF(NOW(), MAX(v.sale_date)) > ?
          ORDER BY last_sale ASC
        `;
      }
      
      const results = await db.query(sql, [parseInt(days)]);
      res.json(results);
    } catch (error) {
      console.error('Erro ao gerar produtos com baixo giro:', error);
      res.status(500).json({ error: 'Erro ao gerar produtos com baixo giro' });
    }
  });

  // Vendas por Forma de Pagamento (do PDV)
  app.get('/api/reports/sales-by-payment', async (req, res) => {
    try {
      const { from, to } = req.query;
      
      let sql;
      if (db.getDatabaseType() === 'sqlite') {
        sql = `
          SELECT 
            payment_method,
            COUNT(*) as count,
            SUM(total) as total,
            ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM vendas WHERE DATE(sale_date) BETWEEN ? AND ?), 2) as percentage
          FROM vendas
          WHERE DATE(sale_date) BETWEEN ? AND ?
          GROUP BY payment_method
          ORDER BY total DESC
        `;
      } else {
        sql = `
          SELECT 
            payment_method,
            COUNT(*) as count,
            SUM(total) as total,
            ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM vendas WHERE DATE(sale_date) BETWEEN ? AND ?), 2) as percentage
          FROM vendas
          WHERE DATE(sale_date) BETWEEN ? AND ?
          GROUP BY payment_method
          ORDER BY total DESC
        `;
      }
      
      const params = [from, to, from, to]; // 4 parâmetros: 2 para subquery + 2 para query principal
      const results = await db.query(sql, params);
      res.json(results);
    } catch (error) {
      console.error('Erro ao gerar vendas por forma de pagamento:', error);
      res.status(500).json({ error: 'Erro ao gerar vendas por forma de pagamento' });
    }
  });

  // Ticket Médio
  app.get('/api/reports/average-ticket', async (req, res) => {
    try {
      const { from, to } = req.query;
      console.log('DEBUG /api/reports/average-ticket params:', { from, to });
      const params = [from, to];
      
      let sql;
      if (db.getDatabaseType() === 'sqlite') {
        sql = `
          SELECT 
            AVG(total) as average_ticket,
            COUNT(*) as total_sales,
            SUM(total) as total_revenue
          FROM vendas
          WHERE DATE(sale_date) BETWEEN ? AND ?
        `;
      } else {
        sql = `
          SELECT 
            AVG(total) as average_ticket,
            COUNT(*) as total_sales,
            SUM(total) as total_revenue
          FROM vendas
          WHERE DATE(sale_date) BETWEEN ? AND ?
        `;
      }
      
      const results = await db.query(sql, params);
      const data = results[0] || {};
      
      res.json({
        averageTicket: parseFloat(data.average_ticket || 0),
        totalSales: parseInt(data.total_sales || 0),
        totalRevenue: parseFloat(data.total_revenue || 0)
      });
    } catch (error) {
      console.error('Erro ao calcular ticket médio:', error);
      res.status(500).json({ error: 'Erro ao calcular ticket médio' });
    }
  });

  app.get('/api/reports/sales-summary', async (req, res) => {
    try {
      // Agrupa as vendas por dia dos últimos 30 dias
      let sql;
      if (db.getDatabaseType() === 'sqlite') {
        sql = `
          SELECT 
            strftime('%Y-%m-%d', payment_date) as date,
            SUM(value) as total
          FROM transacoes
          WHERE status = 'pago' AND category != 'Pagamento' AND payment_date >= date('now', '-30 days')
          GROUP BY date
          ORDER BY date ASC;
        `;
      } else { // Assumindo MySQL
        sql = `
          SELECT 
            DATE_FORMAT(payment_date, '%Y-%m-%d') as date,
            SUM(value) as total
          FROM transacoes
          WHERE status = 'pago' AND category != 'Pagamento' AND payment_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          GROUP BY date
          ORDER BY date ASC;
        `;
      }
      
      const results = await db.query(sql);
      res.json(results);
    } catch (error) {
      console.error('Erro ao gerar resumo de vendas:', error);
      res.status(500).json({ error: 'Erro ao gerar resumo de vendas' });
    }
  });

  // ============================================
  // API DE DEPARTAMENTOS/GRUPOS
  // ============================================

  app.get('/api/departamentos', async (req, res) => {
    try {
      const { search = '', level = '', parent = '' } = req.query;
      
      let sql = 'SELECT * FROM departamentos WHERE active = TRUE';
      const params = [];

      if (search) {
        sql += ' AND (name LIKE ? OR code LIKE ? OR description LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      if (level) {
        sql += ' AND level = ?';
        params.push(level);
      }

      if (parent) {
        sql += ' AND parent_id = ?';
        params.push(parent);
      }

      sql += ' ORDER BY level, name ASC';

      const results = await getDatabase(req).query(sql, params);
      
      const formattedItems = results.map(item => ({
        id: item.id,
        code: item.code,
        name: item.name,
        parentId: item.parent_id,
        level: item.level,
        description: item.description,
        marginPercent: parseFloat(item.margin_percent || 0),
        commissionPercent: parseFloat(item.commission_percent || 0),
        active: Boolean(item.active)
      }));

      res.json({ data: formattedItems, total: formattedItems.length });
    } catch (error) {
      console.error('Erro ao buscar departamentos:', error);
      res.status(500).json({ error: 'Erro ao buscar departamentos' });
    }
  });

  app.get('/api/departamentos/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const [dept] = await getDatabase(req).query('SELECT * FROM departamentos WHERE id = ?', [id]);
      
      if (!dept) {
        return res.status(404).json({ error: 'Departamento não encontrado' });
      }
      
      res.json({
        id: dept.id,
        code: dept.code,
        name: dept.name,
        parentId: dept.parent_id,
        level: dept.level,
        description: dept.description,
        marginPercent: parseFloat(dept.margin_percent || 0),
        commissionPercent: parseFloat(dept.commission_percent || 0),
        active: Boolean(dept.active)
      });
    } catch (error) {
      console.error('Erro ao buscar departamento:', error);
      res.status(500).json({ error: 'Erro ao buscar departamento' });
    }
  });

  app.post('/api/departamentos', async (req, res) => {
    try {
      const d = req.body;
      const id = uuidv4();
      
      const sql = `INSERT INTO departamentos 
        (id, code, name, parent_id, level, description, margin_percent, commission_percent, active) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const params = [
        id,
        d.code || null,
        d.name || '',
        d.parentId || null,
        d.level || 'departamento',
        d.description || null,
        d.marginPercent || 0,
        d.commissionPercent || 0,
        d.active !== undefined ? d.active : true
      ];

      await getDatabase(req).query(sql, params);
      
      res.status(201).json({
        id,
        code: d.code,
        name: d.name,
        parentId: d.parentId,
        level: d.level || 'departamento',
        description: d.description,
        marginPercent: d.marginPercent || 0,
        commissionPercent: d.commissionPercent || 0,
        active: d.active !== undefined ? d.active : true
      });
    } catch (error) {
      console.error('Erro ao criar departamento:', error);
      res.status(500).json({ error: 'Erro ao criar departamento' });
    }
  });

  app.put('/api/departamentos/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const d = req.body;

      const sql = `UPDATE departamentos SET 
        code = COALESCE(?, code),
        name = COALESCE(?, name),
        parent_id = ?,
        level = COALESCE(?, level),
        description = ?,
        margin_percent = COALESCE(?, margin_percent),
        commission_percent = COALESCE(?, commission_percent),
        active = COALESCE(?, active)
        WHERE id = ?`;

      const params = [
        d.code,
        d.name,
        d.parentId || null,
        d.level,
        d.description || null,
        d.marginPercent,
        d.commissionPercent,
        d.active,
        id
      ];

      const result = await getDatabase(req).query(sql, params);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Departamento não encontrado' });
      }

      const [updated] = await getDatabase(req).query('SELECT * FROM departamentos WHERE id = ?', [id]);
      
      res.json({
        id: updated.id,
        code: updated.code,
        name: updated.name,
        parentId: updated.parent_id,
        level: updated.level,
        description: updated.description,
        marginPercent: parseFloat(updated.margin_percent || 0),
        commissionPercent: parseFloat(updated.commission_percent || 0),
        active: Boolean(updated.active)
      });
    } catch (error) {
      console.error('Erro ao atualizar departamento:', error);
      res.status(500).json({ error: 'Erro ao atualizar departamento' });
    }
  });

  app.delete('/api/departamentos/:id', async (req, res) => {
    try {
      const id = req.params.id;
      // Soft delete
      const result = await getDatabase(req).query('UPDATE departamentos SET active = FALSE WHERE id = ?', [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Departamento não encontrado' });
      }

      res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao deletar departamento:', error);
      res.status(500).json({ error: 'Erro ao deletar departamento' });
    }
  });

  // ============================================
  // API DE EMPRESAS
  // ============================================

  app.get('/api/empresas', async (req, res) => {
    try {
      const { search = '' } = req.query;
      
      let sql = 'SELECT * FROM empresas WHERE 1=1';
      const params = [];

      if (search) {
        sql += ' AND (nome_fantasia LIKE ? OR razao_social LIKE ? OR cnpj LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      sql += ' ORDER BY nome_fantasia ASC';

      const results = await getDatabase(req).query(sql, params);
      
      const formattedItems = results.map(item => ({
        id: item.id,
        razao_social: item.razao_social,
        nome_fantasia: item.nome_fantasia,
        cnpj: item.cnpj,
        inscricao_estadual: item.inscricao_estadual,
        inscricao_municipal: item.inscricao_municipal,
        endereco: item.endereco,
        numero: item.numero,
        bairro: item.bairro,
        cidade: item.cidade,
        uf: item.uf,
        cep: item.cep,
        telefone: item.telefone,
        email: item.email,
        logo: item.logo,
        status: item.status
      }));

      res.json({ data: formattedItems, total: formattedItems.length });
    } catch (error) {
      console.error('Erro ao buscar empresas:', error);
      res.status(500).json({ error: 'Erro ao buscar empresas' });
    }
  });

  // GET /api/empresas/:id - retorna uma empresa pelo id
  app.get('/api/empresas/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const results = await getDatabase(req).query('SELECT * FROM empresas WHERE id = ?', [id]);
      const empresa = results[0];
      if (!empresa) {
        return res.status(404).json({ error: 'Empresa não encontrada' });
      }

      res.json({
        id: empresa.id,
        razao_social: empresa.razao_social,
        nome_fantasia: empresa.nome_fantasia,
        cnpj: empresa.cnpj,
        inscricao_estadual: empresa.inscricao_estadual,
        inscricao_municipal: empresa.inscricao_municipal,
        endereco: empresa.endereco,
        numero: empresa.numero,
        bairro: empresa.bairro,
        cidade: empresa.cidade,
        uf: empresa.uf,
        cep: empresa.cep,
        telefone: empresa.telefone,
        email: empresa.email,
        logo: empresa.logo,
        status: empresa.status
      });

    } catch (error) {
      console.error('Erro ao buscar empresa:', error);
      res.status(500).json({ error: 'Erro ao buscar empresa' });
    }
  });

  app.post('/api/empresas', async (req, res) => {
    try {
      const e = req.body;
      const id = uuidv4();
      
      const sql = `INSERT INTO empresas 
        (id, razao_social, nome_fantasia, cnpj, inscricao_estadual, inscricao_municipal, endereco, numero, bairro, cidade, uf, cep, telefone, email, logo, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const params = [
        id,
        e.razao_social || null,
        e.nome_fantasia || null,
        e.cnpj || null,
        e.inscricao_estadual || null,
        e.inscricao_municipal || null,
        e.endereco || null,
        e.numero || null,
        e.bairro || null,
        e.cidade || null,
        e.uf || null,
        e.cep || null,
        e.telefone || null,
        e.email || null,
        e.logo || null,
        e.status !== undefined ? (e.status ? 1 : 0) : 1
      ];

      await getDatabase(req).query(sql, params);
      
      res.status(201).json({ id, ...e });
    } catch (error) {
      console.error('Erro ao criar empresa:', error);
      res.status(500).json({ error: 'Erro ao criar empresa' });
    }
  });

  app.put('/api/empresas/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const e = req.body;

      const sql = `UPDATE empresas SET 
        razao_social = ?,
        nome_fantasia = ?,
        cnpj = ?,
        inscricao_estadual = ?,
        inscricao_municipal = ?,
        endereco = ?,
        numero = ?,
        bairro = ?,
        cidade = ?,
        uf = ?,
        cep = ?,
        telefone = ?,
        email = ?,
        logo = ?,
        status = ?
        WHERE id = ?`;

      const params = [
        e.razao_social || null,
        e.nome_fantasia || null,
        e.cnpj || null,
        e.inscricao_estadual || null,
        e.inscricao_municipal || null,
        e.endereco || null,
        e.numero || null,
        e.bairro || null,
        e.cidade || null,
        e.uf || null,
        e.cep || null,
        e.telefone || null,
        e.email || null,
        e.logo || null,
        e.status !== undefined ? (e.status ? 1 : 0) : 1,
        id
      ];

      const result = await getDatabase(req).query(sql, params);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Empresa não encontrada' });
      }

      const [updated] = await getDatabase(req).query('SELECT * FROM empresas WHERE id = ?', [id]);
      
      res.json({
        id: updated.id,
        razao_social: updated.razao_social,
        nome_fantasia: updated.nome_fantasia,
        cnpj: updated.cnpj,
        inscricao_estadual: updated.inscricao_estadual,
        inscricao_municipal: updated.inscricao_municipal,
        endereco: updated.endereco,
        numero: updated.numero,
        bairro: updated.bairro,
        cidade: updated.cidade,
        uf: updated.uf,
        cep: updated.cep,
        telefone: updated.telefone,
        email: updated.email,
        logo: updated.logo || null,
        status: updated.status
      });

  // Endpoint de upload de logo (multipart/form-data)
  const multer = require('multer');
  const upload = multer({ dest: 'frontend/uploads/' });

  app.post('/api/empresas/:id/logo', upload.single('logo'), async (req, res) => {
    try {
      const id = req.params.id;
      if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
      const url = '/uploads/' + req.file.filename;
      await getDatabase(req).query('UPDATE empresas SET logo = ? WHERE id = ?', [url, id]);
      res.json({ logo: url });
    } catch (err) {
      console.error('Erro ao enviar logo:', err);
      res.status(500).json({ error: 'Erro ao enviar logo' });
    }
  });
    } catch (error) {
      console.error('Erro ao atualizar empresa:', error);
      res.status(500).json({ error: 'Erro ao atualizar empresa' });
    }
  });

  app.delete('/api/empresas/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const result = await getDatabase(req).query('DELETE FROM empresas WHERE id = ?', [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Empresa não encontrada' });
      }

      res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao deletar empresa:', error);
      res.status(500).json({ error: 'Erro ao deletar empresa' });
    }
  });

  // ============================================
  // API DE USUÁRIOS / PERFIS
  // ============================================

  app.get('/api/users', async (req, res) => {
    try {
      const { search = '' } = req.query;
      let sql = 'SELECT * FROM users WHERE 1=1';
      const params = [];

      if (search) {
        sql += ' AND (name LIKE ? OR email LIKE ? OR role LIKE ?)';
        const s = `%${search}%`;
        params.push(s, s, s);
      }

      sql += ' ORDER BY name ASC';

      const results = await db.query(sql, params);
      const formatted = results.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: Boolean(u.active),
        permissions: u.permissions ? JSON.parse(u.permissions) : {}
      }));

      res.json({ data: formatted, total: formatted.length });
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
  });

  app.get('/api/users/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const results = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      const u = results[0];
      if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });

      res.json({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: Boolean(u.active),
        permissions: u.permissions ? JSON.parse(u.permissions) : {}
      });
    } catch (error) {
      console.error('Erro ao buscar usuário:', error);
      res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
  });

  app.post('/api/users', async (req, res) => {
    try {
      const u = req.body;
      const id = uuidv4();
      const permissions = u.permissions ? JSON.stringify(u.permissions) : JSON.stringify({});

      const sql = `INSERT INTO users (id, name, email, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)`;
      const params = [id, u.name || '', u.email || '', u.role || null, u.active ? 1 : 0, permissions];
      await db.query(sql, params);

      res.status(201).json({ id, ...u, permissions: JSON.parse(permissions) });
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      res.status(500).json({ error: 'Erro ao criar usuário' });
    }
  });

  app.put('/api/users/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const u = req.body;
      const permissions = u.permissions ? JSON.stringify(u.permissions) : JSON.stringify({});

      const sql = `UPDATE users SET name = ?, email = ?, role = ?, active = ?, permissions = ? WHERE id = ?`;
      const params = [u.name, u.email, u.role, u.active ? 1 : 0, permissions, id];
      const result = await db.query(sql, params);

      if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

      const [updated] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      res.json({ id: updated.id, name: updated.name, email: updated.email, role: updated.role, active: Boolean(updated.active), permissions: updated.permissions ? JSON.parse(updated.permissions) : {} });
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
  });

  app.delete('/api/users/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const result = await db.query('DELETE FROM users WHERE id = ?', [id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
      res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao deletar usuário:', error);
      res.status(500).json({ error: 'Erro ao deletar usuário' });
    }
  });

  // ============================================
  // API DE INTEGRAÇÕES
  // ============================================

  app.get('/api/integracoes', async (req, res) => {
    try {
      const database = getDatabase(req);
      const { search = '' } = req.query;
      let sql = 'SELECT * FROM integracoes WHERE 1=1';
      const params = [];

      if (search) {
        sql += ' AND (name LIKE ? OR type LIKE ?)';
        const s = `%${search}%`;
        params.push(s, s);
      }

      sql += ' ORDER BY name ASC';

      const results = await database.query(sql, params);
      const formatted = results.map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        config: i.config ? (typeof i.config === 'string' ? i.config : JSON.stringify(i.config)) : '',
        active: Boolean(i.active)
      }));

      res.json({ data: formatted, total: formatted.length });
    } catch (error) {
      console.error('Erro ao buscar integrações:', error);
      res.status(500).json({ error: 'Erro ao buscar integrações' });
    }
  });

  app.get('/api/integracoes/:id', async (req, res) => {
    try {
      const database = getDatabase(req);
      const id = req.params.id;
      const results = await database.query('SELECT * FROM integracoes WHERE id = ?', [id]);
      const it = results[0];
      if (!it) return res.status(404).json({ error: 'Integração não encontrada' });

      res.json({ id: it.id, name: it.name, type: it.type, config: it.config, active: Boolean(it.active) });
    } catch (error) {
      console.error('Erro ao buscar integração:', error);
      res.status(500).json({ error: 'Erro ao buscar integração' });
    }
  });

  app.post('/api/integracoes', async (req, res) => {
    try {
      const database = getDatabase(req);
      const i = req.body;
      const id = uuidv4();
      const sql = `INSERT INTO integracoes (id, name, type, config, active) VALUES (?, ?, ?, ?, ?)`;
      const params = [id, i.name || '', i.type || '', i.config || null, i.active ? 1 : 0];
      await database.query(sql, params);
      res.status(201).json({ id, ...i });
    } catch (error) {
      console.error('Erro ao criar integração:', error);
      res.status(500).json({ error: 'Erro ao criar integração' });
    }
  });

  app.put('/api/integracoes/:id', async (req, res) => {
    try {
      const database = getDatabase(req);
      const id = req.params.id;
      const i = req.body;
      const sql = `UPDATE integracoes SET name = ?, type = ?, config = ?, active = ? WHERE id = ?`;
      const params = [i.name, i.type, i.config, i.active ? 1 : 0, id];
      const result = await database.query(sql, params);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Integração não encontrada' });
      const [updated] = await database.query('SELECT * FROM integracoes WHERE id = ?', [id]);
      res.json({ id: updated.id, name: updated.name, type: updated.type, config: updated.config, active: Boolean(updated.active) });
    } catch (error) {
      console.error('Erro ao atualizar integração:', error);
      res.status(500).json({ error: 'Erro ao atualizar integração' });
    }
  });

  app.delete('/api/integracoes/:id', async (req, res) => {
    try {
      const database = getDatabase(req);
      const id = req.params.id;
      const result = await database.query('DELETE FROM integracoes WHERE id = ?', [id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Integração não encontrada' });
      res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao deletar integração:', error);
      res.status(500).json({ error: 'Erro ao deletar integração' });
    }
  });

  // ============================================
  // MERCADO PAGO PIX - INTEGRAÇÃO
  // ============================================

  // Buscar configuração do Mercado Pago ativa (com isolamento de tenant)
  async function getMercadoPagoConfig(req) {
    try {
      const database = getDatabase(req);
      const results = await database.query("SELECT * FROM integracoes WHERE (type = 'PIX' OR type LIKE '%Mercado%' OR type LIKE '%pix%') AND active = 1 LIMIT 1");
      if (results && results.length > 0) {
        const cfg = results[0].config;
        if (cfg) {
          return typeof cfg === 'string' ? JSON.parse(cfg) : cfg;
        }
      }
      return null;
    } catch (e) {
      console.error('Erro ao buscar config Mercado Pago:', e);
      return null;
    }
  }

  // Gerar cobrança PIX via Mercado Pago
  app.post('/api/pix/gerar', async (req, res) => {
    try {
      const { amount, description, externalReference } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Valor inválido' });
      }

      const mpConfig = await getMercadoPagoConfig(req);
      if (!mpConfig || !mpConfig.accessToken) {
        return res.status(400).json({ error: 'Integração Mercado Pago não configurada. Acesse Integrações e configure as credenciais.' });
      }

      const accessToken = mpConfig.accessToken;

      // Criar pagamento PIX via API do Mercado Pago
      const paymentData = {
        transaction_amount: parseFloat(amount),
        description: description || 'Pagamento via PDV',
        payment_method_id: 'pix',
        payer: {
          email: 'cliente@email.com',
          first_name: 'Cliente',
          last_name: 'PDV'
        },
        external_reference: externalReference || `PDV-${Date.now()}`
      };

      const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'X-Idempotency-Key': `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        },
        body: JSON.stringify(paymentData)
      });

      const mpResult = await mpResponse.json();

      if (!mpResponse.ok) {
        console.error('Erro Mercado Pago:', mpResult);
        return res.status(400).json({ 
          error: mpResult.message || 'Erro ao gerar PIX no Mercado Pago',
          details: mpResult
        });
      }

      // Extrair dados do QR Code PIX
      const pixInfo = mpResult.point_of_interaction?.transaction_data;
      
      res.json({
        success: true,
        paymentId: mpResult.id,
        status: mpResult.status,
        qrCode: pixInfo?.qr_code || null,
        qrCodeBase64: pixInfo?.qr_code_base64 || null,
        ticketUrl: pixInfo?.ticket_url || null,
        expirationDate: mpResult.date_of_expiration,
        amount: mpResult.transaction_amount
      });

    } catch (error) {
      console.error('Erro ao gerar PIX:', error);
      res.status(500).json({ error: 'Erro interno ao gerar PIX' });
    }
  });

  // Verificar status do pagamento PIX
  app.get('/api/pix/status/:paymentId', async (req, res) => {
    try {
      const { paymentId } = req.params;
      
      const mpConfig = await getMercadoPagoConfig(req);
      if (!mpConfig || !mpConfig.accessToken) {
        return res.status(400).json({ error: 'Integração Mercado Pago não configurada' });
      }

      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mpConfig.accessToken}`
        }
      });

      const mpResult = await mpResponse.json();

      if (!mpResponse.ok) {
        return res.status(400).json({ error: 'Erro ao verificar pagamento' });
      }

      res.json({
        paymentId: mpResult.id,
        status: mpResult.status, // approved, pending, rejected, cancelled
        statusDetail: mpResult.status_detail,
        amount: mpResult.transaction_amount,
        paidAt: mpResult.date_approved
      });

    } catch (error) {
      console.error('Erro ao verificar PIX:', error);
      res.status(500).json({ error: 'Erro ao verificar status do PIX' });
    }
  });

  // Verificar se integração PIX está configurada
  app.get('/api/pix/configurado', async (req, res) => {
    try {
      const mpConfig = await getMercadoPagoConfig(req);
      res.json({ 
        configurado: !!(mpConfig && mpConfig.accessToken),
        hasPublicKey: !!(mpConfig && mpConfig.publicKey)
      });
    } catch (error) {
      res.json({ configurado: false });
    }
  });

  // ============================================
  // API DE REGRAS DE ESTOQUE
  // ============================================

  app.get('/api/estoque', async (req, res) => {
    try {
      const { search = '' } = req.query;
      let sql = 'SELECT * FROM estoque WHERE 1=1';
      const params = [];

      if (search) {
        sql += ' AND name LIKE ?';
        params.push(`%${search}%`);
      }

      sql += ' ORDER BY name ASC';

      const results = await getDatabase(req).query(sql, params);
      const formatted = results.map(e => ({
        id: e.id,
        name: e.name,
        min: e.min,
        max: e.max,
        reorder: e.reorder,
        turnover: e.turnover,
        inventory: e.inventory,
        alertEnabled: Boolean(e.alert_enabled),
        desc: e.description
      }));

      res.json({ data: formatted, total: formatted.length });
    } catch (error) {
      console.error('Erro ao buscar regras de estoque:', error);
      res.status(500).json({ error: 'Erro ao buscar regras de estoque' });
    }
  });

  app.get('/api/estoque/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const results = await getDatabase(req).query('SELECT * FROM estoque WHERE id = ?', [id]);
      const e = results[0];
      if (!e) return res.status(404).json({ error: 'Regra não encontrada' });
      res.json({ id: e.id, name: e.name, min: e.min, max: e.max, reorder: e.reorder, turnover: e.turnover, inventory: e.inventory, alertEnabled: Boolean(e.alert_enabled), desc: e.description });
    } catch (error) {
      console.error('Erro ao buscar regra:', error);
      res.status(500).json({ error: 'Erro ao buscar regra' });
    }
  });

  app.post('/api/estoque', async (req, res) => {
    try {
      const d = req.body;
      const id = uuidv4();
      const sql = `INSERT INTO estoque (id, name, min, max, reorder, turnover, inventory, alert_enabled, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [id, d.name || '', d.min || 0, d.max || 0, d.reorder || 0, d.turnover || 0, d.inventory || null, d.alertEnabled ? 1 : 0, d.desc || null];
      await getDatabase(req).query(sql, params);
      res.status(201).json({ id, ...d });
    } catch (error) {
      console.error('Erro ao criar regra:', error);
      res.status(500).json({ error: 'Erro ao criar regra' });
    }
  });

  app.put('/api/estoque/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const d = req.body;
      const sql = `UPDATE estoque SET name = ?, min = ?, max = ?, reorder = ?, turnover = ?, inventory = ?, alert_enabled = ?, description = ? WHERE id = ?`;
      const params = [d.name, d.min, d.max, d.reorder, d.turnover, d.inventory, d.alertEnabled ? 1 : 0, d.desc || null, id];
      const result = await getDatabase(req).query(sql, params);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Regra não encontrada' });
      const [updated] = await getDatabase(req).query('SELECT * FROM estoque WHERE id = ?', [id]);
      res.json({ id: updated.id, name: updated.name, min: updated.min, max: updated.max, reorder: updated.reorder, turnover: updated.turnover, inventory: updated.inventory, alertEnabled: Boolean(updated.alert_enabled), desc: updated.description });
    } catch (error) {
      console.error('Erro ao atualizar regra:', error);
      res.status(500).json({ error: 'Erro ao atualizar regra' });
    }
  });

  app.delete('/api/estoque/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const result = await getDatabase(req).query('DELETE FROM estoque WHERE id = ?', [id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Regra não encontrada' });
      res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao deletar regra:', error);
      res.status(500).json({ error: 'Erro ao deletar regra' });
    }
  });

  // ============================================
  // API FINANCEIRO (planos, categorias, contas bancárias, centros)
  // ============================================

  app.get('/api/financeiro', async (req, res) => {
    try {
      const { search = '', resource = '' } = req.query;
      let sql = 'SELECT * FROM financeiro WHERE 1=1';
      const params = [];
      if (search) { sql += ' AND name LIKE ?'; params.push(`%${search}%`); }
      if (resource) { sql += ' AND resource = ?'; params.push(resource); }
      sql += ' ORDER BY name ASC';
      const results = await getDatabase(req).query(sql, params);
      const formatted = results.map(f => ({ id: f.id, name: f.name, type: f.type, resource: f.resource, desc: f.description }));
      res.json({ data: formatted, total: formatted.length });
    } catch (error) {
      console.error('Erro ao buscar financeiro:', error);
      res.status(500).json({ error: 'Erro ao buscar financeiro' });
    }
  });

  app.get('/api/financeiro/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const results = await getDatabase(req).query('SELECT * FROM financeiro WHERE id = ?', [id]);
      const f = results[0];
      if (!f) return res.status(404).json({ error: 'Item não encontrado' });
      res.json({ id: f.id, name: f.name, type: f.type, resource: f.resource, desc: f.description });
    } catch (error) {
      console.error('Erro ao buscar financeiro:', error);
      res.status(500).json({ error: 'Erro ao buscar financeiro' });
    }
  });

  app.post('/api/financeiro', async (req, res) => {
    try {
      const d = req.body;
      const id = uuidv4();
      const sql = `INSERT INTO financeiro (id, name, type, resource, description) VALUES (?, ?, ?, ?, ?)`;
      const params = [id, d.name || '', d.type || null, d.resource || null, d.desc || null];
      await getDatabase(req).query(sql, params);
      res.status(201).json({ id, ...d });
    } catch (error) {
      console.error('Erro ao criar financeiro:', error);
      res.status(500).json({ error: 'Erro ao criar financeiro' });
    }
  });

  app.put('/api/financeiro/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const d = req.body;
      const sql = `UPDATE financeiro SET name = ?, type = ?, resource = ?, description = ? WHERE id = ?`;
      const params = [d.name, d.type, d.resource, d.desc || null, id];
      const result = await getDatabase(req).query(sql, params);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Item não encontrado' });
      const [updated] = await getDatabase(req).query('SELECT * FROM financeiro WHERE id = ?', [id]);
      res.json({ id: updated.id, name: updated.name, type: updated.type, resource: updated.resource, desc: updated.description });
    } catch (error) {
      console.error('Erro ao atualizar financeiro:', error);
      res.status(500).json({ error: 'Erro ao atualizar financeiro' });
    }
  });

  app.delete('/api/financeiro/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const result = await getDatabase(req).query('DELETE FROM financeiro WHERE id = ?', [id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Item não encontrado' });
      res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao deletar financeiro:', error);
      res.status(500).json({ error: 'Erro ao deletar financeiro' });
    }
  });

  // ============================================
  // API COMISSÕES E METAS
  // ============================================

  app.get('/api/comissoes', async (req, res) => {
    try {
      const { search = '', vendor = '', period = '' } = req.query;
      let sql = 'SELECT * FROM comissoes WHERE 1=1';
      const params = [];
      if (search) { sql += ' AND (vendor_name LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
      if (vendor) { sql += ' AND vendor_name = ?'; params.push(vendor); }
      if (period) { sql += ' AND period = ?'; params.push(period); }
      sql += ' ORDER BY rank ASC, vendor_name ASC';
      const results = await db.query(sql, params);
      const formatted = results.map(c => ({ id: c.id, vendorName: c.vendor_name, percent: c.percent, bonus: c.bonus, target: c.target, period: c.period, paid: Boolean(c.paid), rank: c.rank, description: c.description }));
      res.json({ data: formatted, total: formatted.length });
    } catch (error) {
      console.error('Erro ao buscar comissões:', error);
      res.status(500).json({ error: 'Erro ao buscar comissões' });
    }
  });

  app.get('/api/comissoes/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const results = await db.query('SELECT * FROM comissoes WHERE id = ?', [id]);
      const c = results[0];
      if (!c) return res.status(404).json({ error: 'Comissão não encontrada' });
      res.json({ id: c.id, vendorName: c.vendor_name, percent: c.percent, bonus: c.bonus, target: c.target, period: c.period, paid: Boolean(c.paid), rank: c.rank, description: c.description });
    } catch (error) {
      console.error('Erro ao buscar comissão:', error);
      res.status(500).json({ error: 'Erro ao buscar comissão' });
    }
  });

  app.post('/api/comissoes', async (req, res) => {
    try {
      const d = req.body;
      const id = uuidv4();
      const sql = `INSERT INTO comissoes (id, vendor_name, percent, bonus, target, period, paid, rank, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [id, d.vendorName || null, d.percent || 0, d.bonus || 0, d.target || 0, d.period || null, d.paid ? 1 : 0, d.rank || 0, d.description || null];
      await db.query(sql, params);
      res.status(201).json({ id, ...d });
    } catch (error) {
      console.error('Erro ao criar comissão:', error);
      res.status(500).json({ error: 'Erro ao criar comissão' });
    }
  });

  app.put('/api/comissoes/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const d = req.body;
      const sql = `UPDATE comissoes SET vendor_name = ?, percent = ?, bonus = ?, target = ?, period = ?, paid = ?, rank = ?, description = ? WHERE id = ?`;
      const params = [d.vendorName, d.percent, d.bonus, d.target, d.period, d.paid ? 1 : 0, d.rank || 0, d.description || null, id];
      const result = await db.query(sql, params);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Comissão não encontrada' });
      const [updated] = await db.query('SELECT * FROM comissoes WHERE id = ?', [id]);
      res.json({ id: updated.id, vendorName: updated.vendor_name, percent: updated.percent, bonus: updated.bonus, target: updated.target, period: updated.period, paid: Boolean(updated.paid), rank: updated.rank, description: updated.description });
    } catch (error) {
      console.error('Erro ao atualizar comissão:', error);
      res.status(500).json({ error: 'Erro ao atualizar comissão' });
    }
  });

  app.delete('/api/comissoes/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const result = await db.query('DELETE FROM comissoes WHERE id = ?', [id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Comissão não encontrada' });
      res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao deletar comissão:', error);
      res.status(500).json({ error: 'Erro ao deletar comissão' });
    }
  });

  // ============================================
  // API DE FORNECEDORES (filtro de pessoas)
  // ============================================
  app.get('/api/fornecedores', async (req, res) => {
    try {
      const { page = 1, pageSize = 1000, search = '' } = req.query;
      
      let sql = "SELECT * FROM pessoas WHERE type = 'Fornecedor'";
      const params = [];

      if (search) {
        sql += ' AND (name LIKE ? OR fantasy_name LIKE ? OR email LIKE ? OR phone LIKE ? OR document LIKE ? OR code LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }

      sql += ' ORDER BY name ASC';

      const allResults = await db.query(sql, params);
      const total = allResults.length;

      const p = parseInt(page, 10);
      const ps = parseInt(pageSize, 10);
      const start = (p - 1) * ps;
      const pageItems = allResults.slice(start, start + ps);

      const formattedItems = pageItems.map(item => ({
        id: item.id,
        code: item.code,
        name: item.name,
        fantasyName: item.fantasy_name,
        legalType: item.legal_type,
        type: item.type,
        document: item.document,
        rgIe: item.rg_ie,
        email: item.email,
        phone: item.phone,
        phone2: item.phone2,
        cep: item.cep,
        street: item.street,
        number: item.number,
        complement: item.complement,
        neighborhood: item.neighborhood,
        city: item.city,
        state: item.state,
        contactName: item.contact_name,
        contactPhone: item.contact_phone,
        paymentTerms: item.payment_terms,
        creditLimit: parseFloat(item.credit_limit || 0),
        supplierCategory: item.supplier_category,
        notes: item.notes,
        active: item.active !== undefined ? Boolean(item.active) : true
      }));

      res.json({ data: formattedItems, total });
    } catch (error) {
      console.error('Erro ao buscar fornecedores:', error);
      res.status(500).json({ error: 'Erro ao buscar fornecedores' });
    }
  });

  app.post('/api/fornecedores', async (req, res) => {
    try {
      const p = req.body;
      const id = uuidv4();
      
      const sql = `INSERT INTO pessoas 
        (id, code, name, fantasy_name, legal_type, type, document, rg_ie, email, phone, phone2,
         cep, street, number, complement, neighborhood, city, state, 
         contact_name, contact_phone, payment_terms, credit_limit, supplier_category, notes, active) 
        VALUES (?, ?, ?, ?, ?, 'Fornecedor', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const params = [
        id,
        p.code || null,
        p.name || '',
        p.fantasyName || null,
        p.legalType || 'PJ',
        p.document || null,
        p.rgIe || null,
        p.email || null,
        p.phone || null,
        p.phone2 || null,
        p.cep || null,
        p.street || null,
        p.number || null,
        p.complement || null,
        p.neighborhood || null,
        p.city || null,
        p.state || null,
        p.contactName || null,
        p.contactPhone || null,
        p.paymentTerms || null,
        p.creditLimit || 0,
        p.supplierCategory || null,
        p.notes || null,
        p.active !== undefined ? p.active : true
      ];

      await db.query(sql, params);
      
      res.status(201).json({ id, ...p, type: 'Fornecedor' });
    } catch (error) {
      console.error('Erro ao criar fornecedor:', error);
      res.status(500).json({ error: 'Erro ao criar fornecedor' });
    }
  });

  // ============================================
  // API DE FUNCIONÁRIOS (filtro de pessoas)
  // ============================================

  app.get('/api/funcionarios', async (req, res) => {
    try {
      const { page = 1, pageSize = 1000, search = '' } = req.query;
      
      let sql = "SELECT * FROM pessoas WHERE type = 'Funcionário'";
      const params = [];

      if (search) {
        sql += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR document LIKE ? OR code LIKE ? OR position LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }

      sql += ' ORDER BY name ASC';

      const allResults = await db.query(sql, params);
      const total = allResults.length;

      const p = parseInt(page, 10);
      const ps = parseInt(pageSize, 10);
      const start = (p - 1) * ps;
      const pageItems = allResults.slice(start, start + ps);

      const formattedItems = pageItems.map(item => ({
        id: item.id,
        code: item.code,
        name: item.name,
        type: item.type,
        document: item.document,
        rgIe: item.rg_ie,
        birthDate: item.birth_date,
        hireDate: item.hire_date,
        position: item.position,
        departmentId: item.department_id,
        salary: parseFloat(item.salary || 0),
        commissionPercent: parseFloat(item.commission_percent || 0),
        pixKey: item.pix_key,
        bankName: item.bank_name,
        bankAgency: item.bank_agency,
        bankAccount: item.bank_account,
        workSchedule: item.work_schedule,
        sellerCode: item.seller_code,
        email: item.email,
        phone: item.phone,
        phone2: item.phone2,
        cep: item.cep,
        street: item.street,
        number: item.number,
        complement: item.complement,
        neighborhood: item.neighborhood,
        city: item.city,
        state: item.state,
        notes: item.notes,
        photo: item.photo,
        active: item.active !== undefined ? Boolean(item.active) : true
      }));

      res.json({ data: formattedItems, total });
    } catch (error) {
      console.error('Erro ao buscar funcionários:', error);
      res.status(500).json({ error: 'Erro ao buscar funcionários' });
    }
  });

  app.post('/api/funcionarios', async (req, res) => {
    try {
      const p = req.body;
      const id = uuidv4();
      
      const sql = `INSERT INTO pessoas 
        (id, code, name, type, document, rg_ie, birth_date, hire_date, position, department_id,
         salary, commission_percent, pix_key, bank_name, bank_agency, bank_account, work_schedule, seller_code,
         email, phone, phone2, cep, street, number, complement, neighborhood, city, state, notes, photo, active) 
        VALUES (?, ?, ?, 'Funcionário', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const params = [
        id,
        p.code || null,
        p.name || '',
        p.document || null,
        p.rgIe || null,
        p.birthDate || null,
        p.hireDate || null,
        p.position || null,
        p.departmentId || null,
        p.salary || 0,
        p.commissionPercent || 0,
        p.pixKey || null,
        p.bankName || null,
        p.bankAgency || null,
        p.bankAccount || null,
        p.workSchedule || null,
        p.sellerCode || null,
        p.email || null,
        p.phone || null,
        p.phone2 || null,
        p.cep || null,
        p.street || null,
        p.number || null,
        p.complement || null,
        p.neighborhood || null,
        p.city || null,
        p.state || null,
        p.notes || null,
        p.photo || null,
        p.active !== undefined ? p.active : true
      ];

      await db.query(sql, params);
      
      res.status(201).json({ id, ...p, type: 'Funcionário' });
    } catch (error) {
      console.error('Erro ao criar funcionário:', error);
      res.status(500).json({ error: 'Erro ao criar funcionário' });
    }
  });


  // ============================================
  // API DE PARÂMETROS FISCAIS
  // ============================================

  // Listar parâmetros fiscais
  app.get('/api/fiscal', async (req, res) => {
    try {
      const { search = '' } = req.query;
      let sql = 'SELECT * FROM fiscal_params WHERE 1=1';
      const params = [];
      
      if (search) {
        sql += ' AND (description LIKE ? OR ncm LIKE ? OR cfop LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
      }
      
      sql += ' ORDER BY description ASC';
      const rows = await db.query(sql, params);
      res.json({ data: rows });
    } catch (error) {
      console.error('Erro ao listar fiscal:', error);
      res.status(500).json({ error: 'Erro ao listar parâmetros fiscais' });
    }
  });

  // Obter parâmetro fiscal por ID
  app.get('/api/fiscal/:id', async (req, res) => {
    try {
      const rows = await db.query('SELECT * FROM fiscal_params WHERE id = ?', [req.params.id]);
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Parâmetro fiscal não encontrado' });
      }
      res.json(rows[0]);
    } catch (error) {
      console.error('Erro ao obter fiscal:', error);
      res.status(500).json({ error: 'Erro ao obter parâmetro fiscal' });
    }
  });

  // Criar parâmetro fiscal
  app.post('/api/fiscal', async (req, res) => {
    try {
      const id = uuidv4();
      const p = req.body;
      
      const sql = `INSERT INTO fiscal_params 
        (id, description, ncm, cfop, cst_icms, icms_percent, cst_pis, pis_percent, cst_cofins, cofins_percent, ipi_percent, mva_percent, notes, active) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      await db.query(sql, [
        id,
        p.description || '',
        p.ncm || null,
        p.cfop || null,
        p.cstIcms || null,
        p.icms || p.icmsPercent || 0,
        p.cstPis || null,
        p.pisPercent || 0,
        p.cstCofins || null,
        p.cofinsPercent || 0,
        p.ipiPercent || 0,
        p.mvaPercent || 0,
        p.notes || null,
        p.active !== undefined ? p.active : true
      ]);
      
      res.status(201).json({ id, ...p });
    } catch (error) {
      console.error('Erro ao criar fiscal:', error);
      res.status(500).json({ error: 'Erro ao criar parâmetro fiscal' });
    }
  });

  // Atualizar parâmetro fiscal
  app.put('/api/fiscal/:id', async (req, res) => {
    try {
      const p = req.body;
      
      const sql = `UPDATE fiscal_params SET 
        description = ?, ncm = ?, cfop = ?, cst_icms = ?, icms_percent = ?, 
        cst_pis = ?, pis_percent = ?, cst_cofins = ?, cofins_percent = ?, 
        ipi_percent = ?, mva_percent = ?, notes = ?, active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`;
      
      await db.query(sql, [
        p.description || '',
        p.ncm || null,
        p.cfop || null,
        p.cstIcms || null,
        p.icms || p.icmsPercent || 0,
        p.cstPis || null,
        p.pisPercent || 0,
        p.cstCofins || null,
        p.cofinsPercent || 0,
        p.ipiPercent || 0,
        p.mvaPercent || 0,
        p.notes || null,
        p.active !== undefined ? p.active : true,
        req.params.id
      ]);
      
      res.json({ id: req.params.id, ...p });
    } catch (error) {
      console.error('Erro ao atualizar fiscal:', error);
      res.status(500).json({ error: 'Erro ao atualizar parâmetro fiscal' });
    }
  });

  // Excluir parâmetro fiscal
  app.delete('/api/fiscal/:id', async (req, res) => {
    try {
      await db.query('DELETE FROM fiscal_params WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Erro ao excluir fiscal:', error);
      res.status(500).json({ error: 'Erro ao excluir parâmetro fiscal' });
    }
  });

  // ============================================
  // API DE CONFIGURAÇÕES NF-e/NFC-e/SAT
  // ============================================

  // Listar configurações NF-e
  app.get('/api/nfe', async (req, res) => {
    try {
      const { search = '' } = req.query;
      let sql = 'SELECT * FROM nfe_config WHERE 1=1';
      const params = [];
      
      if (search) {
        sql += ' AND (tipo LIKE ? OR serie LIKE ? OR observacoes LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
      }
      
      sql += ' ORDER BY tipo ASC';
      const rows = await db.query(sql, params);
      res.json({ data: rows });
    } catch (error) {
      console.error('Erro ao listar nfe:', error);
      res.status(500).json({ error: 'Erro ao listar configurações NF-e' });
    }
  });

  // Obter configuração NF-e por ID
  app.get('/api/nfe/:id', async (req, res) => {
    try {
      const rows = await db.query('SELECT * FROM nfe_config WHERE id = ?', [req.params.id]);
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Configuração NF-e não encontrada' });
      }
      res.json(rows[0]);
    } catch (error) {
      console.error('Erro ao obter nfe:', error);
      res.status(500).json({ error: 'Erro ao obter configuração NF-e' });
    }
  });

  // Criar configuração NF-e
  app.post('/api/nfe', async (req, res) => {
    try {
      const id = uuidv4();
      const p = req.body;
      
      const sql = `INSERT INTO nfe_config 
        (id, tipo, ambiente, serie, numero_atual, certificado_path, certificado_senha, csc_id, csc_token, id_token_nfce, token_nfce, sat_codigo_ativacao, sat_assinatura, observacoes, ativo) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      await db.query(sql, [
        id,
        p.tipo || 'NFC-e',
        p.ambiente || 'homologacao',
        p.serie || null,
        p.numeroAtual || 1,
        p.certificadoPath || null,
        p.certificadoSenha || null,
        p.cscId || null,
        p.cscToken || null,
        p.idTokenNfce || null,
        p.tokenNfce || null,
        p.satCodigoAtivacao || null,
        p.satAssinatura || null,
        p.obs || p.observacoes || null,
        p.ativo !== undefined ? p.ativo : true
      ]);
      
      res.status(201).json({ id, ...p });
    } catch (error) {
      console.error('Erro ao criar nfe:', error);
      res.status(500).json({ error: 'Erro ao criar configuração NF-e' });
    }
  });

  // Atualizar configuração NF-e
  app.put('/api/nfe/:id', async (req, res) => {
    try {
      const p = req.body;
      
      const sql = `UPDATE nfe_config SET 
        tipo = ?, ambiente = ?, serie = ?, numero_atual = ?, certificado_path = ?, certificado_senha = ?,
        csc_id = ?, csc_token = ?, id_token_nfce = ?, token_nfce = ?, sat_codigo_ativacao = ?, sat_assinatura = ?,
        observacoes = ?, ativo = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`;
      
      await db.query(sql, [
        p.tipo || 'NFC-e',
        p.ambiente || 'homologacao',
        p.serie || null,
        p.numeroAtual || 1,
        p.certificadoPath || null,
        p.certificadoSenha || null,
        p.cscId || null,
        p.cscToken || null,
        p.idTokenNfce || null,
        p.tokenNfce || null,
        p.satCodigoAtivacao || null,
        p.satAssinatura || null,
        p.obs || p.observacoes || null,
        p.ativo !== undefined ? p.ativo : true,
        req.params.id
      ]);
      
      res.json({ id: req.params.id, ...p });
    } catch (error) {
      console.error('Erro ao atualizar nfe:', error);
      res.status(500).json({ error: 'Erro ao atualizar configuração NF-e' });
    }
  });

  // Excluir configuração NF-e
  app.delete('/api/nfe/:id', async (req, res) => {
    try {
      await db.query('DELETE FROM nfe_config WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Erro ao excluir nfe:', error);
      res.status(500).json({ error: 'Erro ao excluir configuração NF-e' });
    }
  });

  // ============================================
  // API DE NOTAS FISCAIS EMITIDAS
  // ============================================

  // Listar notas fiscais
  app.get('/api/notas-fiscais', async (req, res) => {
    try {
      const { search = '', tipo, status, startDate, endDate, limit = 100 } = req.query;
      let sql = 'SELECT * FROM notas_fiscais WHERE 1=1';
      const params = [];
      
      if (search) {
        sql += ' AND (numero LIKE ? OR chave_acesso LIKE ? OR destinatario_nome LIKE ? OR destinatario_cpf_cnpj LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term, term);
      }
      
      if (tipo) {
        sql += ' AND tipo = ?';
        params.push(tipo);
      }
      
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      
      if (startDate) {
        sql += ' AND data_emissao >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        sql += ' AND data_emissao <= ?';
        params.push(endDate + ' 23:59:59');
      }
      
      sql += ' ORDER BY data_emissao DESC LIMIT ?';
      params.push(parseInt(limit));
      
      const rows = await getDatabase(req).query(sql, params);
      
      // Formatar dados para o frontend
      const formattedRows = rows.map(row => ({
        id: row.id,
        tipo: row.tipo,
        serie: row.serie,
        numero: row.numero,
        chaveAcesso: row.chave_acesso,
        protocolo: row.protocolo,
        ambiente: row.ambiente,
        status: row.status,
        vendaId: row.venda_id,
        destinatario: row.destinatario_nome,
        destinatarioCpfCnpj: row.destinatario_cpf_cnpj,
        subtotal: parseFloat(row.subtotal) || 0,
        desconto: parseFloat(row.desconto) || 0,
        total: parseFloat(row.total) || 0,
        formaPagamento: row.forma_pagamento,
        dataEmissao: row.data_emissao,
        dataAutorizacao: row.data_autorizacao
      }));
      
      res.json({ data: formattedRows, total: formattedRows.length });
    } catch (error) {
      console.error('Erro ao listar notas fiscais:', error);
      res.status(500).json({ error: 'Erro ao listar notas fiscais' });
    }
  });

  // Estatísticas de notas fiscais (deve vir ANTES de :id)
  app.get('/api/notas-fiscais/stats', async (req, res) => {
    try {
      const tenantDb = getDatabase(req);
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      
      const [total] = await tenantDb.query(
        'SELECT COUNT(*) as count FROM notas_fiscais WHERE data_emissao >= ?',
        [firstDayOfMonth]
      );
      const [autorizadas] = await tenantDb.query(
        'SELECT COUNT(*) as count FROM notas_fiscais WHERE status = ? AND data_emissao >= ?',
        ['autorizada', firstDayOfMonth]
      );
      const [pendentes] = await tenantDb.query(
        'SELECT COUNT(*) as count FROM notas_fiscais WHERE status = ? AND data_emissao >= ?',
        ['pendente', firstDayOfMonth]
      );
      const [canceladas] = await tenantDb.query(
        'SELECT COUNT(*) as count FROM notas_fiscais WHERE status = ? AND data_emissao >= ?',
        ['cancelada', firstDayOfMonth]
      );
      
      res.json({
        total: total?.count || 0,
        autorizadas: autorizadas?.count || 0,
        pendentes: pendentes?.count || 0,
        canceladas: canceladas?.count || 0
      });
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      res.status(500).json({ error: 'Erro ao obter estatísticas' });
    }
  });

  // Listar numerações inutilizadas (deve vir ANTES de :id)
  app.get('/api/notas-fiscais/inutilizadas', async (req, res) => {
    try {
      const rows = await getDatabase(req).query('SELECT * FROM nfe_inutilizadas ORDER BY data_inutilizacao DESC');
      res.json({ data: rows });
    } catch (error) {
      console.error('Erro ao listar inutilizadas:', error);
      res.status(500).json({ error: 'Erro ao listar numerações inutilizadas' });
    }
  });

  // Obter nota fiscal por ID com itens
  app.get('/api/notas-fiscais/:id', async (req, res) => {
    try {
      const rows = await getDatabase(req).query('SELECT * FROM notas_fiscais WHERE id = ?', [req.params.id]);
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Nota fiscal não encontrada' });
      }
      
      const nota = rows[0];
      const itens = await getDatabase(req).query('SELECT * FROM notas_fiscais_itens WHERE nota_fiscal_id = ?', [nota.id]);
      
      res.json({
        ...nota,
        itens: itens.map(item => ({
          id: item.id,
          produtoId: item.produto_id,
          codigo: item.codigo,
          nome: item.nome,
          ncm: item.ncm,
          cfop: item.cfop,
          unidade: item.unidade,
          quantidade: item.quantidade,
          valorUnitario: item.valor_unitario,
          valorTotal: item.valor_total,
          cstIcms: item.cst_icms,
          aliqIcms: item.aliq_icms,
          valorIcms: item.valor_icms
        }))
      });
    } catch (error) {
      console.error('Erro ao obter nota fiscal:', error);
      res.status(500).json({ error: 'Erro ao obter nota fiscal' });
    }
  });

  // Emitir (criar) nova nota fiscal
  app.post('/api/notas-fiscais', async (req, res) => {
    try {
      const id = uuidv4();
      const p = req.body;
      const tenantDb = getDatabase(req);
      
      // Buscar próximo número da série
      const [configResult] = await tenantDb.query(
        'SELECT numero_atual FROM nfe_config WHERE tipo = ? AND serie = ? LIMIT 1',
        [p.tipo || 'NFC-e', p.serie || '1']
      );
      const numero = configResult?.numero_atual || 1;
      
      // Gerar chave de acesso simulada (em produção, seria gerada pelo emissor fiscal)
      const chaveAcesso = generateChaveAcesso(p.tipo, p.serie, numero);
      
      const sql = `INSERT INTO notas_fiscais 
        (id, tipo, serie, numero, chave_acesso, ambiente, status, venda_id,
         destinatario_cpf_cnpj, destinatario_nome, destinatario_ie, destinatario_endereco,
         destinatario_numero, destinatario_bairro, destinatario_cep, destinatario_cidade,
         destinatario_uf, destinatario_telefone, destinatario_email,
         subtotal, desconto, total_icms, total_pis, total_cofins, total,
         forma_pagamento, valor_pago, troco, info_fisco, info_consumidor, data_emissao)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const dest = p.destinatario || {};
      const totais = p.totais || {};
      const pag = p.pagamento || {};
      
      await tenantDb.query(sql, [
        id,
        p.tipo || 'NFC-e',
        p.serie || '1',
        numero,
        chaveAcesso,
        p.ambiente || 'homologacao',
        'pendente',
        p.vendaId || null,
        dest.cpfCnpj || null,
        dest.nome || null,
        dest.ie || null,
        dest.endereco || null,
        dest.numero || null,
        dest.bairro || null,
        dest.cep || null,
        dest.cidade || null,
        dest.uf || null,
        dest.telefone || null,
        dest.email || null,
        totais.subtotal || 0,
        totais.desconto || 0,
        totais.icms || 0,
        totais.pis || 0,
        totais.cofins || 0,
        totais.total || 0,
        pag.forma || '01',
        pag.valor || 0,
        pag.troco || 0,
        p.infoFisco || null,
        p.infoConsumidor || null,
        DateTimeUtils.nowForDB()
      ]);
      
      // Inserir itens
      const itens = p.itens || [];
      for (const item of itens) {
        const itemId = uuidv4();
        await tenantDb.query(
          `INSERT INTO notas_fiscais_itens 
            (id, nota_fiscal_id, produto_id, codigo, nome, ncm, cfop, unidade, quantidade,
             valor_unitario, valor_total, cst_icms, aliq_icms, valor_icms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId, id, item.id || null, item.codigo || '', item.nome,
            item.ncm || '', item.cfop || '5102', item.unidade || 'UN',
            item.quantidade || 1, item.valorUnitario || 0, item.valorTotal || 0,
            item.cstIcms || '60', item.aliqIcms || 0, item.valorIcms || 0
          ]
        );
      }
      
      // Atualizar próximo número na config
      await tenantDb.query(
        'UPDATE nfe_config SET numero_atual = numero_atual + 1 WHERE tipo = ? AND serie = ?',
        [p.tipo || 'NFC-e', p.serie || '1']
      );
      
      // Simular autorização (em produção, comunicaria com SEFAZ)
      // Aqui vamos simular sucesso após um delay
      setTimeout(async () => {
        try {
          const protocolo = generateProtocolo();
          await tenantDb.query(
            `UPDATE notas_fiscais SET status = 'autorizada', protocolo = ?, data_autorizacao = ? WHERE id = ?`,
            [protocolo, DateTimeUtils.nowForDB(), id]
          );
        } catch (e) {
          console.error('Erro ao autorizar nota:', e);
        }
      }, 1000);
      
      res.status(201).json({ 
        id, 
        numero, 
        chaveAcesso,
        status: 'pendente',
        message: 'Nota fiscal enviada para autorização' 
      });
    } catch (error) {
      console.error('Erro ao emitir nota fiscal:', error);
      res.status(500).json({ error: 'Erro ao emitir nota fiscal: ' + error.message });
    }
  });

  // Cancelar nota fiscal
  app.post('/api/notas-fiscais/:id/cancelar', async (req, res) => {
    try {
      const { motivo } = req.body;
      if (!motivo || motivo.length < 15) {
        return res.status(400).json({ error: 'Justificativa deve ter no mínimo 15 caracteres' });
      }
      
      const tenantDb = getDatabase(req);
      const [nota] = await tenantDb.query('SELECT * FROM notas_fiscais WHERE id = ?', [req.params.id]);
      
      if (!nota) {
        return res.status(404).json({ error: 'Nota fiscal não encontrada' });
      }
      
      if (nota.status !== 'autorizada') {
        return res.status(400).json({ error: 'Apenas notas autorizadas podem ser canceladas' });
      }
      
      // Simular cancelamento (em produção, comunicaria com SEFAZ)
      await tenantDb.query(
        `UPDATE notas_fiscais SET status = 'cancelada', motivo_cancelamento = ?, data_cancelamento = ? WHERE id = ?`,
        [motivo, DateTimeUtils.nowForDB(), req.params.id]
      );
      
      res.json({ success: true, message: 'Nota fiscal cancelada com sucesso' });
    } catch (error) {
      console.error('Erro ao cancelar nota fiscal:', error);
      res.status(500).json({ error: 'Erro ao cancelar nota fiscal' });
    }
  });

  // Inutilizar numeração
  app.post('/api/notas-fiscais/inutilizar', async (req, res) => {
    try {
      const { tipo, serie, numeroInicio, numeroFim, justificativa } = req.body;
      
      if (!justificativa || justificativa.length < 15) {
        return res.status(400).json({ error: 'Justificativa deve ter no mínimo 15 caracteres' });
      }
      
      if (!numeroInicio || !numeroFim || numeroFim < numeroInicio) {
        return res.status(400).json({ error: 'Intervalo de numeração inválido' });
      }
      
      const tenantDb = getDatabase(req);
      const id = uuidv4();
      const modelo = tipo === 'NF-e' ? '55' : '65';
      const protocolo = generateProtocolo();
      
      await tenantDb.query(
        `INSERT INTO nfe_inutilizadas (id, tipo, modelo, serie, numero_inicio, numero_fim, justificativa, protocolo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tipo || 'NFC-e', modelo, serie || '1', numeroInicio, numeroFim, justificativa, protocolo]
      );
      
      res.status(201).json({ id, protocolo, message: 'Numeração inutilizada com sucesso' });
    } catch (error) {
      console.error('Erro ao inutilizar numeração:', error);
      res.status(500).json({ error: 'Erro ao inutilizar numeração' });
    }
  });

  // Funções auxiliares para NFe
  function generateChaveAcesso(tipo, serie, numero) {
    // Chave de acesso simplificada para simulação
    // Em produção, seria gerada com dados reais (CNPJ, UF, data, etc)
    const modelo = tipo === 'NF-e' ? '55' : '65';
    const random = Math.random().toString().substring(2, 11);
    const dv = Math.floor(Math.random() * 10);
    return `35${new Date().toISOString().substring(2, 4)}${new Date().toISOString().substring(5, 7)}00000000000000${modelo}${String(serie).padStart(3, '0')}${String(numero).padStart(9, '0')}1${random}${dv}`;
  }

  function generateProtocolo() {
    return `${new Date().toISOString().substring(2, 4)}${String(Math.floor(Math.random() * 1000000000000000)).padStart(15, '0')}`;
  }

  // ============================================
  // API DE CREDENCIAIS SNGPC
  // ============================================

  // Listar credenciais SNGPC
  app.get('/api/sngpc', async (req, res) => {
    try {
      const { search = '' } = req.query;
      let sql = 'SELECT * FROM sngpc_credentials WHERE 1=1';
      const params = [];
      
      
      if (search) {
        sql += ' AND (usuario LIKE ? OR responsavel_tecnico LIKE ? OR cnpj_farmacia LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
      }
      
      sql += ' ORDER BY usuario ASC';
      const rows = await db.query(sql, params);
      res.json({ data: rows });
    } catch (error) {
      console.error('Erro ao listar sngpc:', error);
      res.status(500).json({ error: 'Erro ao listar credenciais SNGPC' });
    }
  });

  // Obter credencial SNGPC por ID
  app.get('/api/sngpc/:id', async (req, res) => {
    try {
      const rows = await db.query('SELECT * FROM sngpc_credentials WHERE id = ?', [req.params.id]);
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Credencial SNGPC não encontrada' });
      }
      res.json(rows[0]);
    } catch (error) {
      console.error('Erro ao obter sngpc:', error);
      res.status(500).json({ error: 'Erro ao obter credencial SNGPC' });
    }
  });

  // Criar credencial SNGPC
  app.post('/api/sngpc', async (req, res) => {
    try {
      const id = uuidv4();
      const p = req.body;
      
      const sql = `INSERT INTO sngpc_credentials 
        (id, usuario, senha, cnpj_farmacia, crf, responsavel_tecnico, email_contato, integrar_imendes, imendes_token, ativo) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      await db.query(sql, [
        id,
        p.user || p.usuario || '',
        p.pass || p.senha || null,
        p.cnpjFarmacia || null,
        p.crf || null,
        p.responsavelTecnico || null,
        p.emailContato || null,
        p.integrarImendes || false,
        p.imendesToken || null,
        p.ativo !== undefined ? p.ativo : true
      ]);
      
      res.status(201).json({ id, ...p });
    } catch (error) {
      console.error('Erro ao criar sngpc:', error);
      res.status(500).json({ error: 'Erro ao criar credencial SNGPC' });
    }
  });

  // Atualizar credencial SNGPC
  app.put('/api/sngpc/:id', async (req, res) => {
    try {
      const p = req.body;
      
      const sql = `UPDATE sngpc_credentials SET 
        usuario = ?, senha = ?, cnpj_farmacia = ?, crf = ?, responsavel_tecnico = ?,
        email_contato = ?, integrar_imendes = ?, imendes_token = ?, ativo = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`;
      
      await db.query(sql, [
        p.user || p.usuario || '',
        p.pass || p.senha || null,
        p.cnpjFarmacia || null,
        p.crf || null,
        p.responsavelTecnico || null,
        p.emailContato || null,
        p.integrarImendes || false,
        p.imendesToken || null,
        p.ativo !== undefined ? p.ativo : true,
        req.params.id
      ]);
      
      res.json({ id: req.params.id, ...p });
    } catch (error) {
      console.error('Erro ao atualizar sngpc:', error);
      res.status(500).json({ error: 'Erro ao atualizar credencial SNGPC' });
    }
  });

  // Excluir credencial SNGPC
  app.delete('/api/sngpc/:id', async (req, res) => {
    try {
      await db.query('DELETE FROM sngpc_credentials WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Erro ao excluir sngpc:', error);
      res.status(500).json({ error: 'Erro ao excluir credencial SNGPC' });
    }
  });

  // ============================================
  // API DE REGRAS DE PDV
  // ============================================

  // Listar regras de PDV
  app.get('/api/pdv-config', async (req, res) => {
    try {
      const { search = '' } = req.query;
      let sql = 'SELECT * FROM pdv_rules WHERE 1=1';
      const params = [];
      
      if (search) {
        sql += ' AND nome LIKE ?';
        params.push(`%${search}%`);
      }
      
      sql += ' ORDER BY nome ASC';
      const rows = await db.query(sql, params);
      res.json({ data: rows });
    } catch (error) {
      console.error('Erro ao listar pdv-config:', error);
      res.status(500).json({ error: 'Erro ao listar regras de PDV' });
    }
  });

  // Obter regra de PDV por ID
  app.get('/api/pdv-config/:id', async (req, res) => {
    try {
      const rows = await db.query('SELECT * FROM pdv_rules WHERE id = ?', [req.params.id]);
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Regra de PDV não encontrada' });
      }
      res.json(rows[0]);
    } catch (error) {
      console.error('Erro ao obter pdv-config:', error);
      res.status(500).json({ error: 'Erro ao obter regra de PDV' });
    }
  });

  // Criar regra de PDV
  app.post('/api/pdv-config', async (req, res) => {
    try {
      const id = uuidv4();
      const p = req.body;
      
      const sql = `INSERT INTO pdv_rules 
        (id, nome, exigir_cpf, exigir_vendedor, limite_desconto_percent, permitir_desconto_gerente, 
         permitir_venda_sem_estoque, solicitar_autorizacao_desconto, limite_valor_autorizacao, 
         formas_pagamento, impressao_automatica, abrir_gaveta_dinheiro, ativo) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      await db.query(sql, [
        id,
        p.nome || p.name || 'Regra Padrão',
        p.requireCpf || p.exigirCpf || false,
        p.exigirVendedor || false,
        p.discount || p.limiteDescontoPercent || 0,
        p.permitirDescontoGerente !== undefined ? p.permitirDescontoGerente : true,
        p.permitirVendaSemEstoque || false,
        p.solicitarAutorizacaoDesconto || false,
        p.limiteValorAutorizacao || 0,
        typeof p.formasPagamento === 'string' ? p.formasPagamento : JSON.stringify(p.formasPagamento || ['dinheiro','cartao_credito','cartao_debito','pix']),
        p.impressaoAutomatica !== undefined ? p.impressaoAutomatica : true,
        p.abrirGavetaDinheiro !== undefined ? p.abrirGavetaDinheiro : true,
        p.ativo !== undefined ? p.ativo : true
      ]);
      
      res.status(201).json({ id, ...p });
    } catch (error) {
      console.error('Erro ao criar pdv-config:', error);
      res.status(500).json({ error: 'Erro ao criar regra de PDV' });
    }
  });

  // Atualizar regra de PDV
  app.put('/api/pdv-config/:id', async (req, res) => {
    try {
      const p = req.body;
      
      const sql = `UPDATE pdv_rules SET 
        nome = ?, exigir_cpf = ?, exigir_vendedor = ?, limite_desconto_percent = ?, permitir_desconto_gerente = ?,
        permitir_venda_sem_estoque = ?, solicitar_autorizacao_desconto = ?, limite_valor_autorizacao = ?,
        formas_pagamento = ?, impressao_automatica = ?, abrir_gaveta_dinheiro = ?, ativo = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`;
      
      await db.query(sql, [
        p.nome || p.name || 'Regra Padrão',
        p.requireCpf || p.exigirCpf || false,
        p.exigirVendedor || false,
        p.discount || p.limiteDescontoPercent || 0,
        p.permitirDescontoGerente !== undefined ? p.permitirDescontoGerente : true,
        p.permitirVendaSemEstoque || false,
        p.solicitarAutorizacaoDesconto || false,
        p.limiteValorAutorizacao || 0,
        typeof p.formasPagamento === 'string' ? p.formasPagamento : JSON.stringify(p.formasPagamento || ['dinheiro','cartao_credito','cartao_debito','pix']),
        p.impressaoAutomatica !== undefined ? p.impressaoAutomatica : true,
        p.abrirGavetaDinheiro !== undefined ? p.abrirGavetaDinheiro : true,
        p.ativo !== undefined ? p.ativo : true,
        req.params.id
      ]);
      
      res.json({ id: req.params.id, ...p });
    } catch (error) {
      console.error('Erro ao atualizar pdv-config:', error);
      res.status(500).json({ error: 'Erro ao atualizar regra de PDV' });
    }
  });

  // Excluir regra de PDV
  app.delete('/api/pdv-config/:id', async (req, res) => {
    try {
      await db.query('DELETE FROM pdv_rules WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Erro ao excluir pdv-config:', error);
      res.status(500).json({ error: 'Erro ao excluir regra de PDV' });
    }
  });

  // ============================================
  // API DE ORÇAMENTOS / OS
  // ============================================

  // Listar orçamentos
  app.get('/api/orcamentos', async (req, res) => {
    try {
      const { search = '' } = req.query;
      let sql = 'SELECT * FROM orcamentos WHERE 1=1';
      const params = [];
      
      if (search) {
        sql += ' AND (client LIKE ? OR obs LIKE ? OR CAST(numero AS TEXT) LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
      }
      
      sql += ' ORDER BY created_at DESC';
      const rows = await db.query(sql, params);
      res.json({ data: rows });
    } catch (error) {
      console.error('Erro ao listar orçamentos:', error);
      res.status(500).json({ error: 'Erro ao listar orçamentos' });
    }
  });

  // Obter orçamento por ID
  app.get('/api/orcamentos/:id', async (req, res) => {
    try {
      const rows = await db.query('SELECT * FROM orcamentos WHERE id = ?', [req.params.id]);
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Orçamento não encontrado' });
      }
      res.json(rows[0]);
    } catch (error) {
      console.error('Erro ao obter orçamento:', error);
      res.status(500).json({ error: 'Erro ao obter orçamento' });
    }
  });

  // Criar orçamento
  app.post('/api/orcamentos', async (req, res) => {
    try {
      const id = uuidv4();
      const p = req.body;
      
      // Buscar próximo número
      const lastNum = await db.query('SELECT MAX(numero) as max FROM orcamentos');
      const numero = (lastNum[0]?.max || 0) + 1;
      
      const sql = `INSERT INTO orcamentos (id, numero, client, client_id, total, status, validade, obs, items) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      await db.query(sql, [
        id,
        numero,
        p.client || null,
        p.clientId || null,
        p.total || 0,
        p.status || 'pendente',
        p.validade || null,
        p.obs || null,
        typeof p.items === 'string' ? p.items : JSON.stringify(p.items || [])
      ]);
      
      res.status(201).json({ id, numero, ...p });
    } catch (error) {
      console.error('Erro ao criar orçamento:', error);
      res.status(500).json({ error: 'Erro ao criar orçamento' });
    }
  });

  // Atualizar orçamento
  app.put('/api/orcamentos/:id', async (req, res) => {
    try {
      const p = req.body;
      
      const sql = `UPDATE orcamentos SET 
        client = ?, client_id = ?, total = ?, status = ?, validade = ?, obs = ?, items = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`;
      
      await db.query(sql, [
        p.client || null,
        p.clientId || null,
        p.total || 0,
        p.status || 'pendente',
        p.validade || null,
        p.obs || null,
        typeof p.items === 'string' ? p.items : JSON.stringify(p.items || []),
        req.params.id
      ]);
      
      res.json({ id: req.params.id, ...p });
    } catch (error) {
      console.error('Erro ao atualizar orçamento:', error);
      res.status(500).json({ error: 'Erro ao atualizar orçamento' });
    }
  });

  // Excluir orçamento
  app.delete('/api/orcamentos/:id', async (req, res) => {
    try {
      await db.query('DELETE FROM orcamentos WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Erro ao excluir orçamento:', error);
      res.status(500).json({ error: 'Erro ao excluir orçamento' });
    }
  });

  // ============================================
  // API DE BACKUPS
  // ============================================

  // Listar backups
  app.get('/api/backups', async (req, res) => {
    try {
      const { search = '' } = req.query;
      let sql = 'SELECT * FROM backups WHERE 1=1';
      const params = [];
      
      if (search) {
        sql += ' AND filename LIKE ?';
        params.push(`%${search}%`);
      }
      
      sql += ' ORDER BY created_at DESC';
      const rows = await db.query(sql, params);
      res.json({ data: rows });
    } catch (error) {
      console.error('Erro ao listar backups:', error);
      res.status(500).json({ error: 'Erro ao listar backups' });
    }
  });

  // Gerar backup
  app.post('/api/backups', async (req, res) => {
    try {
      const id = uuidv4();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `backup_${timestamp}.db`;
      const fs = require('fs');
      const path = require('path');
      
      // Copiar arquivo do banco de dados
      const dbPath = path.join(__dirname, 'gestao_comercial.db');
      const backupDir = path.join(__dirname, 'backups');
      const backupPath = path.join(backupDir, filename);
      
      // Criar diretório de backups se não existir
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      // Copiar o arquivo do banco
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, backupPath);
        const stats = fs.statSync(backupPath);
        
        const sql = `INSERT INTO backups (id, filename, size, path, tipo, status) VALUES (?, ?, ?, ?, ?, ?)`;
        await db.query(sql, [id, filename, stats.size, backupPath, 'manual', 'completo']);
        
        res.status(201).json({ id, filename, size: stats.size, status: 'completo' });
      } else {
        res.status(500).json({ error: 'Arquivo de banco de dados não encontrado' });
      }
    } catch (error) {
      console.error('Erro ao gerar backup:', error);
      res.status(500).json({ error: 'Erro ao gerar backup' });
    }
  });

  // Download backup
  app.get('/api/backups/:id/download', async (req, res) => {
    try {
      const rows = await db.query('SELECT * FROM backups WHERE id = ?', [req.params.id]);
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Backup não encontrado' });
      }
      
      const fs = require('fs');
      const backup = rows[0];
      
      if (fs.existsSync(backup.path)) {
        res.download(backup.path, backup.filename);
      } else {
        res.status(404).json({ error: 'Arquivo de backup não encontrado' });
      }
    } catch (error) {
      console.error('Erro ao baixar backup:', error);
      res.status(500).json({ error: 'Erro ao baixar backup' });
    }
  });

  // Excluir backup
  app.delete('/api/backups/:id', async (req, res) => {
    try {
      const rows = await db.query('SELECT * FROM backups WHERE id = ?', [req.params.id]);
      if (rows && rows.length > 0) {
        const fs = require('fs');
        if (fs.existsSync(rows[0].path)) {
          fs.unlinkSync(rows[0].path);
        }
      }
      await db.query('DELETE FROM backups WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Erro ao excluir backup:', error);
      res.status(500).json({ error: 'Erro ao excluir backup' });
    }
  });

  // ============================================
  // API DE TICKETS DE SUPORTE
  // ============================================

  // Listar tickets
  app.get('/api/tickets', async (req, res) => {
    try {
      const { search = '' } = req.query;
      let sql = 'SELECT * FROM tickets WHERE 1=1';
      const params = [];
      
      if (search) {
        sql += ' AND (subject LIKE ? OR desc LIKE ? OR user_name LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
      }
      
      sql += ' ORDER BY created_at DESC';
      const rows = await db.query(sql, params);
      res.json({ data: rows });
    } catch (error) {
      console.error('Erro ao listar tickets:', error);
      res.status(500).json({ error: 'Erro ao listar tickets' });
    }
  });

  // Obter ticket por ID
  app.get('/api/tickets/:id', async (req, res) => {
    try {
      const rows = await db.query('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Ticket não encontrado' });
      }
      res.json(rows[0]);
    } catch (error) {
      console.error('Erro ao obter ticket:', error);
      res.status(500).json({ error: 'Erro ao obter ticket' });
    }
  });

  // Criar ticket
  app.post('/api/tickets', async (req, res) => {
    try {
      const id = uuidv4();
      const p = req.body;
      
      // Buscar próximo número
      const lastNum = await db.query('SELECT MAX(numero) as max FROM tickets');
      const numero = (lastNum[0]?.max || 0) + 1;
      
      const sql = `INSERT INTO tickets (id, numero, subject, priority, status, desc, user_id, user_name) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      
      await db.query(sql, [
        id,
        numero,
        p.subject || '',
        p.priority || 'Baixa',
        p.status || 'Aberto',
        p.desc || null,
        p.userId || null,
        p.userName || null
      ]);
      
      res.status(201).json({ id, numero, ...p });
    } catch (error) {
      console.error('Erro ao criar ticket:', error);
      res.status(500).json({ error: 'Erro ao criar ticket' });
    }
  });

  // Atualizar ticket
  app.put('/api/tickets/:id', async (req, res) => {
    try {
      const p = req.body;
      
      const sql = `UPDATE tickets SET 
        subject = ?, priority = ?, status = ?, desc = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`;
      
      await db.query(sql, [
        p.subject || '',
        p.priority || 'Baixa',
        p.status || 'Aberto',
        p.desc || null,
        req.params.id
      ]);
      
      res.json({ id: req.params.id, ...p });
    } catch (error) {
      console.error('Erro ao atualizar ticket:', error);
      res.status(500).json({ error: 'Erro ao atualizar ticket' });
    }
  });

  // Excluir ticket
  app.delete('/api/tickets/:id', async (req, res) => {
    try {
      await db.query('DELETE FROM tickets WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Erro ao excluir ticket:', error);
      res.status(500).json({ error: 'Erro ao excluir ticket' });
    }
  });

  // ============================================
  // API DE BRANDING/PERSONALIZAÇÃO DA EMPRESA
  // ============================================

  /**
   * GET /api/empresa/branding
   * Retorna as configurações de branding da empresa do tenant atual
   * Requer autenticação
   */
  app.get('/api/empresa/branding', async (req, res) => {
    try {
      const database = getDatabase(req);
      const results = await database.query(`
        SELECT 
          id, 
          nome_fantasia, 
          razao_social, 
          logo, 
          login_background, 
          login_slogan, 
          primary_color, 
          secondary_color
        FROM empresas 
        LIMIT 1
      `);
      
      if (!results || results.length === 0) {
        return res.json({
          companyName: 'Minha Empresa',
          fantasyName: 'Minha Empresa',
          logo: null,
          loginBackground: null,
          loginSlogan: 'Sistema de Gestão Comercial',
          primaryColor: '#6f42c1',
          secondaryColor: '#5a32a3'
        });
      }
      
      const empresa = results[0];
      res.json({
        id: empresa.id,
        companyName: empresa.razao_social || 'Minha Empresa',
        fantasyName: empresa.nome_fantasia || empresa.razao_social || 'Minha Empresa',
        logo: empresa.logo || null,
        loginBackground: empresa.login_background || null,
        loginSlogan: empresa.login_slogan || 'Sistema de Gestão Comercial',
        primaryColor: empresa.primary_color || '#6f42c1',
        secondaryColor: empresa.secondary_color || '#5a32a3'
      });
    } catch (error) {
      console.error('Erro ao buscar branding:', error);
      res.status(500).json({ error: 'Erro ao buscar configurações de branding' });
    }
  });

  /**
   * GET /api/empresa/branding/public
   * Retorna branding PÚBLICO para a tela de login (sem autenticação)
   * Usa parâmetro tenantId para identificar o tenant
   */
  app.get('/api/empresa/branding/public', async (req, res) => {
    try {
      const { tenantId } = req.query;
      
      // Se tenantId foi fornecido, buscar no banco do tenant específico
      let database;
      if (tenantId) {
        // Criar conexão com o banco do tenant
        const path = require('path');
        const fs = require('fs');
        const tenantDbPath = path.join(__dirname, 'tenants', `${tenantId}.sqlite`);
        
        if (fs.existsSync(tenantDbPath)) {
          const Database = require('better-sqlite3');
          const tenantDb = new Database(tenantDbPath);
          
          const empresa = tenantDb.prepare(`
            SELECT 
              nome_fantasia, 
              razao_social, 
              logo, 
              login_background, 
              login_slogan, 
              primary_color, 
              secondary_color
            FROM empresas 
            LIMIT 1
          `).get();
          
          tenantDb.close();
          
          if (empresa) {
            return res.json({
              companyName: empresa.razao_social || 'Minha Empresa',
              fantasyName: empresa.nome_fantasia || empresa.razao_social || 'Minha Empresa',
              logo: empresa.logo || null,
              loginBackground: empresa.login_background || null,
              loginSlogan: empresa.login_slogan || 'Sistema de Gestão Comercial',
              primaryColor: empresa.primary_color || '#6f42c1',
              secondaryColor: empresa.secondary_color || '#5a32a3'
            });
          }
        }
      }
      
      // Fallback: usar banco principal
      const results = await db.query(`
        SELECT 
          nome_fantasia, 
          razao_social, 
          logo, 
          login_background, 
          login_slogan, 
          primary_color, 
          secondary_color
        FROM empresas 
        LIMIT 1
      `);
      
      if (!results || results.length === 0) {
        return res.json({
          companyName: 'Sistema Comercial',
          fantasyName: 'Sistema Comercial',
          logo: null,
          loginBackground: null,
          loginSlogan: 'Gestão Inteligente para seu Negócio',
          primaryColor: '#6f42c1',
          secondaryColor: '#5a32a3'
        });
      }
      
      const empresa = results[0];
      res.json({
        companyName: empresa.razao_social || 'Sistema Comercial',
        fantasyName: empresa.nome_fantasia || empresa.razao_social || 'Sistema Comercial',
        logo: empresa.logo || null,
        loginBackground: empresa.login_background || null,
        loginSlogan: empresa.login_slogan || 'Gestão Inteligente para seu Negócio',
        primaryColor: empresa.primary_color || '#6f42c1',
        secondaryColor: empresa.secondary_color || '#5a32a3'
      });
    } catch (error) {
      console.error('Erro ao buscar branding público:', error);
      // Em caso de erro, retornar valores default
      res.json({
        companyName: 'Sistema Comercial',
        fantasyName: 'Sistema Comercial',
        logo: null,
        loginBackground: null,
        loginSlogan: 'Gestão Inteligente para seu Negócio',
        primaryColor: '#6f42c1',
        secondaryColor: '#5a32a3'
      });
    }
  });

  /**
   * PUT /api/empresa/branding
   * Atualiza as configurações de branding da empresa
   * Requer autenticação
   */
  app.put('/api/empresa/branding', async (req, res) => {
    try {
      const database = getDatabase(req);
      const { 
        logo, 
        loginBackground, 
        loginSlogan, 
        primaryColor, 
        secondaryColor 
      } = req.body;
      
      // Buscar ID da empresa
      const empresas = await database.query('SELECT id FROM empresas LIMIT 1');
      
      if (!empresas || empresas.length === 0) {
        return res.status(404).json({ error: 'Empresa não encontrada' });
      }
      
      const empresaId = empresas[0].id;
      
      // Atualizar campos de branding
      const sql = `
        UPDATE empresas SET 
          logo = COALESCE(?, logo),
          login_background = ?,
          login_slogan = ?,
          primary_color = COALESCE(?, primary_color),
          secondary_color = COALESCE(?, secondary_color),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      await database.query(sql, [
        logo !== undefined ? logo : null,
        loginBackground !== undefined ? loginBackground : null,
        loginSlogan || 'Sistema de Gestão Comercial',
        primaryColor || '#6f42c1',
        secondaryColor || '#5a32a3',
        empresaId
      ]);
      
      // Buscar dados atualizados
      const updated = await database.query(`
        SELECT 
          nome_fantasia, 
          razao_social, 
          logo, 
          login_background, 
          login_slogan, 
          primary_color, 
          secondary_color
        FROM empresas 
        WHERE id = ?
      `, [empresaId]);
      
      if (updated && updated.length > 0) {
        const empresa = updated[0];
        res.json({
          success: true,
          data: {
            companyName: empresa.razao_social || 'Minha Empresa',
            fantasyName: empresa.nome_fantasia || empresa.razao_social || 'Minha Empresa',
            logo: empresa.logo || null,
            loginBackground: empresa.login_background || null,
            loginSlogan: empresa.login_slogan || 'Sistema de Gestão Comercial',
            primaryColor: empresa.primary_color || '#6f42c1',
            secondaryColor: empresa.secondary_color || '#5a32a3'
          }
        });
      } else {
        res.json({ success: true, message: 'Branding atualizado' });
      }
    } catch (error) {
      console.error('Erro ao atualizar branding:', error);
      res.status(500).json({ error: 'Erro ao atualizar configurações de branding' });
    }
  });

  // ============================================
  // INICIAR SERVIDOR
  // ============================================
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🚀 Servidor rodando com sucesso!');
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🗄️  Usando banco de dados: ${db.getDatabaseType()}`);
    console.log('='.repeat(50));
  });
}

startServer().catch(error => {
  console.error("❌ Falha ao iniciar o servidor:", error);
  process.exit(1);
});
