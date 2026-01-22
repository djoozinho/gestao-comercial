/**
 * Gerenciamento de Empresas
 * Sistema Ibraim e Daniel
 */

// Configuração da API
const API_URL = '/api';

// Variável global para empresas
let empresas = [];

// ==========================================
// INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🏢 Módulo de Empresas inicializado');
    initPage();
    setupEventListeners();
    setupMasks();
});

async function initPage() {
    const isApiOnline = await checkAPI();
    if (isApiOnline) {
        loadEmpresas();
    }
}

function setupEventListeners() {
    // Atalhos de teclado
    document.addEventListener('keydown', function(e) {
        if (e.key === 'F2') {
            e.preventDefault();
            openEmpresaModal();
        }
        if (e.key === 'F5') {
            e.preventDefault();
            loadEmpresas();
        }
        if (e.key === 'Escape') {
            const modal = document.getElementById('empresaModal');
            if ($(modal).hasClass('show')) {
                $(modal).modal('hide');
            } else {
                location.href = 'admin.html';
            }
        }
    });

    // Submit do form com Enter
    document.getElementById('empresaForm').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEmpresa();
        }
    });
}

function setupMasks() {
    // Máscara CNPJ
    const cnpjInput = document.getElementById('cnpj');
    if (cnpjInput) {
        cnpjInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length <= 14) {
                value = value.replace(/^(\d{2})(\d)/, '$1.$2');
                value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
                value = value.replace(/\.(\d{3})(\d)/, '.$1/$2');
                value = value.replace(/(\d{4})(\d)/, '$1-$2');
            }
            e.target.value = value;
        });
    }

    // Máscara CEP
    const cepInput = document.getElementById('cep');
    if (cepInput) {
        cepInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length <= 8) {
                value = value.replace(/^(\d{5})(\d)/, '$1-$2');
            }
            e.target.value = value;
        });

        // Buscar endereço pelo CEP
        cepInput.addEventListener('blur', async function(e) {
            const cep = e.target.value.replace(/\D/g, '');
            if (cep.length === 8) {
                await buscarCEP(cep);
            }
        });
    }

    // Máscara Telefone
    const telefoneInput = document.getElementById('telefone');
    if (telefoneInput) {
        telefoneInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length <= 11) {
                if (value.length > 10) {
                    value = value.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
                } else {
                    value = value.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
                }
            }
            e.target.value = value;
        });
    }
}

// ==========================================
// API CHECK (usando fetch para /api/empresas)
// ==========================================
async function checkAPI() {
    try {
        const response = await fetch('/api/empresas', { method: 'GET', cache: 'no-store' });
        if (!response.ok) throw new Error('Status ' + response.status);
        console.log('✅ API está online');
        return true;
    } catch (error) {
        console.warn('⚠️ API não está acessível');
        showAPIError();
        return false;
    }
}  

function showAPIError() {
    const empresasList = document.getElementById('empresasList');
    if (empresasList) {
        empresasList.innerHTML = `
            <div class="alert alert-warning">
                <h5><i class="fa fa-exclamation-triangle mr-2"></i> Servidor não encontrado</h5>
                <p>O servidor backend não está respondendo. Para usar esta funcionalidade:</p>
                <ol>
                    <li>Abra um terminal na pasta do projeto</li>
                    <li>Execute o comando: <code>npm run dev</code></li>
                    <li>Aguarde a mensagem "Servidor rodando na porta 3000"</li>
                    <li>Atualize esta página (F5)</li>
                </ol>
                <button class="btn btn-sm btn-warning" onclick="tryReconnect()">
                    <i class="fa fa-redo"></i> Tentar novamente
                </button>
                <button id="autoRetryInfo" class="btn btn-sm btn-outline-secondary ml-2" style="display:none;" disabled>
                    Tentando reconectar...
                </button>
            </div>
        `;
    }
    const totalEl = document.getElementById('totalEmpresas');
    const ativasEl = document.getElementById('empresasAtivas');
    if (totalEl) totalEl.textContent = '-';
    if (ativasEl) ativasEl.textContent = '-';
}

// Tentativa automática de reconexão com backoff exponencial
let _reconnectInProgress = false;
async function tryReconnect(maxAttempts = 3) {
    if (_reconnectInProgress) return;
    _reconnectInProgress = true;
    const info = document.getElementById('autoRetryInfo');
    if (info) { info.style.display = 'inline-block'; info.textContent = 'Tentando reconectar...'; }

    for (let i = 0; i < maxAttempts; i++) {
        if (info) info.textContent = `Tentando... (${i+1}/${maxAttempts})`;
        try {
            const ok = await checkAPI();
            if (ok) {
                if (info) { info.textContent = 'Reconectado'; setTimeout(() => { info.style.display = 'none'; }, 800); }
                _reconnectInProgress = false;
                await loadEmpresas();
                return true;
            }
        } catch (e) {
            // ignore
        }
        // backoff: 1s, 2s, 4s...
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }

    if (info) { info.textContent = 'Falha ao reconectar'; setTimeout(() => { info.style.display = 'none'; }, 2000); }
    _reconnectInProgress = false;
    return false;
} 

