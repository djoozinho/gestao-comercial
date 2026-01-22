const db = require('../server/database');
(async ()=>{
  try{
    await db.initializeDatabase();
    console.log('DB type:', db.getDatabaseType());

    const vendas = await db.query('SELECT id, client_name, total, payment_method, amount_paid, sale_date FROM vendas ORDER BY sale_date DESC LIMIT 20');
    console.log('\n== VENDAS ==');
    console.table(vendas);

    const transacoes = await db.query('SELECT id, category, description, value, paid, payment_date, payment_method, created_at FROM transacoes ORDER BY created_at DESC LIMIT 50');
    console.log('\n== TRANSACOES ==');
    console.table(transacoes);

    const receipts = await db.query('SELECT id, transaction_id, amount, method, created_at FROM receipts ORDER BY created_at DESC LIMIT 50');
    console.log('\n== RECEIPTS ==');
    console.table(receipts);

    // Reproduz cálculo de /api/dashboard/fiado para validar
    const totalCreditSalesRow = await db.query("SELECT COALESCE(SUM(total),0) as total FROM vendas WHERE LOWER(COALESCE(payment_method,'')) = 'prazo'");
    const totalCreditSales = parseFloat((totalCreditSalesRow[0] && (totalCreditSalesRow[0].total || 0)) || 0);

    const txTotalRow = await db.query("SELECT COALESCE(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(payment_method,'')) = 'prazo' AND LOWER(COALESCE(category,'')) = 'vendas' AND LOWER(COALESCE(description,'')) NOT LIKE '%venda pdv%' AND LOWER(COALESCE(notes,'')) NOT LIKE '%parcela%'");
    const txTotal = parseFloat((txTotalRow[0] && (txTotalRow[0].total || 0)) || 0);

    const totalCredit = totalCreditSales + txTotal;

    const immediateMethods = ['dinheiro','cash','pix','card','cartao','cartão','credit_card','debito','debit'];
    const methodsList = immediateMethods.map(m => m.toLowerCase()).join("','");
    const payReceiptsSql = `SELECT COALESCE(SUM(r.amount),0) as total FROM receipts r JOIN transacoes t ON t.id = r.transaction_id WHERE LOWER(COALESCE(r.method,'')) IN ('${methodsList}') AND (LOWER(COALESCE(t.payment_method,'')) = 'prazo' OR LOWER(COALESCE(t.description,'')) LIKE '%parcela%' OR LOWER(COALESCE(t.notes,'')) LIKE '%parcela%')`;
    const payReceiptsRow = await db.query(payReceiptsSql);
    const totalPaidImmediateReceipts = parseFloat((payReceiptsRow[0] && (payReceiptsRow[0].total || 0)) || 0);

    const outstanding = totalCredit - totalPaidImmediateReceipts;
    console.log('\n== CHECK: FIADO CALCULATION ==');
    console.log('totalCreditSales (vendas) =', totalCreditSales);
    console.log('txTotal (transacoes de vendas excluindo PDV/parc) =', txTotal);
    console.log('totalCredit (sum) =', totalCredit);
    console.log('totalPaidImmediateReceipts =', totalPaidImmediateReceipts);
    console.log('outstanding =', outstanding);

    // --- Checar agregação do período (mimica de /api/dashboard/period) ---
    const today = new Date();
    const startDate = today.toISOString().slice(0,10);
    const endDate = startDate;

    const salesRows = await db.query("SELECT strftime('%Y-%m-%d', sale_date) as day, COALESCE(SUM(total),0) as total FROM vendas WHERE sale_date >= ? AND sale_date <= ? GROUP BY day ORDER BY day", [startDate, endDate + ' 23:59:59']);
    const salesMap = {};
    salesRows.forEach(r => { salesMap[r.day] = parseFloat(r.total || 0); });

    const txSaleRowsCheck = await db.query("SELECT strftime('%Y-%m-%d', due_date) as day, COALESCE(SUM(value),0) as total FROM transacoes WHERE LOWER(COALESCE(category,'')) = 'vendas' AND LOWER(COALESCE(description,'')) NOT LIKE '%venda pdv%' AND LOWER(COALESCE(notes,'')) NOT LIKE '%parcela%' AND due_date >= ? AND due_date <= ? GROUP BY day ORDER BY day", [startDate, endDate + ' 23:59:59']);
    txSaleRowsCheck.forEach(r => { salesMap[r.day] = (salesMap[r.day] || 0) + parseFloat(r.total || 0); });

    const totalSalesPeriod = Object.values(salesMap).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    console.log('\n== CHECK: PERIOD AGGREGATION ==');
    console.log('salesRows:', salesRows);
    console.log('txSaleRows (excluded PDV/parc):', txSaleRowsCheck);
    console.log('combined salesMap:', salesMap);
    console.log('totalSalesPeriod =', totalSalesPeriod);

  }catch(e){
    console.error('Erro:', e);
    process.exit(1);
  }
})();