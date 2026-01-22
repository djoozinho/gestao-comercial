(async function(){
  const base = 'http://localhost:3000';
  const log = console.log;
  try{
    log('--- Testing PRODUCTS ---');
    // create
    let res = await fetch(base+'/api/products', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:'Teste Produto', sku:'TST-123', price:9.9, stock:5, category:'Teste' }) });
    let prod = await res.json(); log('Created product:', prod);
    const prodId = prod.id;

    // update
    res = await fetch(base+'/api/products/'+prodId, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ price:12.5, stock:10 }) });
    prod = await res.json(); log('Updated product:', prod);

    // delete
    res = await fetch(base+'/api/products/'+prodId, { method:'DELETE' });
    log('Deleted product status:', res.status);

    log('--- Testing PEOPLE ---');
    res = await fetch(base+'/api/people', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:'Teste Pessoa', email:'teste@ex.com', phone:'0000-0000', type:'Cliente' }) });
    let person = await res.json(); log('Created person:', person);
    const personId = person.id;

    res = await fetch(base+'/api/people/'+personId, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ phone:'1111-2222' }) });
    person = await res.json(); log('Updated person:', person);

    res = await fetch(base+'/api/people/'+personId, { method:'DELETE' });
    log('Deleted person status:', res.status);

    log('--- Testing TRANSACTIONS ---');
    // Create two transactions for bulk test
    res = await fetch(base+'/api/transactions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ category:'Teste', dueDate:'2026-01-18', description:'Lançamento A', person:'Pessoa A', value:120, valueDue:120, paid:false, status:'pendente' }) });
    let tx1 = await res.json(); log('Created tx1:', tx1);
    res = await fetch(base+'/api/transactions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ category:'Teste', dueDate:'2026-01-19', description:'Lançamento B', person:'Pessoa B', value:80, valueDue:80, paid:false, status:'pendente' }) });
    let tx2 = await res.json(); log('Created tx2:', tx2);

    // Bulk receive both transactions
    res = await fetch(base + '/api/transactions/bulk-receive', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ items:[ { id: tx1.id, amount: 120, method:'cash', note:'Bulk test' }, { id: tx2.id, amount: 80, method:'cash', note:'Bulk test' } ] }) });
    let bulk = await res.json(); log('Bulk receive response:', bulk);

    // Verify receipts
    if (bulk && bulk.receipts && bulk.receipts.length) {
      for (const r of bulk.receipts) {
        res = await fetch(base + '/api/receipts/' + r.id);
        const rjson = await res.json(); log('Fetched receipt', r.id, rjson);
        // Fetch PDF and ensure it returns something reasonable
        res = await fetch(base + '/api/receipts/' + r.id + '/pdf');
        const ct = res.headers.get('content-type') || ''; log('PDF endpoint status for', r.id, res.status, 'content-type:', ct);
        if (!ct.includes('application/pdf') && !ct.includes('text/html')) throw new Error('Unexpected content-type for PDF endpoint: ' + ct);
      }
    }

    // Cleanup: delete transactions
    res = await fetch(base+'/api/transactions/'+tx1.id, { method:'DELETE' });
    log('Deleted tx1 status:', res.status);
    res = await fetch(base+'/api/transactions/'+tx2.id, { method:'DELETE' });
    log('Deleted tx2 status:', res.status);

    log('All tests completed successfully');
    process.exit(0);
  }catch(err){ console.error('Test failed', err); process.exit(2); }
})();
