/**
 * Sistema de Caixa Individual por Funcionário
 * 
 * Cada funcionário tem seu próprio caixa diário:
 * - Abertura de caixa com valor inicial
 * - Registro de todas as movimentações (vendas, sangrias, suprimentos)
 * - Fechamento de caixa com conferência
 * - Histórico completo de caixas anteriores
 */

class CaixaFuncionario {
    constructor() {
        this.caixaAtual = null;
        this.movimentos = [];
        this.API_BASE = '/api';
    }
    
    /**
     * Inicializa o sistema de caixa
     */
    async init() {
        await this.verificarCaixaAberto();
        return this;
    }
    
    /**
     * Verifica se o funcionário tem caixa aberto
     */
    async verificarCaixaAberto() {
        try {
            const response = await window.authGuard.fetch(`${this.API_BASE}/caixa/meu-caixa`);
            const data = await response.json();
            
            if (data.success && data.caixa) {
                this.caixaAtual = data.caixa;
                this.movimentos = data.movimentos || [];
                return true;
            }
            
            this.caixaAtual = null;
            this.movimentos = [];
            return false;
        } catch (error) {
            console.error('Erro ao verificar caixa:', error);
            return false;
        }
    }
    
    /**
     * Abre um novo caixa
     */
    async abrirCaixa(valorInicial = 0) {
        try {
            const response = await window.authGuard.fetch(`${this.API_BASE}/caixa/abrir`, {
                method: 'POST',
                body: JSON.stringify({ valorInicial: parseFloat(valorInicial) || 0 })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.caixaAtual = {
                    id: data.caixaId,
                    data_abertura: data.dataAbertura,
                    hora_abertura: data.horaAbertura,
                    valor_inicial: data.valorInicial,
                    status: 'aberto'
                };
                this.movimentos = [];
                return { success: true, caixa: this.caixaAtual };
            }
            
            return { success: false, error: data.error };
        } catch (error) {
            console.error('Erro ao abrir caixa:', error);
            return { success: false, error: 'Erro ao abrir caixa' };
        }
    }
    
    /**
     * Fecha o caixa atual
     */
    async fecharCaixa(valorFinal, observacoes = '') {
        if (!this.caixaAtual) {
            return { success: false, error: 'Nenhum caixa aberto' };
        }
        
        try {
            const response = await window.authGuard.fetch(`${this.API_BASE}/caixa/fechar`, {
                method: 'POST',
                body: JSON.stringify({
                    caixaId: this.caixaAtual.id,
                    valorFinal: parseFloat(valorFinal),
                    observacoes
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.caixaAtual = null;
                this.movimentos = [];
                return { success: true };
            }
            
            return { success: false, error: data.error };
        } catch (error) {
            console.error('Erro ao fechar caixa:', error);
            return { success: false, error: 'Erro ao fechar caixa' };
        }
    }
    
    /**
     * Registra uma movimentação no caixa
     */
    async registrarMovimento(tipo, valor, formaPagamento = null, descricao = null, vendaId = null) {
        if (!this.caixaAtual) {
            return { success: false, error: 'Nenhum caixa aberto' };
        }
        
        try {
            const response = await window.authGuard.fetch(`${this.API_BASE}/caixa/movimento`, {
                method: 'POST',
                body: JSON.stringify({
                    caixaId: this.caixaAtual.id,
                    tipo,
                    valor: parseFloat(valor),
                    formaPagamento,
                    descricao,
                    vendaId
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Adicionar movimento localmente
                this.movimentos.unshift({
                    id: data.movimentoId,
                    tipo,
                    valor,
                    forma_pagamento: formaPagamento,
                    descricao,
                    created_at: new Date().toISOString()
                });
                return { success: true, movimentoId: data.movimentoId };
            }
            
            return { success: false, error: data.error };
        } catch (error) {
            console.error('Erro ao registrar movimento:', error);
            return { success: false, error: 'Erro ao registrar movimento' };
        }
    }
    
    /**
     * Registra uma venda no caixa
     */
    async registrarVenda(valor, formaPagamento, vendaId = null) {
        return this.registrarMovimento('venda', valor, formaPagamento, 'Venda', vendaId);
    }
    
    /**
     * Registra uma sangria (retirada de dinheiro)
     */
    async registrarSangria(valor, motivo = 'Sangria de caixa') {
        return this.registrarMovimento('sangria', valor, 'dinheiro', motivo);
    }
    
    /**
     * Registra um suprimento (entrada de dinheiro)
     */
    async registrarSuprimento(valor, motivo = 'Suprimento de caixa') {
        return this.registrarMovimento('suprimento', valor, 'dinheiro', motivo);
    }
    
    /**
     * Obtém o relatório do caixa atual
     */
    async getRelatorio() {
        if (!this.caixaAtual) {
            return { success: false, error: 'Nenhum caixa aberto' };
        }
        
        try {
            const response = await window.authGuard.fetch(`${this.API_BASE}/caixa/${this.caixaAtual.id}/relatorio`);
            return await response.json();
        } catch (error) {
            console.error('Erro ao buscar relatório:', error);
            return { success: false, error: 'Erro ao buscar relatório' };
        }
    }
    
    /**
     * Calcula o saldo atual do caixa
     */
    calcularSaldoAtual() {
        if (!this.caixaAtual) return 0;
        
        let saldo = parseFloat(this.caixaAtual.valor_inicial) || 0;
        
        for (const mov of this.movimentos) {
            const valor = parseFloat(mov.valor) || 0;
            
            switch (mov.tipo) {
                case 'venda':
                case 'entrada':
                case 'suprimento':
                    saldo += valor;
                    break;
                case 'sangria':
                case 'saida':
                    saldo -= valor;
                    break;
            }
        }
        
        return saldo;
    }
    
    /**
     * Calcula totais por forma de pagamento
     */
    calcularTotaisPorFormaPagamento() {
        const totais = {
            dinheiro: 0,
            credito: 0,
            debito: 0,
            pix: 0,
            outros: 0
        };
        
        for (const mov of this.movimentos) {
            if (mov.tipo === 'venda' || mov.tipo === 'entrada') {
                const valor = parseFloat(mov.valor) || 0;
                const forma = (mov.forma_pagamento || 'outros').toLowerCase();
                
                if (totais.hasOwnProperty(forma)) {
                    totais[forma] += valor;
                } else {
                    totais.outros += valor;
                }
            }
        }
        
        return totais;
    }
    
    /**
     * Lista histórico de caixas anteriores
     */
    async listarHistorico(limit = 30) {
        try {
            const response = await window.authGuard.fetch(`${this.API_BASE}/caixa/historico?limit=${limit}`);
            return await response.json();
        } catch (error) {
            console.error('Erro ao buscar histórico:', error);
            return { success: false, error: 'Erro ao buscar histórico' };
        }
    }
    
    /**
     * Verifica se pode realizar operação
     */
    podeFazerOperacao() {
        return this.caixaAtual && this.caixaAtual.status === 'aberto';
    }
    
    /**
     * Retorna informações do caixa atual
     */
    getInfoCaixa() {
        if (!this.caixaAtual) {
            return null;
        }
        
        return {
            id: this.caixaAtual.id,
            dataAbertura: this.caixaAtual.data_abertura,
            horaAbertura: this.caixaAtual.hora_abertura,
            valorInicial: parseFloat(this.caixaAtual.valor_inicial) || 0,
            status: this.caixaAtual.status,
            saldoAtual: this.calcularSaldoAtual(),
            totalMovimentos: this.movimentos.length,
            totaisPorForma: this.calcularTotaisPorFormaPagamento()
        };
    }
}

// Criar instância global
window.caixaFuncionario = new CaixaFuncionario();

// Componente de UI para gerenciar caixa
class CaixaUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.caixa = window.caixaFuncionario;
    }
    
    async init() {
        await this.caixa.init();
        this.render();
    }
    
    render() {
        if (!this.container) return;
        
        const info = this.caixa.getInfoCaixa();
        
        if (!info) {
            this.renderCaixaFechado();
        } else {
            this.renderCaixaAberto(info);
        }
    }
    
    renderCaixaFechado() {
        this.container.innerHTML = `
            <div class="caixa-fechado text-center p-4">
                <div class="mb-3">
                    <i class="fas fa-cash-register fa-3x text-muted"></i>
                </div>
                <h5>Caixa Fechado</h5>
                <p class="text-muted">Você precisa abrir o caixa para começar a trabalhar</p>
                <button class="btn btn-primary" onclick="caixaUI.abrirCaixaModal()">
                    <i class="fas fa-door-open mr-2"></i>Abrir Caixa
                </button>
            </div>
        `;
    }
    
    renderCaixaAberto(info) {
        this.container.innerHTML = `
            <div class="caixa-aberto">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <span class="badge badge-success"><i class="fas fa-check-circle mr-1"></i>Caixa Aberto</span>
                        <small class="text-muted ml-2">Abertura: ${info.horaAbertura}</small>
                    </div>
                    <button class="btn btn-sm btn-outline-danger" onclick="caixaUI.fecharCaixaModal()">
                        <i class="fas fa-door-closed mr-1"></i>Fechar Caixa
                    </button>
                </div>
                <div class="row">
                    <div class="col-md-4">
                        <div class="caixa-stat">
                            <small class="text-muted">Valor Inicial</small>
                            <div class="h5 mb-0 text-primary">R$ ${info.valorInicial.toFixed(2)}</div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="caixa-stat">
                            <small class="text-muted">Saldo Atual</small>
                            <div class="h5 mb-0 text-success">R$ ${info.saldoAtual.toFixed(2)}</div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="caixa-stat">
                            <small class="text-muted">Movimentações</small>
                            <div class="h5 mb-0">${info.totalMovimentos}</div>
                        </div>
                    </div>
                </div>
                <hr>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-outline-primary mr-2" onclick="caixaUI.sangria()">
                        <i class="fas fa-minus-circle mr-1"></i>Sangria
                    </button>
                    <button class="btn btn-sm btn-outline-success mr-2" onclick="caixaUI.suprimento()">
                        <i class="fas fa-plus-circle mr-1"></i>Suprimento
                    </button>
                    <button class="btn btn-sm btn-outline-info" onclick="caixaUI.verRelatorio()">
                        <i class="fas fa-chart-bar mr-1"></i>Relatório
                    </button>
                </div>
            </div>
        `;
    }
    
    abrirCaixaModal() {
        const valor = prompt('Informe o valor inicial do caixa:', '0.00');
        if (valor === null) return;
        
        this.caixa.abrirCaixa(valor).then(result => {
            if (result.success) {
                alert('Caixa aberto com sucesso!');
                this.render();
            } else {
                alert('Erro: ' + result.error);
            }
        });
    }
    
    fecharCaixaModal() {
        const info = this.caixa.getInfoCaixa();
        if (!info) return;
        
        const valorFinal = prompt(`Informe o valor em caixa:\n\nSaldo calculado: R$ ${info.saldoAtual.toFixed(2)}`, info.saldoAtual.toFixed(2));
        if (valorFinal === null) return;
        
        const obs = prompt('Observações (opcional):');
        
        this.caixa.fecharCaixa(valorFinal, obs || '').then(result => {
            if (result.success) {
                alert('Caixa fechado com sucesso!');
                this.render();
            } else {
                alert('Erro: ' + result.error);
            }
        });
    }
    
    sangria() {
        const valor = prompt('Valor da sangria:');
        if (!valor) return;
        
        const motivo = prompt('Motivo da sangria:', 'Sangria de caixa');
        
        this.caixa.registrarSangria(valor, motivo).then(result => {
            if (result.success) {
                alert('Sangria registrada!');
                this.render();
            } else {
                alert('Erro: ' + result.error);
            }
        });
    }
    
    suprimento() {
        const valor = prompt('Valor do suprimento:');
        if (!valor) return;
        
        const motivo = prompt('Motivo do suprimento:', 'Suprimento de caixa');
        
        this.caixa.registrarSuprimento(valor, motivo).then(result => {
            if (result.success) {
                alert('Suprimento registrado!');
                this.render();
            } else {
                alert('Erro: ' + result.error);
            }
        });
    }
    
    async verRelatorio() {
        const result = await this.caixa.getRelatorio();
        if (result.success) {
            const r = result.resumo;
            alert(`RELATÓRIO DO CAIXA
            
Valor Inicial: R$ ${r.valorInicial.toFixed(2)}
Total Entradas: R$ ${r.totalEntradas.toFixed(2)}
Total Saídas: R$ ${r.totalSaidas.toFixed(2)}
Saldo Final: R$ ${r.saldoFinal.toFixed(2)}
Total de Operações: ${r.totalOperacoes}`);
        }
    }
}

// Expor globalmente
window.CaixaUI = CaixaUI;
