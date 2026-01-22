const db = require('../server/database');
(async ()=>{
  try{
    await db.initializeDatabase();
    console.log('DB type:', db.getDatabaseType());
    const rows = await db.query("SELECT id, total, sale_date, DATE(sale_date) as sale_date_only FROM vendas ORDER BY sale_date DESC LIMIT 10");
    console.log('vendas with DATE(sale_date):');
    console.table(rows);

    const from = '2026-01-01';
    const to = '2026-01-21';
    const avgRow = await db.query("SELECT AVG(total) as average_ticket, COUNT(*) as total_sales, SUM(total) as total_revenue FROM vendas WHERE DATE(sale_date) BETWEEN ? AND ?", [from, to]);
    console.log('average query result for', from, '->', to, avgRow[0]);
  }catch(e){
    console.error('Erro debug:', e);
    process.exit(1);
  }
})();