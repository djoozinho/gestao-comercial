(async function(){
  const base = 'http://localhost:3000';
  const log = console.log;
  try{
    log('--- Test: criar parcela restante ---');
    // Create transaction
    let res = await fetch(base + '/api/transactions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ category:'Teste', dueDate:'2026-02-10', description:'Teste Parcela Restante', person:'Cliente X', value:100, valueDue:100, paid:false, status:'pendente' }) });
    if (!res.ok) throw new Error('Failed to create tx: ' + res.status);
    const tx = await res.json(); log('Created tx', tx.id);

    // Partial receive 50
    res = await fetch(base + '/api/transactions/' + tx.id + '/receive', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amount:50, method:'cash', note:'Parcial test' }) });
    if (!res.ok) { const txt = await res.text(); throw new Error('Receive failed: ' + res.status + ' ' + txt); }
    const recv = await res.json(); log('Receive:', recv.id, 'remainingTxId:', recv.remainingTransactionId);

    // Reload transaction and verify original is marked paid and remaining created
    res = await fetch(base + '/api/transactions?search=&pageSize=1000');
    const list = await res.json();
    const updated = (list.data || []).find(d => d.id === tx.id);
    log('Updated tx valueDue:', updated.valueDue, 'value:', updated.value, 'status:', updated.status);

    if (!recv.remainingTransactionId) throw new Error('Remaining transaction not created automatically');
    const remainingTx = (list.data || []).find(d => d.id === recv.remainingTransactionId);
    if (!remainingTx) throw new Error('Remaining transaction not found in list');
    log('Remaining tx found:', remainingTx.id, 'value:', remainingTx.value, 'valueDue:', remainingTx.valueDue, 'dueDate:', remainingTx.dueDate);

    // Verify due date is the same as original
    if (remainingTx.dueDate !== tx.dueDate) throw new Error('Due date mismatch: expected ' + tx.dueDate + ' but got ' + remainingTx.dueDate);

    // Cleanup: delete both (remaining first)
    res = await fetch(base + '/api/transactions/' + remainingTx.id, { method:'DELETE' }); log('Deleted remainingTx:', res.status);
    res = await fetch(base + '/api/transactions/' + tx.id, { method:'DELETE' }); log('Deleted orig:', res.status);

    log('Test completed OK');
    process.exit(0);
  }catch(err){ console.error('Test failed:', err); process.exit(2); }
})();