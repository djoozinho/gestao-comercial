// Arquivo frontend/js/relatorios.js

// Função para formatar valores monetários
const formatCurrency = (value) => {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// 1. Carregar Resumo Financeiro
async function loadFinancialSummary() {
  try {
    const response = await axios.get('/api/transactions');
    const transactions = response.data.data;

    const totalReceitas = transactions
      .filter(t => t.status === 'pago' && t.category !== 'Pagamento')
      .reduce((sum, t) => sum + t.value, 0);

    const totalDespesas = transactions
      .filter(t => t.status === 'pago' && t.category === 'Pagamento')
      .reduce((sum, t) => sum + t.value, 0);

    const saldo = totalReceitas - totalDespesas;

    document.getElementById('total-receitas').textContent = formatCurrency(totalReceitas);
    document.getElementById('total-despesas').textContent = formatCurrency(totalDespesas);
    document.getElementById('saldo-liquido').textContent = formatCurrency(saldo);

  } catch (error) {
    console.error('Erro ao carregar resumo financeiro:', error);
    document.getElementById('financial-summary-card').innerHTML = '<p class="text-danger">Não foi possível carregar o resumo financeiro.</p>';
  }
}

// 2. Carregar Gráfico de Vendas por Período
async function loadSalesChart() {
  try {
    const response = await axios.get('/api/reports/sales-summary');
    const salesData = response.data;

    const ctx = document.getElementById('vendas-periodo-chart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: salesData.map(d => d.date),
        datasets: [{
          label: 'Total de Vendas',
          data: salesData.map(d => d.total),
          backgroundColor: 'rgba(37, 99, 235, 0.8)',
          borderColor: 'rgba(37, 99, 235, 1)',
          borderWidth: 1,
          borderRadius: 5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return formatCurrency(value);
              }
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `Vendas: ${formatCurrency(context.raw)}`;
              }
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Erro ao carregar gráfico de vendas:', error);
    document.getElementById('sales-chart-container').innerHTML = '<p class="text-danger">Não foi possível carregar o gráfico de vendas.</p>';
  }
}


// 3. Carregar Contas a Pagar e Receber
async function loadPayableReceivable() {
  try {
    const response = await axios.get('/api/transactions?status=pendente');
    const pending = response.data.data;

    const aPagar = pending.filter(t => t.category === 'Pagamento');
    const aReceber = pending.filter(t => t.category !== 'Pagamento');

    const pagarBody = document.getElementById('contas-pagar-body');
    pagarBody.innerHTML = '';
    if (aPagar.length > 0) {
      aPagar.forEach(t => {
        const row = `<tr>
          <td>${t.description}</td>
          <td>${DateTimeUtils.formatDate(t.dueDate)}</td>
          <td>${formatCurrency(t.value)}</td>
        </tr>`;
        pagarBody.innerHTML += row;
      });
    } else {
      pagarBody.innerHTML = '<tr><td colspan="3" class="text-center">Nenhuma conta a pagar.</td></tr>';
    }

    const receberBody = document.getElementById('contas-receber-body');
    receberBody.innerHTML = '';
    if (aReceber.length > 0) {
      aReceber.forEach(t => {
        const row = `<tr>
          <td>${t.description}</td>
          <td>${DateTimeUtils.formatDate(t.dueDate)}</td>
          <td>${formatCurrency(t.value)}</td>
        </tr>`;
        receberBody.innerHTML += row;
      });
    } else {
      receberBody.innerHTML = '<tr><td colspan="3" class="text-center">Nenhuma conta a receber.</td></tr>';
    }

  } catch (error) {
    console.error('Erro ao carregar contas a pagar/receber:', error);
    document.getElementById('contas-pagar-body').innerHTML = '<tr><td colspan="3" class="text-danger">Erro ao carregar.</td></tr>';
    document.getElementById('contas-receber-body').innerHTML = '<tr><td colspan="3" class="text-danger">Erro ao carregar.</td></tr>';
  }
}


// 4. Carregar Produtos Mais Vendidos (Simulação com dados de produtos)
async function loadTopSellingProducts() {
  try {
    // Este é um placeholder. O ideal seria um endpoint específico.
    // Por enquanto, vamos listar os produtos com mais estoque como "mais populares".
    const response = await axios.get('/api/products?pageSize=5');
    const products = response.data.data.sort((a, b) => b.stock - a.stock); // Simulação

    const list = document.getElementById('produtos-mais-vendidos-list');
    list.innerHTML = '';
    if (products.length > 0) {
      products.forEach(p => {
        const item = `<li class="list-group-item d-flex justify-content-between align-items-center">
          ${p.name}
          <span class="badge badge-primary badge-pill">${p.stock}</span>
        </li>`;
        list.innerHTML += item;
      });
    } else {
      list.innerHTML = '<li class="list-group-item">Nenhum produto encontrado.</li>';
    }
  } catch (error) {
    console.error('Erro ao carregar produtos mais vendidos:', error);
    document.getElementById('produtos-mais-vendidos-list').innerHTML = '<li class="list-group-item text-danger">Erro ao carregar produtos.</li>';
  }
}

// 5. Carregar Níveis de Estoque
async function loadStockLevels() {
  try {
    const response = await axios.get('/api/products?pageSize=1000');
    const products = response.data.data;

    const lowStockProducts = products.filter(p => p.stock < p.minStock);

    const tableBody = document.getElementById('niveis-estoque-body');
    tableBody.innerHTML = '';
    if (lowStockProducts.length > 0) {
      lowStockProducts.forEach(p => {
        const row = `<tr>
          <td>${p.name}</td>
          <td>${p.stock}</td>
          <td>${p.minStock}</td>
          <td><span class="badge badge-warning">Baixo</span></td>
        </tr>`;
        tableBody.innerHTML += row;
      });
    } else {
      tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Todos os produtos com estoque em dia.</td></tr>';
    }
  } catch (error) {
    console.error('Erro ao carregar níveis de estoque:', error);
    document.getElementById('niveis-estoque-body').innerHTML = '<tr><td colspan="4" class="text-danger">Erro ao carregar dados de estoque.</td></tr>';
  }
}


// Inicializa todos os carregadores de dados quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  loadFinancialSummary();
  loadSalesChart();
  loadPayableReceivable();
  loadTopSellingProducts();
  loadStockLevels();
});
