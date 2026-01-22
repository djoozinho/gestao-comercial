/**
 * Teste completo do sistema de HAVER (pagamento parcial)
 * 
 * Cenário: Cria venda a prazo parcelada, depois dá haver em uma parcela
 * Verifica se o saldo restante fica correto
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

// Credenciais
const CREDENTIALS = {
  username: 'admin@lojaprincipal.local',
  password: 'admin123'
};

let token = null;

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function login() {
  console.log('🔐 Fazendo login...');
  const res = await request('POST', '/api/auth/login', CREDENTIALS);
  if (res.status === 200 && res.data.token) {
    token = res.data.token;
    console.log('✅ Login OK - Tenant:', res.data.user?.empresa || 'N/A');
    return true;
  } else {
    console.log('❌ Login falhou:', res.status, res.data);
    return false;
  }
}

async function criarVendaPrazo() {
  console.log('\n📝 Criando venda a prazo parcelada (2x de R$50 = R$100 total)...');
  
  // Criar transação parcela 1
  const tx1 = await request('POST', '/api/transactions', {
    category: 'vendas',
    description: 'Venda Teste Haver - Parcela 1/2',
    person: 'Cliente Teste Haver',
    value: 50,
    value_due: 50,
    paid: false,
    status: 'pendente',
    payment_method: 'prazo',
    due_date: new Date().toISOString().split('T')[0],
    notes: 'Parcela 1/2 - Teste de haver'
  });
  
  if (tx1.status !== 201) {
    console.log('❌ Erro ao criar parcela 1:', tx1.status, tx1.data);
    return null;
  }
  
  // Criar transação parcela 2
  const tx2 = await request('POST', '/api/transactions', {
    category: 'vendas',
    description: 'Venda Teste Haver - Parcela 2/2',
    person: 'Cliente Teste Haver',
    value: 50,
    value_due: 50,
    paid: false,
    status: 'pendente',
    payment_method: 'prazo',
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: 'Parcela 2/2 - Teste de haver'
  });
  
  if (tx2.status !== 201) {
    console.log('❌ Erro ao criar parcela 2:', tx2.status, tx2.data);
    return null;
  }
  
  console.log('✅ Parcelas criadas:');
  console.log(`   Parcela 1: ID=${tx1.data.id}, Valor=R$${tx1.data.value}, A receber=R$${tx1.data.valueDue || tx1.data.value_due}`);
  console.log(`   Parcela 2: ID=${tx2.data.id}, Valor=R$${tx2.data.value}, A receber=R$${tx2.data.valueDue || tx2.data.value_due}`);
  
  return { parcela1: tx1.data, parcela2: tx2.data };
}

async function darHaver(transactionId, valorHaver) {
  console.log(`\n💰 Dando HAVER de R$${valorHaver} na transação ${transactionId}...`);
  
  const res = await request('POST', `/api/transactions/${transactionId}/receive`, {
    amount: valorHaver,
    method: 'dinheiro',
    notes: `Haver de R$${valorHaver}`
  });
  
  if (res.status === 201) {
    console.log('✅ Haver registrado!');
    return res.data;
  } else {
    console.log('❌ Erro ao dar haver:', res.status, res.data);
    return null;
  }
}

async function verificarTransacao(transactionId) {
  const res = await request('GET', `/api/transactions/${transactionId}`);
  if (res.status === 200) {
    return res.data;
  }
  return null;
}

async function listarTransacoesCliente(cliente) {
  const res = await request('GET', `/api/transactions?search=${encodeURIComponent(cliente)}`);
  if (res.status === 200) {
    return res.data;
  }
  return [];
}

async function main() {
  console.log('='.repeat(60));
  console.log('🧪 TESTE COMPLETO DO SISTEMA DE HAVER');
  console.log('='.repeat(60));
  
  // Login
  if (!await login()) {
    console.log('\n❌ Não foi possível fazer login. Abortando.');
    process.exit(1);
  }
  
  // Criar venda parcelada
  const vendas = await criarVendaPrazo();
  if (!vendas) {
    console.log('\n❌ Não foi possível criar as parcelas. Abortando.');
    process.exit(1);
  }
  
  // Verificar estado inicial
  console.log('\n📊 ESTADO INICIAL:');
  const tx1Antes = await verificarTransacao(vendas.parcela1.id);
  const tx2Antes = await verificarTransacao(vendas.parcela2.id);
  console.log(`   Parcela 1: Valor=R$${tx1Antes.value}, A receber=R$${tx1Antes.valueDue || tx1Antes.value_due}, Status=${tx1Antes.status}`);
  console.log(`   Parcela 2: Valor=R$${tx2Antes.value}, A receber=R$${tx2Antes.valueDue || tx2Antes.value_due}, Status=${tx2Antes.status}`);
  
  // Dar haver de R$20 na parcela 1 (R$50)
  // Esperado: Parcela 1 fica com R$30 a receber
  const haverResult = await darHaver(vendas.parcela1.id, 20);
  if (!haverResult) {
    console.log('\n❌ Não foi possível dar haver. Abortando.');
    process.exit(1);
  }
  
  // Verificar estado após haver
  console.log('\n📊 ESTADO APÓS HAVER DE R$20:');
  const tx1Depois = await verificarTransacao(vendas.parcela1.id);
  const tx2Depois = await verificarTransacao(vendas.parcela2.id);
  
  const valueDue1 = tx1Depois.valueDue !== undefined ? tx1Depois.valueDue : tx1Depois.value_due;
  const valueDue2 = tx2Depois.valueDue !== undefined ? tx2Depois.valueDue : tx2Depois.value_due;
  
  console.log(`   Parcela 1: Valor=R$${tx1Depois.value}, A receber=R$${valueDue1}, Status=${tx1Depois.status}`);
  console.log(`   Parcela 2: Valor=R$${tx2Depois.value}, A receber=R$${valueDue2}, Status=${tx2Depois.status}`);
  
  // Validar resultado
  console.log('\n' + '='.repeat(60));
  console.log('📋 RESULTADO DO TESTE:');
  console.log('='.repeat(60));
  
  const esperadoParcela1 = 30; // 50 - 20 = 30
  const esperadoParcela2 = 50; // Inalterada
  
  let sucesso = true;
  
  if (parseFloat(valueDue1) === esperadoParcela1) {
    console.log(`✅ Parcela 1: CORRETO! A receber = R$${valueDue1} (esperado R$${esperadoParcela1})`);
  } else {
    console.log(`❌ Parcela 1: ERRADO! A receber = R$${valueDue1} (esperado R$${esperadoParcela1})`);
    sucesso = false;
  }
  
  if (parseFloat(valueDue2) === esperadoParcela2) {
    console.log(`✅ Parcela 2: CORRETO! A receber = R$${valueDue2} (esperado R$${esperadoParcela2})`);
  } else {
    console.log(`❌ Parcela 2: ERRADO! A receber = R$${valueDue2} (esperado R$${esperadoParcela2})`);
    sucesso = false;
  }
  
  if (tx1Depois.status === 'parcial') {
    console.log(`✅ Status da Parcela 1: CORRETO! Status = ${tx1Depois.status}`);
  } else {
    console.log(`❌ Status da Parcela 1: ERRADO! Status = ${tx1Depois.status} (esperado 'parcial')`);
    sucesso = false;
  }
  
  console.log('\n' + '='.repeat(60));
  if (sucesso) {
    console.log('🎉 TODOS OS TESTES PASSARAM! O HAVER FUNCIONA CORRETAMENTE!');
  } else {
    console.log('💥 ALGUNS TESTES FALHARAM!');
  }
  console.log('='.repeat(60));
  
  // Limpeza: deletar as transações de teste
  console.log('\n🧹 Limpando transações de teste...');
  await request('DELETE', `/api/transactions/${vendas.parcela1.id}`);
  await request('DELETE', `/api/transactions/${vendas.parcela2.id}`);
  console.log('✅ Limpeza concluída!');
}

main().catch(console.error);
