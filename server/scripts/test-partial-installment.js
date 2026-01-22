(async function(){
  const base = 'http://localhost:3000';
  try{
    console.log('--- Test: partial payment redistribute across installments ---');
    // create a product
    let res = await fetch(base + '/api/products', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:'TP', price:10, stock:10 }) });
    const p = await res.json(); console.log('Created product', p.id);

    // create sale total 10 split into 2 installments, payMethod 'prazo'
    const salePayload = {
      clientName: 'Cliente Teste',
      subtotal: 10,
      discount: 0,
      total: 10,
      paymentMethod: 'prazo',
      amountPaid: 0,
      installments: 2,
      items: [{ productId: p.id, productName: 'TP', quantity: 1, unitPrice: 10, totalPrice: 10 }]
    };

    res = await fetch(base + '/api/sales', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(salePayload) });
    const saleResp = await res.json();
    console.log('Sale created:', saleResp);

    const txIds = saleResp.transactions || [];
    if (!txIds.length) throw new Error('No transactions created for sale');

    // Fetch transactions details specifically for this sale
    const parcelas = [];
    for (const id of txIds) {
      res = await fetch(base + '/api/transactions');
      const all = await res.json();
      const found = all.data.find(t => t.id === id);
      if (found) parcelas.push(found);
    }
    console.log('Parcelas for this sale before received:', parcelas.map(p => ({ id: p.id, value: p.value, valueDue: p.valueDue, notes: p.notes })));

    // Choose first parcela (the one with the earliest due date) and pay 2
    const targetId = parcelas.sort((a,b)=> new Date(a.dueDate) - new Date(b.dueDate))[0].id;
    res = await fetch(base + '/api/transactions/' + targetId + '/receive', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amount: 2, method: 'cash', note: 'Partial upfront' }) });
    const rcpt = await res.json();
    console.log('Receive result:', rcpt);

    // Fetch parcelas after receive
    res = await fetch(base + '/api/transactions');
    const txList2 = await res.json();
    const parcelasAfter = txList2.data.filter(t => (t.notes || '').toLowerCase().includes('parcela') && (t.notes || '').includes('/2'));
    console.log('Parcelas after receive:', parcelasAfter.map(p => ({ id: p.id, value: p.value, valueDue: p.valueDue, notes: p.notes, paid: p.paid })));

    console.log('Done test.');
    process.exit(0);
  }catch(err){ console.error('Test failed', err); process.exit(2); }
})();