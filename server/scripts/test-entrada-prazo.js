/**
 * Teste: Venda a prazo com entrada
 * 
 * Cenário: Venda de R$10,00 dividida em 2x, com R$2,00 de entrada
 * Resultado esperado: 2 parcelas de R$4,00 cada (não R$5,00)
 */

const axios = require('axios');
const API = 'http://localhost:3000/api';

async function test() {
  console.log('='.repeat(60));
  console.log('Teste: Venda a prazo R$10,00 em 2x com R$2,00 de entrada');
  console.log('='.repeat(60));

  try {
    // 1. Verificar/Criar um produto de teste
    let productId = null;
    try {
      const prodRes = await axios.get(`${API}/products?search=TESTE-ENTRADA`);
      if (prodRes.data && prodRes.data.data && prodRes.data.data.length > 0) {
        productId = prodRes.data.data[0].id;
        console.log(`✓ Produto existente encontrado: ${productId}`);
      }
    } catch (e) {}

    if (!productId) {
      const newProd = await axios.post(`${API}/products`, {
        name: 'TESTE-ENTRADA',
        code: 'TEST-ENT-001',
        price: 10.00,
        stock: 100,
        category: 'Teste'
      });
      productId = newProd.data.id;
      console.log(`✓ Produto criado: ${productId}`);
    }

    // 2. Criar venda a prazo: R$10 em 2x com R$2 de entrada
    const salePayload = {
      clientName: 'Cliente Teste Entrada',
      subtotal: 10.00,
      discount: 0,
      total: 10.00,
      paymentMethod: 'prazo',
      amountPaid: 2.00,  // ENTRADA!
      changeAmount: 0,
      installments: 2,
      notes: 'Teste de entrada em venda parcelada',
      items: [{
        productId: productId,
        productName: 'TESTE-ENTRADA',
        quantity: 1,
        unitPrice: 10.00,
        totalPrice: 10.00
      }]
    };

    console.log('\n📤 Criando venda a prazo...');
    console.log(`   Total: R$10,00 | Entrada: R$2,00 | Parcelas: 2x`);
    
    const saleRes = await axios.post(`${API}/sales`, salePayload);
    const saleData = saleRes.data;
    
    console.log(`✓ Venda criada: ${saleData.id}`);
    console.log(`✓ Transações criadas: ${saleData.transactions.length}`);
    console.log(`✓ Recibos criados: ${saleData.receipts.length}`);

    // 3. Verificar as transações criadas
    console.log('\n📊 Verificando parcelas criadas:');
    
    let totalParcelas = 0;
    let allCorrect = true;
    
    for (const txId of saleData.transactions) {
      const txRes = await axios.get(`${API}/transactions/${txId}`);
      const tx = txRes.data;
      
      const valor = parseFloat(tx.value || 0);
      const valorDue = parseFloat(tx.value_due || 0);
      
      console.log(`   - Parcela: R$${valor.toFixed(2)} | Saldo: R$${valorDue.toFixed(2)} | ${tx.description}`);
      
      totalParcelas += valor;
      
      // Cada parcela deve ser R$4,00 (não R$5,00)
      if (Math.abs(valor - 4.00) > 0.01) {
        console.log(`   ❌ ERRO: Valor deveria ser R$4,00, mas é R$${valor.toFixed(2)}`);
        allCorrect = false;
      }
    }

    // 4. Verificar recibos (entrada)
    console.log('\n💵 Verificando recibos (entrada):');
    for (const recId of saleData.receipts) {
      const recRes = await axios.get(`${API}/receipts/${recId}`);
      const rec = recRes.data.data;
      console.log(`   - Recibo: R$${parseFloat(rec.amount).toFixed(2)} | ${rec.note || rec.method}`);
    }

    // 5. Resultado final
    console.log('\n' + '='.repeat(60));
    
    const expectedPerInstallment = (10.00 - 2.00) / 2; // R$4,00
    
    if (allCorrect && Math.abs(totalParcelas - 8.00) < 0.01) {
      console.log('✅ TESTE PASSOU!');
      console.log(`   Venda R$10 com entrada R$2 → 2x R$${expectedPerInstallment.toFixed(2)} ✓`);
    } else {
      console.log('❌ TESTE FALHOU!');
      console.log(`   Esperado: 2x R$4,00 (total parcelas: R$8,00)`);
      console.log(`   Obtido: Total parcelas: R$${totalParcelas.toFixed(2)}`);
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Erro no teste:', error.response?.data || error.message);
  }
}

test();
