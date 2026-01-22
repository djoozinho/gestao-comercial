const sample = [
  { id: '1', category: 'Vendas', dueDate: '2018-04-14', description: 'VENDA Nº 35', person: 'João Marcio Rodrigues', value: 20.00, valueDue: 20.00, paid: false, status: 'vencido' },
  { id: '2', category: 'Vendas', dueDate: '2018-04-17', description: 'NOTA DE SERVIÇO Nº 1', person: 'João Marcio Rodrigues', value: 50.00, valueDue: 50.00, paid: false, status: 'vencido' },
  { id: '3', category: 'Aluguel', dueDate: '2018-04-18', description: 'JAILSON', person: 'LUIZA', value: -5.00, valueDue: 0.00, paid: true, status: 'pago' },
  { id: '4', category: 'Vendas', dueDate: '2018-04-18', description: 'VENDA Nº 110', person: 'Matheus Silva', value: 15.00, valueDue: 0.00, paid: true, status: 'pago' },
  { id: '5', category: 'Vendas', dueDate: '2018-04-18', description: 'VENDA Nº 111', person: 'João Marcio Rodrigues', value: 95.97, valueDue: 0.00, paid: true, status: 'pago' },
  { id: '6', category: 'Vendas', dueDate: '2018-04-18', description: 'VENDA Nº 114', person: 'João Marcio Rodrigues', value: 87.91, valueDue: 0.00, paid: true, status: 'pago' },
  { id: '7', category: 'Vendas', dueDate: '2018-04-18', description: 'VENDA Nº 115', person: 'Matheus Silva', value: 56.92, valueDue: 0.00, paid: true, status: 'pago' },
  { id: '8', category: 'Vendas', dueDate: '2018-04-18', description: 'VENDA Nº 116', person: 'Matheus Silva', value: 67.76, valueDue: 0.00, paid: true, status: 'pago' },
  { id: '9', category: 'Vendas', dueDate: '2018-04-18', description: 'VENDA Nº 117', person: 'Matheus Primon', value: 190.00, valueDue: 190.00, paid: false, status: 'vencido' },
  { id: '10', category: 'Pró labore', dueDate: '2018-04-19', description: '111111', person: 'Bianca Paula', value: 1111.00, valueDue: 0.00, paid: true, status: 'pago' }
];

function getInitial() {
  // return a shallow copy to avoid external mutation
  return sample.map(s => Object.assign({}, s));
}

const sampleProducts = [
  { id: 'prod_1', name: 'Camiseta Polo', sku: 'CP-001', price: 49.9, stock: 12, category: 'Produtos' },
  { id: 'prod_2', name: 'Caneca', sku: 'CN-001', price: 19.5, stock: 40, category: 'Produtos' }
];

const samplePeople = [
  { id: 'p_1', name: 'João Silva', email: 'joao@example.com', phone: '1199999-0001', type: 'Cliente' },
  { id: 'p_2', name: 'Loja Exemplo', email: 'contato@loja.com', phone: '1133333-4444', type: 'Fornecedor' }
];

function getInitialProducts(){ return sampleProducts.map(p=>Object.assign({}, p)); }
function getInitialPeople(){ return samplePeople.map(p=>Object.assign({}, p)); }

module.exports = { getInitial, getInitialProducts, getInitialPeople };
