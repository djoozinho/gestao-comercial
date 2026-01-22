const http = require('http');
const BASE_URL = 'http://localhost:3000';
const CREDENTIALS = { username: 'admin@lojaprincipal.local', password: 'admin123' };
let token = null;

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  console.log('=== TESTE HAVER ===\n');
  
  // Login
  const login = await request('POST', '/api/auth/login', CREDENTIALS);
  if (login.status !== 200) { console.log('Login falhou:', login.data); return; }
  token = login.data.token;
  console.log('✅ Login OK');
  
  // Criar parcela 1 (R$50)
  const tx1 = await request('POST', '/api/transactions', {
    category: 'vendas', description: 'Teste Haver P1', person: 'Teste Haver',
    value: 50, value_due: 50, paid: false, status: 'pendente',
    payment_method: 'prazo', due_date: '2025-06-25'
  });
  console.log('✅ Criou Parcela 1 (R$50):', tx1.data.id);
  
  // Criar parcela 2 (R$50)
  const tx2 = await request('POST', '/api/transactions', {
    category: 'vendas', description: 'Teste Haver P2', person: 'Teste Haver',
    value: 50, value_due: 50, paid: false, status: 'pendente',
    payment_method: 'prazo', due_date: '2025-07-25'
  });
  console.log('✅ Criou Parcela 2 (R$50):', tx2.data.id);
  
  // Dar haver de R$20 na parcela 1
  console.log('\n💰 Dando HAVER de R$20 na Parcela 1...');
  const haver = await request('POST', '/api/transactions/' + tx1.data.id + '/receive', {
    amount: 20, method: 'dinheiro', notes: 'Haver R$20'
  });
  console.log('✅ Haver registrado, status HTTP:', haver.status);
  
  // Verificar estado após haver
  const check1 = await request('GET', '/api/transactions/' + tx1.data.id);
  const check2 = await request('GET', '/api/transactions/' + tx2.data.id);
  
  console.log('\n🔍 DEBUG - Resposta GET P1:', JSON.stringify(check1.data, null, 2));
  console.log('🔍 DEBUG - Resposta GET P2:', JSON.stringify(check2.data, null, 2));
  
  const due1 = check1.data.valueDue !== undefined ? check1.data.valueDue : check1.data.value_due;
  const due2 = check2.data.valueDue !== undefined ? check2.data.valueDue : check2.data.value_due;
  
  console.log('\n📊 RESULTADO:');
  console.log('   Parcela 1: value_due=R$' + due1 + ', status=' + check1.data.status);
  console.log('   Parcela 2: value_due=R$' + due2 + ', status=' + check2.data.status);
  
  const ok1 = parseFloat(due1) === 30;
  const ok2 = parseFloat(due2) === 50;
  const okStatus = check1.data.status === 'parcial';
  
  console.log('\n' + '='.repeat(50));
  if (ok1 && ok2 && okStatus) {
    console.log('🎉 TESTE PASSOU! Haver funciona corretamente!');
    console.log('   ✅ R$50 - R$20 haver = R$30 restante');
    console.log('   ✅ Parcela 2 inalterada em R$50');
    console.log('   ✅ Status parcial correto');
  } else {
    console.log('❌ TESTE FALHOU!');
    if (!ok1) console.log('   ❌ Esperado P1: R$30, Obtido: R$' + due1);
    if (!ok2) console.log('   ❌ Esperado P2: R$50, Obtido: R$' + due2);
    if (!okStatus) console.log('   ❌ Status deveria ser parcial, obtido: ' + check1.data.status);
  }
  console.log('='.repeat(50));
  
  // Limpar
  await request('DELETE', '/api/transactions/' + tx1.data.id);
  await request('DELETE', '/api/transactions/' + tx2.data.id);
  console.log('\n🧹 Transações de teste removidas.');
}

main().catch(console.error);
