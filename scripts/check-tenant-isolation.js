/**
 * Script para atualizar endpoints do index.js para usar isolamento de tenant
 * 
 * Este script modifica os endpoints para usar getDatabase(req) ao invés de db diretamente
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'server', 'index.js');
let content = fs.readFileSync(indexPath, 'utf8');

// Lista de endpoints que precisam de isolamento (tabelas de negócio)
// Esses são os recursos que cada empresa deve ter separados
const endpointsToIsolate = [
    // Produtos
    '/api/products',
    // Pessoas (clientes/fornecedores)
    '/api/pessoas',
    '/api/people',
    // Vendas
    '/api/sales',
    '/api/vendas',
    // Estoque
    '/api/estoque',
    '/api/stock',
    // Agenda
    '/api/agenda',
    // Empresas (dados da empresa do tenant)
    '/api/empresas',
    // Departamentos
    '/api/departamentos',
    // Movimentos/Financeiro
    '/api/transactions',
    '/api/transacoes',
    '/api/receipts',
    // Dashboard
    '/api/dashboard'
];

// Padrão para encontrar handlers de endpoint que usam db.query
// Procura por: try { ... await db.query
const regex = /app\.(get|post|put|delete)\s*\(\s*['"`]\/api\/(products|pessoas|people|sales|vendas|estoque|stock|agenda|empresas|departamentos|transactions|transacoes|receipts|dashboard)/g;

let matches = content.match(regex);
console.log(`Encontrados ${matches ? matches.length : 0} endpoints para modificar`);

// Estratégia: Adicionar no início de cada handler try { const tenantDb = getDatabase(req);
// E substituir db.query por tenantDb.query apenas dentro desse bloco

// Primeiro, vamos fazer uma substituição mais segura:
// Procurar padrões específicos e substituir

// Padrão: "await db.query" dentro de endpoints de negócio
// Vamos substituir apenas se estiver em um contexto de endpoint de negócio

// Abordagem mais segura: adicionar comentário indicando que precisa usar tenant
// e fazer a substituição manualmente nos blocos identificados

// Por enquanto, vamos listar onde precisamos fazer as mudanças
const lines = content.split('\n');
const linesToModify = [];

let inBusinessEndpoint = false;
let currentEndpoint = '';

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detectar início de endpoint de negócio
    const endpointMatch = line.match(/app\.(get|post|put|delete)\s*\(\s*['"`](\/api\/(products|pessoas|people|sales|vendas|estoque|stock|agenda|empresas|departamentos|transactions|transacoes|receipts|dashboard))/);
    if (endpointMatch) {
        inBusinessEndpoint = true;
        currentEndpoint = endpointMatch[2];
    }
    
    // Detectar db.query que precisa ser substituído
    if (inBusinessEndpoint && line.includes('db.query') && !line.includes('tenantDb.query') && !line.includes('masterDb.query')) {
        linesToModify.push({
            line: i + 1,
            content: line.trim(),
            endpoint: currentEndpoint
        });
    }
    
    // Detectar fim de endpoint (próximo endpoint ou fechamento de bloco grande)
    if (inBusinessEndpoint && (line.match(/^\s*app\.(get|post|put|delete)/) && !endpointMatch)) {
        inBusinessEndpoint = false;
    }
}

console.log(`\n📋 Linhas que precisam ser modificadas (db.query -> tenantDb.query):\n`);
linesToModify.forEach(item => {
    console.log(`Linha ${item.line}: ${item.endpoint}`);
    console.log(`   ${item.content.substring(0, 80)}...`);
});

console.log(`\n✅ Total: ${linesToModify.length} ocorrências`);
console.log('\n💡 Para cada endpoint, adicione no início do try block:');
console.log('   const tenantDb = getDatabase(req);');
console.log('   E substitua db.query por tenantDb.query');
