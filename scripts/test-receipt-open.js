(async function(){
  const base = 'http://localhost:3000';
  const log = console.log;
  try {
    log('--- Test: partial receive and receipt endpoint ---');

    // Create transaction
    let res = await fetch(base + '/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'Teste', dueDate: '2026-02-01', description: 'Teste Recibo', person: 'Cliente Teste', value: 100, valueDue: 100, paid: false, status: 'pendente' }) });
    if (!res.ok) throw new Error('Failed to create transaction: ' + res.status);
    const tx = await res.json(); log('Created transaction:', tx.id);

    // Partial receive (should create a receipt)
    res = await fetch(base + '/api/transactions/' + tx.id + '/receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 20, method: 'cash', note: 'Teste parcial' }) });
    if (!res.ok) {
      const body = await res.text();
      throw new Error('Receive failed: ' + res.status + ' body: ' + body);
    }
    const recv = await res.json();
    log('Receive response:', recv);

    if (!recv || !recv.id) throw new Error('No receipt id returned');

    // Fetch receipt PDF endpoint
    res = await fetch(base + '/api/receipts/' + recv.id + '/pdf');
    log('PDF endpoint status:', res.status, 'Content-Type:', res.headers.get('content-type'));
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && (ct.includes('application/pdf') || ct.includes('text/html'))) {
      log('Receipt endpoint OK for', recv.id);
    } else {
      const text = await res.text();
      console.error('Unexpected receipt response:', text.slice ? text.slice(0,400) : text);
      throw new Error('Receipt endpoint returned unexpected content-type: ' + ct);
    }

    // cleanup
    res = await fetch(base + '/api/transactions/' + tx.id, { method: 'DELETE' });
    log('Deleted transaction status:', res.status);

    log('Test completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(2);
  }
})();