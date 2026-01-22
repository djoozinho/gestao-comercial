// Teste simples de parcelas - output limpo
const http = require('http');

function request(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost:3000');
    const options = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: { 'Content-Type': 'application/json' } };
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(body); } });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  console.log('=== TESTE SIMPLES DE HAVER ===\n');
  
  // Login
  const login = await request('POST', '/api/auth/login', { username: 'admin@lojaprincipal.local', password: 'admin123' });
  const token = login.token;
  if (!token) { console.log('ERRO: Login falhou'); return; }
  console.log('1. Login OK');
  
  // Criar 4 parcelas de R$25
  const parcelas = [];
  for (let i = 1; i <= 4; i++) {
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + i);
    const tx = await request('POST', '/api/transactions', {
      category: 'vendas', 
      description: 'TESTE - Parcela ' + i + '/4',
      person: 'TESTE HAVER JS',
      value: 25, 
      value_due: 25, 
      paid: false, 
      status: 'pendente',
      payment_method: 'prazo', 
      due_date: dueDate.toISOString().split('T')[0]
    }, token);
    parcelas.push(tx.id);
  }
  console.log('2. Criou 4 parcelas de R$25 (total R$100)');
  
  // Dar haver de R$10 na parcela 1
  await request('POST', '/api/transactions/' + parcelas[0] + '/receive', {
    amount: 10, method: 'dinheiro', note: 'Haver R$10'
  }, token);
  console.log('3. Registrou haver de R$10 na parcela 1');
  
  // Verificar resultado
  const resp = await request('GET', '/api/transactions?search=TESTE%20HAVER%20JS&pageSize=100', null, token);
  const txs = (resp.data || []).filter(t => t.person === 'TESTE HAVER JS');
  
  console.log('\n=== RESULTADO ===');
  let totalDevido = 0;
  let erro = false;
  
  txs.forEach((t, i) => {
    const esperado = t.description.includes('Parcela 1') ? 15 : 25;
    const ok = Math.abs(parseFloat(t.valueDue) - esperado) < 0.01;
    if (!ok) erro = true;
    totalDevido += parseFloat(t.valueDue);
    console.log(`Parcela ${i+1}: valueDue=R$${parseFloat(t.valueDue).toFixed(2)} (esperado: R$${esperado}) [${ok ? 'OK' : 'ERRO'}]`);
  });
  
  console.log(`\nTotal devido: R$${totalDevido.toFixed(2)} (esperado: R$90)`);
  console.log(erro ? '\n❌ TESTE FALHOU!' : '\n✅ TESTE PASSOU!');
  
  // Limpar
  for (const id of parcelas) {
    await request('DELETE', '/api/transactions/' + id, null, token);
  }
  console.log('\nDados de teste removidos.');
}

main().catch(e => console.error('ERRO:', e.message));
