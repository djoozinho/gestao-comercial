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

async function getTransaction(id) {
  // Não existe rota individual, buscar pela lista
  const resp = await request('GET', '/api/transactions?pageSize=1000');
  const items = resp.data.data || [];
  return items.find(t => t.id === id);
}

async function main() {
  console.log('=== INVESTIGACAO HAVER - 4 PARCELAS R$25 ===');
  console.log('Cenario: R$100 dividido em 4x R$25, cliente paga R$10 de haver na parcela 1');
  console.log('ESPERADO: P1=R$15, P2=R$25, P3=R$25, P4=R$25 (total R$90)');
  console.log('');
  
  const login = await request('POST', '/api/auth/login', CREDENTIALS);
  if (login.status !== 200) { console.log('Login falhou:', login.data); return; }
  token = login.data.token;
  console.log('Login OK');
  
  // Buscar parcelas existentes do JOAO SOARES
  const resp = await request('GET', '/api/transactions?search=JOAO%20SOARES&status=pendente&pageSize=100');
  const items = (resp.data.data || []).filter(t => t.status === 'pendente');
  
  console.log('\nParcelas pendentes encontradas para JOAO SOARES:');
  items.forEach((t, i) => {
    const value = t.value || t.amount || 0;
    const valueDue = t.valueDue !== undefined ? t.valueDue : (t.value_due !== undefined ? t.value_due : value);
    const desc = (t.description || '').substring(0, 40);
    console.log('  ' + (i+1) + '. ID=' + t.id.substring(0,8) + '... | desc="' + desc + '" | value=' + value + ' | valueDue=' + valueDue + ' | status=' + t.status);
  });
  
  const total = items.reduce((s, t) => s + parseFloat(t.valueDue !== undefined ? t.valueDue : (t.value_due !== undefined ? t.value_due : t.value || 0)), 0);
  console.log('\nTotal devido: R$' + total.toFixed(2));
  
  // Agora criar um cenário de teste limpo para reproduzir o bug
  console.log('\n\n=== TESTE: Criar 4 parcelas de R$25 e dar haver R$10 na 1a ===');
  
  const parcelas = [];
  for (let i = 1; i <= 4; i++) {
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + i);
    const tx = await request('POST', '/api/transactions', {
      category: 'vendas', 
      description: 'TESTE HAVER - Parcela ' + i + '/4',
      person: 'CLIENTE TESTE HAVER',
      value: 25, 
      value_due: 25, 
      paid: false, 
      status: 'pendente',
      payment_method: 'prazo', 
      due_date: dueDate.toISOString().split('T')[0]
    });
    parcelas.push(tx.data.id);
    console.log('Criou Parcela ' + i + '/4: ID=' + tx.data.id.substring(0,8) + ' | value=25 | valueDue=25');
  }
  
  console.log('\nAntes do haver:');
  for (let i = 0; i < 4; i++) {
    const tx = await getTransaction(parcelas[i]);
    const due = tx ? (tx.valueDue !== undefined ? tx.valueDue : tx.value_due) : 'NOT FOUND';
    console.log('  Parcela ' + (i+1) + '/4: valueDue=R$' + (typeof due === 'number' ? parseFloat(due).toFixed(2) : due));
  }
  
  console.log('\nRegistrando HAVER de R$10 na Parcela 1...');
  const haver = await request('POST', '/api/transactions/' + parcelas[0] + '/receive', {
    amount: 10, method: 'dinheiro', note: 'Haver R$10 teste'
  });
  console.log('Haver resultado: status=' + haver.status);
  console.log('Resposta:', JSON.stringify(haver.data, null, 2));
  
  console.log('\nApós o haver:');
  let totalFinal = 0;
  let erro = false;
  
  for (let i = 0; i < 4; i++) {
    const tx = await getTransaction(parcelas[i]);
    const due = tx ? (tx.valueDue !== undefined ? tx.valueDue : tx.value_due) : null;
    if (due !== null) totalFinal += parseFloat(due);
    
    const esperado = (i === 0) ? 15 : 25;
    const ok = due !== null && Math.abs(parseFloat(due) - esperado) < 0.01;
    if (!ok) erro = true;
    
    const icon = ok ? 'OK' : 'ERRO';
    console.log('  Parcela ' + (i+1) + '/4: valueDue=R$' + (due !== null ? parseFloat(due).toFixed(2) : 'NOT FOUND') + ' (esperado: R$' + esperado + ') [' + icon + ']');
  }
  
  console.log('\nTotal final: R$' + totalFinal.toFixed(2) + ' (esperado: R$90)');
  
  if (!erro && Math.abs(totalFinal - 90) < 0.01) {
    console.log('\n✅ TESTE PASSOU! Haver funciona corretamente!');
  } else {
    console.log('\n❌ TESTE FALHOU! Haver está distribuindo entre parcelas incorretamente!');
  }
  
  // Limpar
  console.log('\nLimpando transações de teste...');
  for (const id of parcelas) {
    await request('DELETE', '/api/transactions/' + id);
  }
  console.log('Transações de teste removidas.');
}

main().catch(console.error);
