(async()=>{
  const db=require('./database');
  await db.initializeDatabase();
  const sql = `INSERT INTO produtos (id, code, name, sku, unit, short_description, price, cost, stock, min_stock, category, sub_category, brand, description, barcode, photo, active, ncm, icms_value, icms_rate, pis_value, pis_rate, cofins_value, cofins_rate, ipi_value, ipi_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params=[ 'test-id-123', '556', 'LAMPADA FAROL LED BRANCA H4 5W ACESS STALLION', '556', 'UND', null, 14.5, 12, 10, 1, 'Importado NF-e', null, null, null, 'SEM GTIN', null, 1, '12345678', 0, 12, 0, 1.65, 0, 7.6, 0, 0 ];
  try{
    const res = await db.query(sql, params);
    console.log('Insert result', res);
  }catch(err){
    console.error('Insert error', err);
  }
})();