// Verificar direto no banco as transações do JOAO SOARES
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../server/tenants/principal.db'));

console.log('=== TRANSACOES NO BANCO ===\n');

const rows = db.prepare(`
  SELECT id, description, value, value_due, status, due_date, payment_method
  FROM transacoes 
  WHERE person LIKE '%JOAO SOARES%' 
  ORDER BY due_date
`).all();

rows.forEach((r, i) => {
  console.log(`${i+1}. ID: ${r.id.substring(0,8)}...`);
  console.log(`   Desc: ${r.description}`);
  console.log(`   Value: R$${r.value} | ValueDue: R$${r.value_due} | Status: ${r.status}`);
  console.log(`   Venc: ${r.due_date} | Método: ${r.payment_method}`);
  console.log('');
});

console.log(`Total: ${rows.length} transações`);

// Verificar também os receipts (recebimentos)
console.log('\n=== RECEIPTS (RECEBIMENTOS) ===\n');
const receipts = db.prepare(`
  SELECT r.id, r.transaction_id, r.amount, r.method, r.note, r.created_at
  FROM receipts r
  JOIN transacoes t ON r.transaction_id = t.id
  WHERE t.person LIKE '%JOAO SOARES%'
  ORDER BY r.created_at
`).all();

receipts.forEach((r, i) => {
  console.log(`${i+1}. Recibo: ${r.id.substring(0,8)}... | TxID: ${r.transaction_id.substring(0,8)}...`);
  console.log(`   Valor: R$${r.amount} | Método: ${r.method} | Nota: ${r.note || '-'}`);
  console.log('');
});

console.log(`Total: ${receipts.length} recibos`);
db.close();
