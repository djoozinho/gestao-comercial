/**
 * Sistema de Proteção de Autenticação - Auth Guard
 * 
 * Este arquivo DEVE ser incluído em TODAS as páginas HTML (exceto login.html)
 * antes de qualquer outro script.
 * 
 * Funcionalidades:
 * - Verifica se o usuário está autenticado
 * - Redireciona para login se não autenticado
 * - Verifica permissões de acesso baseado em roles
 * - Gerencia sessão e timeout
 * - Previne acesso não autorizado
 */

(function() {
    'use strict';
    
    // =====================================================
    // CONFIGURAÇÃO
    // =====================================================
    
    const AUTH_CONFIG = {
        loginPage: '/login.html',
        apiBase: '/api',
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 horas
        checkInterval: 60 * 1000, // Verifica a cada 1 minuto
        publicPages: ['/login.html', '/index.html'],
        roleHierarchy: {
            'superadmin': 100,  // Dono do sistema - acesso total
            'admin': 50,        // Admin da empresa - gerencia funcionários
            'gerente': 30,      // Gerente - acesso avançado
            'caixa': 20,        // Operador de caixa - acesso básico
            'user': 10          // Usuário comum
        }
    };
    
    // Páginas com acesso restrito por role
    const PAGE_PERMISSIONS = {
        '/super-admin.html': ['superadmin'],
        '/admin-empresa.html': ['superadmin', 'admin'],
        '/usuarios.html': ['superadmin', 'admin'],
        '/admin.html': ['superadmin', 'admin'],
        '/admin-sistema.html': ['superadmin', 'admin'],
        '/relatorios.html': ['superadmin', 'admin', 'gerente'],
        '/financeiro-config.html': ['superadmin', 'admin', 'gerente'],
        '/fiscal.html': ['superadmin', 'admin'],
        '/nfe.html': ['superadmin', 'admin'],
        '/nfe-emissao.html': ['superadmin', 'admin', 'gerente', 'caixa'],
        '/backup.html': ['superadmin', 'admin'],
        '/integracoes.html': ['superadmin', 'admin'],
        '/empresa.html': ['superadmin', 'admin'],
        '/pdv.html': ['superadmin', 'admin', 'gerente', 'caixa', 'user'],
        '/pdv-config.html': ['superadmin', 'admin'],
        '/balcao.html': ['superadmin', 'admin', 'gerente', 'caixa', 'user'],
        '/dashboard.html': ['superadmin', 'admin', 'gerente', 'caixa', 'user'],
        '/produtos.html': ['superadmin', 'admin', 'gerente'],
        '/estoque.html': ['superadmin', 'admin', 'gerente'],
        '/pessoas.html': ['superadmin', 'admin', 'gerente', 'caixa', 'user'],
        '/movimentos.html': ['superadmin', 'admin', 'gerente'],
        '/agenda.html': ['superadmin', 'admin', 'gerente', 'caixa', 'user'],
        '/fornecedores.html': ['superadmin', 'admin', 'gerente'],
        '/departamentos.html': ['superadmin', 'admin', 'gerente'],
        '/funcionarios.html': ['superadmin', 'admin'],
        '/comissoes.html': ['superadmin', 'admin', 'gerente'],
        '/orcamentos.html': ['superadmin', 'admin', 'gerente', 'caixa', 'user'],
        '/sngpc.html': ['superadmin', 'admin'],
        '/suporte.html': ['superadmin', 'admin', 'gerente', 'caixa', 'user']
    };
    
    // =====================================================
    // CLASSE PRINCIPAL
    // =====================================================
    
    class AuthGuard {
        constructor() {
            this.isAuthenticated = false;
            this.user = null;
            this.token = null;
            this.tenantId = null;
            this.checkIntervalId = null;
        }
        
        /**
         * Inicializa a proteção
         */
        async init() {
            // Verifica se está em página pública
            const currentPage = window.location.pathname;
            // Garantir que o handler de logout esteja ativo mesmo em páginas públicas (ex.: index.html)
            this.setupLogoutHandler();
            if (this.isPublicPage(currentPage)) {
                return true;
            }
            
            // Carrega dados da sessão
            this.loadSession();
            
            // Configura axios para enviar token automaticamente
            this.setupAxiosInterceptor();
            
            // Verifica autenticação
            if (!this.token) {
                this.redirectToLogin('Sessão não encontrada');
                return false;
            }
            
            // Valida token no servidor
            const isValid = await this.validateToken();
            if (!isValid) {
                this.redirectToLogin('Sessão expirada');
                return false;
            }
            
            // Verifica permissão para a página atual
            if (!this.hasPageAccess(currentPage)) {
                this.showAccessDenied();
                return false;
            }
            
            // Inicia verificação periódica
            this.startPeriodicCheck();
            
            // Adiciona listener para logout
            this.setupLogoutHandler();
            
            // Atualiza UI com informações do usuário
            this.updateUI();
            
            return true;
        }
        
        /**
         * Verifica se é página pública
         */
        isPublicPage(path) {
            return AUTH_CONFIG.publicPages.some(p => path.endsWith(p));
        }
        
        /**
         * Carrega dados da sessão do localStorage
         */
        loadSession() {
            this.token = localStorage.getItem('authToken');
            this.tenantId = localStorage.getItem('tenantId');
            this.user = {
                id: localStorage.getItem('userId'),
                name: localStorage.getItem('userName'),
                role: localStorage.getItem('userRole') || 'user',
                email: localStorage.getItem('userEmail'),
                username: localStorage.getItem('username')
            };
        }
        
        /**
         * Valida token no servidor
         */
        async validateToken() {
            try {
                const response = await fetch(`${AUTH_CONFIG.apiBase}/auth/validate`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'X-Tenant-ID': this.tenantId
                    }
                });
                
                const data = await response.json();
                
                if (data.valid && data.user) {
                    this.isAuthenticated = true;
                    // Atualiza dados do usuário se houver mudanças
                    if (data.user.role) {
                        localStorage.setItem('userRole', data.user.role);
                        this.user.role = data.user.role;
                    }
                    return true;
                }
                
                return false;
            } catch (error) {
                console.error('Erro ao validar token:', error);
                return false;
            }
        }
        
        /**
         * Verifica se usuário tem acesso à página
         */
        hasPageAccess(pagePath) {
            // Normaliza o path
            const normalizedPath = '/' + pagePath.split('/').pop();
            
            // Verifica se página tem restrição
            const allowedRoles = PAGE_PERMISSIONS[normalizedPath];
            
            // Se não há restrição específica, permite acesso
            if (!allowedRoles) {
                return true;
            }
            
            // Verifica se role do usuário está na lista permitida
            const userRole = this.user?.role || 'user';
            return allowedRoles.includes(userRole);
        }
        
        /**
         * Verifica se usuário tem determinada role ou superior
         */
        hasRole(requiredRole) {
            const userLevel = AUTH_CONFIG.roleHierarchy[this.user?.role] || 0;
            const requiredLevel = AUTH_CONFIG.roleHierarchy[requiredRole] || 0;
            return userLevel >= requiredLevel;
        }
        
        /**
         * Verifica se usuário é super admin
         */
        isSuperAdmin() {
            return this.user?.role === 'superadmin';
        }
        
        /**
         * Verifica se usuário é admin da empresa
         */
        isAdmin() {
            return ['superadmin', 'admin'].includes(this.user?.role);
        }
        
        /**
         * Redireciona para login
         */
        redirectToLogin(message) {
            // Limpa sessão
            this.clearSession();
            
            // Salva URL atual para redirecionar após login
            sessionStorage.setItem('redirectAfterLogin', window.location.href);
            
            // Mostra mensagem se houver
            if (message) {
                sessionStorage.setItem('loginMessage', message);
            }
            
            // Redireciona
            window.location.href = AUTH_CONFIG.loginPage;
        }
        
        /**
         * Limpa dados da sessão
         */
        clearSession() {
            localStorage.removeItem('authToken');
            localStorage.removeItem('tenantId');
            localStorage.removeItem('userId');
            localStorage.removeItem('userName');
            localStorage.removeItem('userRole');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('username');
            
            this.token = null;
            this.tenantId = null;
            this.user = null;
            this.isAuthenticated = false;
        }
        
        /**
         * Faz logout
         */
        async logout() {
            try {
                await fetch(`${AUTH_CONFIG.apiBase}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`,
                        'X-Tenant-ID': this.tenantId
                    },
                    body: JSON.stringify({ userId: this.user?.id })
                });
            } catch (error) {
                console.error('Erro ao fazer logout:', error);
            }
            
            this.redirectToLogin('Você saiu do sistema');
        }
        
        /**
         * Mostra tela de acesso negado
         */
        showAccessDenied() {
            document.body.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-family: 'Inter', sans-serif;">
                    <div style="background: white; padding: 60px; border-radius: 24px; text-align: center; max-width: 500px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                        <div style="width: 80px; height: 80px; background: #fee2e2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
                            <i class="fas fa-lock" style="font-size: 36px; color: #ef4444;"></i>
                        </div>
                        <h1 style="font-size: 28px; font-weight: 700; color: #1e293b; margin-bottom: 12px;">Acesso Negado</h1>
                        <p style="color: #64748b; font-size: 16px; margin-bottom: 32px;">Você não tem permissão para acessar esta página.<br>Entre em contato com o administrador.</p>
                        <div style="display: flex; gap: 12px; justify-content: center;">
                            <button onclick="window.history.back()" style="padding: 14px 28px; background: #f1f5f9; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; color: #475569;">
                                <i class="fas fa-arrow-left" style="margin-right: 8px;"></i>Voltar
                            </button>
                            <button onclick="window.location.href='/dashboard.html'" style="padding: 14px 28px; background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">
                                <i class="fas fa-home" style="margin-right: 8px;"></i>Ir para Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        /**
         * Inicia verificação periódica da sessão
         */
        startPeriodicCheck() {
            if (this.checkIntervalId) {
                clearInterval(this.checkIntervalId);
            }
            
            this.checkIntervalId = setInterval(async () => {
                const isValid = await this.validateToken();
                if (!isValid) {
                    this.redirectToLogin('Sua sessão expirou');
                }
            }, AUTH_CONFIG.checkInterval);
        }
        
        /**
         * Configura axios interceptor para enviar token em todas as requisições
         */
        setupAxiosInterceptor() {
            const self = this;
            
            // Função que configura o interceptor
            const configureAxios = () => {
                if (typeof axios !== 'undefined' && !axios._authInterceptorConfigured) {
                    axios.interceptors.request.use(function (config) {
                        const token = self.token || localStorage.getItem('authToken');
                        if (token) {
                            config.headers = config.headers || {};
                            config.headers.Authorization = `Bearer ${token}`;
                        }
                        return config;
                    }, function (error) {
                        return Promise.reject(error);
                    });
                    axios._authInterceptorConfigured = true;
                    console.log('✅ [AuthGuard] Axios interceptor configurado');
                }
            };
            
            // Tenta configurar imediatamente
            configureAxios();
            
            // Se axios ainda não está disponível, espera o DOM carregar
            if (typeof axios === 'undefined') {
                window.addEventListener('load', configureAxios);
                // Também tenta depois de um curto delay
                setTimeout(configureAxios, 100);
                setTimeout(configureAxios, 500);
            }
        }
        
        /**
         * Configura handler global de logout
         */
        setupLogoutHandler() {
            // Expõe função de logout globalmente
            window.authLogout = () => this.logout();
            
            // Adiciona listener para botões de logout
            document.addEventListener('click', (e) => {
                try {
                    // Usa closest para capturar cliques em filhos (ícone <i>, span, etc.)
                    const logoutTrigger = (e.target && e.target.closest) ? e.target.closest('[data-logout], .btn-logout, #logoutBtn') : null;
                    console.debug('[AuthGuard] Click detected:', e.target, 'logoutTrigger=', logoutTrigger);
                    if (logoutTrigger) {
                        e.preventDefault();
                        console.debug('[AuthGuard] Triggering logout...');
                        this.logout();
                    }
                } catch (err) {
                    console.error('[AuthGuard] Error in logout handler:', err);
                }
            });
        }
        
        /**
         * Atualiza UI com informações do usuário
         */
        updateUI() {
            // Injeta header de usuário se não existir
            this.injectUserHeader();
            
            // Atualiza nome do usuário onde houver
            document.querySelectorAll('.user-name, #userName, .userName').forEach(el => {
                el.textContent = this.user?.name || 'Usuário';
            });
            
            // Atualiza role do usuário
            document.querySelectorAll('.user-role, #userRole, .userRole').forEach(el => {
                el.textContent = this.getRoleLabel(this.user?.role);
            });
            
            // Oculta elementos restritos baseado em role
            this.applyRoleRestrictions();
        }
        
        /**
         * Injeta header com nome do usuário e botão sair em todas as páginas
         */
        injectUserHeader() {
            // Não injetar na página de login
            if (window.location.pathname.includes('login.html')) return;
            
            // Procura container de header existente
            let headerInfo = document.querySelector('.header-info');
            const mainHeader = document.querySelector('.main-header') || document.querySelector('.header-super') || document.querySelector('.page-header');
            
            // Se já existe header-info com botão logout, apenas atualizar
            if (headerInfo && headerInfo.querySelector('.btn-logout, [data-logout]')) {
                return;
            }
            
            // Se a página já tem estrutura própria de logout (super-admin, etc)
            if (document.querySelector('.btn-logout, [data-logout], button[onclick*="logout"]')) {
                return;
            }
            
            // Se existe main-header mas não header-info, criar
            if (mainHeader && !headerInfo) {
                headerInfo = document.createElement('div');
                headerInfo.className = 'header-info';
                headerInfo.style.cssText = 'display:flex;align-items:center;gap:16px;margin-left:auto;';
                mainHeader.appendChild(headerInfo);
            }
            
            // Se encontrou/criou header-info, adicionar elementos
            if (headerInfo) {
                // Verificar se já tem elementos de usuário
                if (!headerInfo.querySelector('#userName') && !headerInfo.querySelector('.user-name')) {
                    const userSpan = document.createElement('span');
                    userSpan.innerHTML = '<i class="fa fa-user-circle mr-2"></i><span id="userName" class="user-name">' + (this.user?.name || 'Usuário') + '</span>';
                    userSpan.style.cssText = 'display:flex;align-items:center;font-weight:600;color:#374151;';
                    headerInfo.insertBefore(userSpan, headerInfo.firstChild);
                }
                
                // Verificar se já tem botão logout
                if (!headerInfo.querySelector('.btn-logout') && !headerInfo.querySelector('[data-logout]')) {
                    const logoutBtn = document.createElement('button');
                    logoutBtn.className = 'btn-logout';
                    logoutBtn.setAttribute('data-logout', 'true');
                    logoutBtn.innerHTML = '<i class="fa fa-sign-out-alt"></i> Sair';
                    logoutBtn.style.cssText = 'background:#dc3545;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;margin-left:8px;';
                    headerInfo.appendChild(logoutBtn);
                }
            }
        }
        
        /**
         * Aplica restrições visuais baseado em role
         */
        applyRoleRestrictions() {
            // Elementos com atributo data-role serão mostrados/ocultados
            document.querySelectorAll('[data-role]').forEach(el => {
                const requiredRoles = el.dataset.role.split(',').map(r => r.trim());
                const hasAccess = requiredRoles.includes(this.user?.role);
                el.style.display = hasAccess ? '' : 'none';
            });
            
            // Elementos com data-min-role (hierarquia)
            document.querySelectorAll('[data-min-role]').forEach(el => {
                const minRole = el.dataset.minRole;
                const hasAccess = this.hasRole(minRole);
                el.style.display = hasAccess ? '' : 'none';
            });
            
            // Oculta menu de super admin se não for super admin
            if (!this.isSuperAdmin()) {
                document.querySelectorAll('.superadmin-only, [data-superadmin]').forEach(el => {
                    el.style.display = 'none';
                });
            }
            
            // Oculta menu de admin se não for admin
            if (!this.isAdmin()) {
                document.querySelectorAll('.admin-only, [data-admin]').forEach(el => {
                    el.style.display = 'none';
                });
            }
        }
        
        /**
         * Retorna label amigável para role
         */
        getRoleLabel(role) {
            const labels = {
                'superadmin': 'Super Administrador',
                'admin': 'Administrador',
                'gerente': 'Gerente',
                'caixa': 'Operador de Caixa',
                'user': 'Usuário'
            };
            return labels[role] || 'Usuário';
        }
        
        /**
         * Retorna headers padrão para requisições autenticadas
         */
        getAuthHeaders() {
            return {
                'Authorization': `Bearer ${this.token}`,
                'X-Tenant-ID': this.tenantId,
                'Content-Type': 'application/json'
            };
        }
        
        /**
         * Faz requisição autenticada
         */
        async fetch(url, options = {}) {
            const headers = {
                ...this.getAuthHeaders(),
                ...(options.headers || {})
            };
            
            const response = await fetch(url, { ...options, headers });
            
            // Se receber 401, redireciona para login
            if (response.status === 401) {
                this.redirectToLogin('Sessão expirada');
                return null;
            }
            
            return response;
        }
    }
    
    // =====================================================
    // INICIALIZAÇÃO AUTOMÁTICA
    // =====================================================
    
    // Cria instância global
    window.authGuard = new AuthGuard();
    
    // Executa verificação quando DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.authGuard.init();
        });
    } else {
        window.authGuard.init();
    }
    
    // Previne acesso via DevTools/console
    // (pode ser removido em desenvolvimento)
    /*
    setInterval(() => {
        if (window.outerWidth - window.innerWidth > 160 ||
            window.outerHeight - window.innerHeight > 160) {
            // DevTools pode estar aberto
        }
    }, 1000);
    */
    
})();
