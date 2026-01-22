(async()=>{
  try{
    const db = require('../database');
    await db.initializeDatabase();
    const id='9885410d-7e06-4418-b278-06000d910a8a';
    const row = await db.query('SELECT r.*, t.payment_method, t.description, t.notes FROM receipts r LEFT JOIN transacoes t ON t.id = r.transaction_id WHERE r.id = ?', [id]);
    console.log('receipt+tx:', row[0]);
    const q = `SELECT COALESCE(SUM(r.amount),0) as total FROM receipts r JOIN transacoes t ON t.id = r.transaction_id WHERE r.id = ? AND (LOWER(COALESCE(t.payment_method,'')) = 'prazo' OR LOWER(COALESCE(t.description,'')) LIKE '%venda pdv%' OR LOWER(COALESCE(t.notes,'')) LIKE '%parcela%')`;
    const s = await db.query(q, [id]);
    console.log('sumMatch', s[0]);
  }catch(e){ console.error(e); }
})();