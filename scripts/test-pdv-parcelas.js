const http = require('http');
const BASE_URL = 'http://localhost:3000';
let token = null;

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: method, headers: { 'Content-Type': 'application/json' } };
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(body) }); } catch (e) { resolve({ status: res.statusCode, data: body }); } });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  const login = await request('POST', '/api/auth/login', { username: 'admin@lojaprincipal.local', password: 'admin123' });
  if (login.status !== 200) { console.log('Login falhou'); return; }
  token = login.data.token;
  
  console.log('=== SIMULACAO VENDA PDV COM 4 PARCELAS R$25 ===');
  console.log('Cenario: Venda de R$100 parcelada em 4x R$25 a prazo');
  
  // Simular criacao de venda via API /api/sales (como o PDV faz)
  const salePayload = {
    clientName: 'CLIENTE TESTE PARCELAS',
    subtotal: 100,
    discount: 0,
    total: 100,
    paymentMethod: 'prazo',
    payments: [{ method: 'prazo', amount: 100 }],
    amountPaid: 0,
    amountPrazo: 100,
    changeAmount: 0,
    installments: 4,
    notes: 'Teste de parcelas via script',
    items: [{ productId: null, productName: 'Produto Teste', quantity: 1, unitPrice: 100, totalPrice: 100 }]
  };
  
  const resp = await request('POST', '/api/sales', salePayload);
  console.log('Venda criada: status=' + resp.status);
  if (resp.status !== 201 && resp.status !== 200) {
    console.log('Erro:', JSON.stringify(resp.data));
    return;
  }
  
  // Buscar as transacoes criadas
  const txResp = await request('GET', '/api/transactions?search=CLIENTE%20TESTE%20PARCELAS&pageSize=100');
  const txs = (txResp.data.data || []).filter(t => (t.person || '').includes('CLIENTE TESTE'));
  
  console.log('\nParcelas criadas (' + txs.length + '):');
  txs.forEach((t, i) => {
    console.log((i+1) + '. ' + t.description + ' | value=' + t.value + ' | valueDue=' + t.valueDue + ' | status=' + t.status);
  });
  
  // Registrar haver de R$10 na primeira parcela
  const parcela1 = txs.find(t => t.description && t.description.includes('Parcela 1'));
  if (parcela1) {
    console.log('\nRegistrando HAVER de R$10 na Parcela 1 (ID=' + parcela1.id.substring(0,8) + ')...');
    const haverResp = await request('POST', '/api/transactions/' + parcela1.id + '/receive', {
      amount: 10, method: 'dinheiro', note: 'Haver R$10'
    });
    console.log('Haver resultado: status=' + haverResp.status);
    
    // Verificar resultado
    const txResp2 = await request('GET', '/api/transactions?search=CLIENTE%20TESTE%20PARCELAS&pageSize=100');
    const txs2 = (txResp2.data.data || []).filter(t => (t.person || '').includes('CLIENTE TESTE'));
    
    console.log('\nApos o haver:');
    txs2.forEach((t, i) => {
      const esperado = t.description && t.description.includes('Parcela 1') ? 15 : 25;
      const ok = Math.abs(parseFloat(t.valueDue) - esperado) < 0.01;
      console.log((i+1) + '. ' + t.description + ' | valueDue=' + t.valueDue + ' (esperado: ' + esperado + ') [' + (ok ? 'OK' : 'ERRO') + ']');
    });
    
    const total = txs2.reduce((s, t) => s + (t.status === 'pendente' || t.status === 'parcial' ? parseFloat(t.valueDue || 0) : 0), 0);
    console.log('\nTotal devido: R$' + total.toFixed(2) + ' (esperado: R$90)');
  }
  
  // Limpar
  console.log('\nLimpando dados de teste...');
  for (const t of txs) {
    await request('DELETE', '/api/transactions/' + t.id);
  }
  console.log('Dados removidos.');
}

main().catch(console.error);
