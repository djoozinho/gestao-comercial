/**
 * Script para aplicar isolamento de tenant no index.js
 * 
 * Substitui db.query por getDatabase(req).query nos endpoints de negócio
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'server', 'index.js');
let content = fs.readFileSync(indexPath, 'utf8');

// Padrões de endpoint que precisam de isolamento (recursos de negócio por empresa)
const businessEndpoints = [
    '/api/products',
    '/api/pessoas', 
    '/api/people',
    '/api/sales',
    '/api/vendas',
    '/api/estoque',
    '/api/agenda',
    '/api/empresas',
    '/api/departamentos',
    '/api/transactions',
    '/api/transacoes',
    '/api/receipts',
    '/api/dashboard'
];

// Criar regex para detectar blocos de endpoints
const endpointPattern = businessEndpoints.map(e => e.replace(/\//g, '\\/')).join('|');

let lines = content.split('\n');
let modified = 0;
let inBusinessEndpoint = false;
let braceCount = 0;
let tryBlockStart = -1;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detectar início de endpoint de negócio
    const endpointRegex = new RegExp(`app\\.(get|post|put|delete)\\s*\\(\\s*['"\`](${endpointPattern})`);
    if (endpointRegex.test(line)) {
        inBusinessEndpoint = true;
        braceCount = 0;
        tryBlockStart = -1;
    }
    
    // Contar chaves para saber quando o endpoint termina
    if (inBusinessEndpoint) {
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
        
        // Detectar início do try block
        if (line.includes('try {') && tryBlockStart === -1) {
            tryBlockStart = i;
        }
        
        // Substituir db.query por getDatabase(req).query
        if (line.includes('db.query') && !line.includes('tenantDb.query') && !line.includes('masterDb.query') && !line.includes('getDatabase')) {
            lines[i] = line.replace(/(\s*)await db\.query/g, '$1await getDatabase(req).query');
            lines[i] = lines[i].replace(/(\s*)db\.query/g, '$1getDatabase(req).query');
            modified++;
        }
        
        // Fim do endpoint
        if (braceCount <= 0 && i > tryBlockStart) {
            inBusinessEndpoint = false;
        }
    }
}

// Salvar arquivo modificado
fs.writeFileSync(indexPath, lines.join('\n'));

console.log(`✅ Modificadas ${modified} ocorrências de db.query para getDatabase(req).query`);
console.log(`📁 Arquivo salvo: ${indexPath}`);
