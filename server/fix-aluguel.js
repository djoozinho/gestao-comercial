(async function(){
  const db = require('./database');
  await db.initializeDatabase();
  const id = 'ad3d17ca-2f25-4fe8-a814-26d32ff1720f';
  await db.query('UPDATE transacoes SET value = ?, paid = ?, status = ? WHERE id = ?', [-500, 0, 'vencido', id]);
  const rows = await db.query('SELECT id, category, due_date, description, person, value, paid, status FROM transacoes WHERE id = ?', [id]);
  console.log(rows);
  process.exit(0);
})();