// Verificar as parcelas do JOAO SOARES existentes
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
  // Login
  const login = await request('POST', '/api/auth/login', { username: 'admin@lojaprincipal.local', password: 'admin123' });
  const token = login.token;
  
  // Buscar todas pendentes
  const resp = await request('GET', '/api/transactions?status=pendente&pageSize=500', null, token);
  const items = (resp.data || []).filter(t => t.status === 'pendente' || t.status === 'parcial');
  
  console.log('=== TRANSACOES PENDENTES ===\n');
  
  // Agrupar por pessoa
  const byPerson = {};
  items.forEach(t => {
    const p = t.person || 'SEM PESSOA';
    if (!byPerson[p]) byPerson[p] = [];
    byPerson[p].push(t);
  });
  
  for (const [person, txs] of Object.entries(byPerson)) {
    console.log(`\n>>> ${person} (${txs.length} parcela(s)):`);
    txs.forEach((t, i) => {
      console.log(`   ${i+1}. ${(t.description||'').substring(0,50)} | value=${t.value} | valueDue=${t.valueDue} | status=${t.status}`);
    });
    const total = txs.reduce((s, t) => s + parseFloat(t.valueDue || 0), 0);
    console.log(`   TOTAL DEVIDO: R$ ${total.toFixed(2)}`);
  }
  
  console.log('\n=== FIM ===');
}

main().catch(e => console.error('Erro:', e.message));
