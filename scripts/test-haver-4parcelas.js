/**
 * Teste de HAVER em parcelas - Correção do bug de redistribuição
 * 
 * Cenário: R$100 dividido em 4x R$25, cliente paga R$10 de haver na parcela 1
 * Esperado: Parcela 1 = R$15, Parcelas 2-4 = R$25 cada (total: R$90)
 * Bug anterior: 4x R$22,50 (distribuía entre todas as parcelas)
 */

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
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║          TESTE HAVER - CORREÇÃO DO BUG                    ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║  Cenário: R$100 em 4x R$25                                ║');
  console.log('║  Ação: Cliente paga R$10 de haver na parcela 1            ║');
  console.log('║  Esperado: P1=R$15, P2-P4=R$25 cada (total: R$90)         ║');
  console.log('║  Bug anterior: 4x R$22,50 (redistribuía entre todas)      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Login
  const login = await request('POST', '/api/auth/login', CREDENTIALS);
  if (login.status !== 200) { 
    console.log('❌ Login falhou:', login.data); 
    return; 
  }
  token = login.data.token;
  console.log('✅ Login OK');
  console.log('');
  
  // Criar 4 parcelas de R$25 cada
  const saleId = 'teste-haver-' + Date.now();
  const parcelas = [];
  
  console.log('📝 Criando 4 parcelas de R$25 cada:');
  for (let i = 1; i <= 4; i++) {
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + i);
    const tx = await request('POST', '/api/transactions', {
      category: 'vendas', 
      description: 'Venda Teste Haver',
      person: 'Cliente Teste Haver',
      value: 25, 
      value_due: 25, 
      paid: false, 
      status: 'pendente',
      payment_method: 'prazo', 
      due_date: dueDate.toISOString().split('T')[0],
      notes: `Parcela ${i}/4 | sale:${saleId}`
    });
    parcelas.push(tx.data.id);
    console.log(`   Parcela ${i}/4: R$25,00 ✓`);
  }
  
  console.log('');
  console.log('💰 Registrando HAVER de R$10 na Parcela 1...');
  const haver = await request('POST', '/api/transactions/' + parcelas[0] + '/receive', {
    amount: 10, 
    method: 'dinheiro', 
    note: 'Haver R$10 - Teste correção bug'
  });
  console.log(`   Status: ${haver.status === 201 ? '✅ OK' : '❌ Erro'}`);
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    RESULTADO APÓS HAVER                    ');
  console.log('═══════════════════════════════════════════════════════════');
  
  let totalDevido = 0;
  let erro = false;
  
  for (let i = 0; i < 4; i++) {
    const check = await request('GET', '/api/transactions/' + parcelas[i]);
    const due = check.data.valueDue !== undefined ? check.data.valueDue : check.data.value_due;
    totalDevido += parseFloat(due);
    
    const esperado = (i === 0) ? 15 : 25;
    const ok = Math.abs(parseFloat(due) - esperado) < 0.01;
    if (!ok) erro = true;
    
    const status = ok ? '✅' : '❌';
    console.log(`   Parcela ${i+1}/4: R$${parseFloat(due).toFixed(2)} (esperado: R$${esperado}.00) ${status}`);
  }
  
  console.log('───────────────────────────────────────────────────────────');
  console.log(`   Total devido: R$${totalDevido.toFixed(2)} (esperado: R$90.00)`);
  console.log('═══════════════════════════════════════════════════════════');
  
  if (!erro && Math.abs(totalDevido - 90) < 0.01) {
    console.log('');
    console.log('🎉 ═══════════════════════════════════════════════════════');
    console.log('   ✅ TESTE PASSOU! Bug corrigido com sucesso!');
    console.log('   - Haver abate apenas da parcela específica');
    console.log('   - Demais parcelas permanecem inalteradas');
    console.log('═══════════════════════════════════════════════════════════');
  } else {
    console.log('');
    console.log('💥 ═══════════════════════════════════════════════════════');
    console.log('   ❌ TESTE FALHOU! Bug ainda presente.');
    console.log('═══════════════════════════════════════════════════════════');
  }
  
  // Limpar
  console.log('');
  console.log('🧹 Limpando transações de teste...');
  for (const id of parcelas) {
    await request('DELETE', '/api/transactions/' + id);
  }
  console.log('   Transações removidas ✓');
}

main().catch(err => {
  console.error('Erro no teste:', err);
});