// ==========================================
// BUSCAR CEP
// ==========================================
async function buscarCEP(cep) {
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (!res.ok) throw new Error('CEP service error: ' + res.status);
        const data = await res.json();
        if (!data.erro) {
            const enderecoEl = document.getElementById('endereco');
            const bairroEl = document.getElementById('bairro');
            const cidadeEl = document.getElementById('cidade');
            const ufEl = document.getElementById('uf');
            if (enderecoEl) enderecoEl.value = data.logradouro || '';
            if (bairroEl) bairroEl.value = data.bairro || '';
            if (cidadeEl) cidadeEl.value = data.localidade || '';
            if (ufEl) ufEl.value = data.uf || '';
        }
    } catch (error) {
        console.warn('Erro ao buscar CEP:', error);
    }
}

// ==========================================
// CRUD OPERATIONS
// ==========================================

// Carregar empresas
async function loadEmpresas() {
    const empresasList = document.getElementById('empresasList');
    
    try {
        empresasList.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-3 text-muted">Carregando empresas...</p>
            </div>
        `;

        const res = await fetch(`${API_URL}/empresas`);
        if (!res.ok) throw new Error('Status ' + res.status);
        const response = await res.json();
        empresas = response.data || response || [];
        
        updateStats();
        renderEmpresas();
        
    } catch (error) {
        console.error('Erro ao carregar empresas:', error);
        
        if (error.code === 'ERR_NETWORK') {
            showAPIError();
        } else {
            empresasList.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fa fa-exclamation-circle mr-2"></i>
                    Erro ao carregar empresas: ${error.message}
                    <button class="btn btn-sm btn-danger ml-3" onclick="loadEmpresas()">
                        <i class="fa fa-redo"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }
}

// Atualizar estatísticas
function updateStats() {
    document.getElementById('totalEmpresas').textContent = empresas.length;
    const ativas = empresas.filter(e => e.status == 1 || e.status === true).length;
    document.getElementById('empresasAtivas').textContent = ativas;
}

// Renderizar lista de empresas
function renderEmpresas() {
    const empresasList = document.getElementById('empresasList');
    
    if (empresas.length === 0) {
        empresasList.innerHTML = `
            <div class="empty-state">
                <i class="fa fa-building"></i>
                <h5>Nenhuma empresa cadastrada</h5>
                <p>Clique em "Nova Empresa" para adicionar a primeira.</p>
                <button class="btn btn-primary" onclick="openEmpresaModal()">
                    <i class="fa fa-plus"></i> Nova Empresa
                </button>
            </div>
        `;
        return;
    }

    let html = '';
    empresas.forEach(empresa => {
        const statusClass = empresa.status == 1 ? 'badge-ativo' : 'badge-inativo';
        const statusText = empresa.status == 1 ? 'Ativa' : 'Inativa';
        
        html += `
            <div class="empresa-card">
                <div class="empresa-header">
                    <div class="empresa-info">
                        <h5>${empresa.nome_fantasia || empresa.razao_social}</h5>
                        <span class="empresa-cnpj">
                            <i class="fa fa-id-card mr-1"></i> 
                            ${empresa.cnpj || 'CNPJ não informado'}
                        </span>
                    </div>
                    <div>
                        <span class="${statusClass}">${statusText}</span>
                    </div>
                </div>
                
                <div class="empresa-details">
                    <div class="detail-item">
                        <span class="detail-label">Razão Social:</span><br>
                        <span class="detail-value">${empresa.razao_social || '-'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Cidade/UF:</span><br>
                        <span class="detail-value">${empresa.cidade || '-'}${empresa.uf ? '/' + empresa.uf : ''}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Telefone:</span><br>
                        <span class="detail-value">${empresa.telefone || '-'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">E-mail:</span><br>
                        <span class="detail-value">${empresa.email || '-'}</span>
                    </div>
                </div>
                
                <div class="mt-3 text-right">
                    <button class="btn btn-sm btn-outline-primary" onclick="editEmpresa('${empresa.id}')">
                        <i class="fa fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteEmpresa('${empresa.id}', '${(empresa.nome_fantasia || empresa.razao_social || '').replace(/'/g, "\\'")}')">
                        <i class="fa fa-trash"></i> Excluir
                    </button>
                </div>
            </div>
        `;
    });

    empresasList.innerHTML = html;
}

// Abrir modal para nova empresa
function openEmpresaModal() {
    document.getElementById('modalTitle').textContent = 'Nova Empresa';
    document.getElementById('empresaForm').reset();
    document.getElementById('empresaId').value = '';
    document.getElementById('status').value = '1';
    $('#empresaModal').modal('show');
    
    setTimeout(() => {
        document.getElementById('razao_social').focus();
    }, 500);
}

// Editar empresa
async function editEmpresa(id) {
    try {
        const res = await fetch(`${API_URL}/empresas/${id}`);
        if (!res.ok) throw new Error('Status ' + res.status);
        const response = await res.json();
        const empresa = response.data || response;
        
        document.getElementById('modalTitle').textContent = 'Editar Empresa';
        document.getElementById('empresaId').value = empresa.id;
        document.getElementById('razao_social').value = empresa.razao_social || '';
        document.getElementById('nome_fantasia').value = empresa.nome_fantasia || '';
        document.getElementById('cnpj').value = empresa.cnpj || '';
        document.getElementById('inscricao_estadual').value = empresa.inscricao_estadual || '';
        document.getElementById('inscricao_municipal').value = empresa.inscricao_municipal || '';
        document.getElementById('endereco').value = empresa.endereco || '';
        document.getElementById('numero').value = empresa.numero || '';
        document.getElementById('bairro').value = empresa.bairro || '';
        document.getElementById('cidade').value = empresa.cidade || '';
        document.getElementById('uf').value = empresa.uf || '';
        document.getElementById('cep').value = empresa.cep || '';
        document.getElementById('telefone').value = empresa.telefone || '';
        document.getElementById('email').value = empresa.email || '';
        document.getElementById('status').value = empresa.status ? '1' : '0';
        
        $('#empresaModal').modal('show');
        
    } catch (error) {
        console.error('Erro ao carregar empresa:', error);
        alert('Erro ao carregar dados da empresa');
    }
}

// Salvar empresa
async function saveEmpresa() {
    const id = document.getElementById('empresaId').value;
    const razaoSocial = document.getElementById('razao_social').value.trim();
    const nomeFantasia = document.getElementById('nome_fantasia').value.trim();
    
    // Validação
    if (!razaoSocial) {
        alert('Informe a Razão Social');
        document.getElementById('razao_social').focus();
        return;
    }
    
    if (!nomeFantasia) {
        alert('Informe o Nome Fantasia');
        document.getElementById('nome_fantasia').focus();
        return;
    }

    const dados = {
        razao_social: razaoSocial,
        nome_fantasia: nomeFantasia,
        cnpj: document.getElementById('cnpj').value.trim(),
        inscricao_estadual: document.getElementById('inscricao_estadual').value.trim(),
        inscricao_municipal: document.getElementById('inscricao_municipal').value.trim(),
        endereco: document.getElementById('endereco').value.trim(),
        numero: document.getElementById('numero').value.trim(),
        bairro: document.getElementById('bairro').value.trim(),
        cidade: document.getElementById('cidade').value.trim(),
        uf: document.getElementById('uf').value,
        cep: document.getElementById('cep').value.trim(),
        telefone: document.getElementById('telefone').value.trim(),
        email: document.getElementById('email').value.trim(),
        status: document.getElementById('status').value === '1'
    };

    try {
        if (id) {
            const res = await fetch(`${API_URL}/empresas/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            if (!res.ok) throw new Error('Status ' + res.status);
            showNotification('Empresa atualizada com sucesso!', 'success');
        } else {
            const res = await fetch(`${API_URL}/empresas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            if (!res.ok) throw new Error('Status ' + res.status);
            showNotification('Empresa cadastrada com sucesso!', 'success');
        }
        
        $('#empresaModal').modal('hide');
        loadEmpresas();
        
    } catch (error) {
        console.error('Erro ao salvar empresa:', error);
        const msg = error.response?.data?.message || error.message;
        showNotification('Erro ao salvar: ' + msg, 'error');
    }
}

// Excluir empresa
async function deleteEmpresa(id, nome) {
    if (!confirm(`Deseja realmente excluir a empresa "${nome}"?`)) {
        return;
    }

    try {
        const res = await fetch(`${API_URL}/empresas/${id}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 204) throw new Error('Status ' + res.status);
        showNotification('Empresa excluída com sucesso!', 'success');
        loadEmpresas();
    } catch (error) {
        console.error('Erro ao excluir empresa:', error);
        const msg = error.response?.data?.message || error.message;
        showNotification('Erro ao excluir: ' + msg, 'error');
    }
}

// Expor funções globalmente para chamadas inline (onclick)
window.editEmpresa = editEmpresa;
window.deleteEmpresa = deleteEmpresa;

// ==========================================
// NOTIFICAÇÕES
// ==========================================
function showNotification(message, type = 'info') {
    // Remove notificação anterior
    const existingNotif = document.querySelector('.notification-toast');
    if (existingNotif) {
        existingNotif.remove();
    }

    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    const notification = document.createElement('div');
    notification.className = 'notification-toast';
    notification.innerHTML = `
        <i class="fa ${icons[type]}"></i>
        <span>${message}</span>
    `;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type]};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 12px;
        animation: slideIn 0.3s ease;
    `;

    // Adicionar animação
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Remover após 4 segundos
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}