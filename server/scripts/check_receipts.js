(async()=>{
  try{
    const db = require('../database');
    await db.initializeDatabase();

    const receipts = await db.query("SELECT id, transaction_id, amount, method, created_at FROM receipts ORDER BY created_at DESC LIMIT 20");
    console.log('Last receipts (up to 20):', receipts);

    const q = "SELECT COALESCE(SUM(r.amount),0) as total FROM receipts r JOIN transacoes t ON t.id = r.transaction_id WHERE LOWER(COALESCE(t.payment_method,'')) = 'prazo' AND LOWER(COALESCE(r.method,'')) IN ('dinheiro','cash','pix','card','cartao','cartão','credit_card','debito','debit')";
    const row = await db.query(q);
    console.log('Sum immediate receipts for prazo:', row[0]);

    const q2 = "SELECT r.*, t.payment_method FROM receipts r LEFT JOIN transacoes t ON t.id = r.transaction_id WHERE LOWER(COALESCE(r.method,'')) IN ('cash','dinheiro','pix','card','cartao','cartão','credit_card','debito','debit') ORDER BY r.created_at DESC LIMIT 20";
    const row2 = await db.query(q2);
    console.log('Recent immediate receipts joined with transactions:', row2);

  }catch(e){ console.error('ERR', e); process.exit(1); }
})();