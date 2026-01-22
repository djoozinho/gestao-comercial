/**
 * Script para adicionar auth-guard.js a todas as páginas HTML
 * Execute com: node scripts/add-auth-guard.js
 */

const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, '..', 'frontend');
const authGuardScript = '  <!-- Auth Guard - Proteção de acesso -->\n  <script src="js/auth-guard.js"></script>';

// Páginas que NÃO precisam de proteção
const excludedPages = ['login.html', 'index.html'];

// Páginas HTML no diretório frontend
const htmlFiles = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html'));

let updated = 0;
let skipped = 0;

for (const file of htmlFiles) {
    if (excludedPages.includes(file)) {
        console.log(`⏭️  Pulando ${file} (página pública)`);
        skipped++;
        continue;
    }
    
    const filePath = path.join(frontendDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Verificar se já tem o auth-guard
    if (content.includes('auth-guard.js')) {
        console.log(`✅ ${file} já tem auth-guard`);
        skipped++;
        continue;
    }
    
    // Adicionar antes do </head> ou antes do primeiro <style>
    // Padrão: após o último link stylesheet antes de <style> ou </head>
    let insertPoint;
    
    // Encontrar o melhor ponto de inserção
    const headEndMatch = content.match(/<\/head>/i);
    const styleMatch = content.match(/<style/i);
    const lastLinkMatch = content.match(/(<link[^>]*stylesheet[^>]*>)\s*(\n\s*)?(<style|<\/head>)/i);
    
    if (lastLinkMatch) {
        // Inserir após o último link e antes de <style> ou </head>
        const insertIndex = content.indexOf(lastLinkMatch[0]) + lastLinkMatch[1].length;
        content = content.slice(0, insertIndex) + '\n' + authGuardScript + content.slice(insertIndex);
    } else if (headEndMatch) {
        // Inserir antes de </head>
        content = content.replace('</head>', authGuardScript + '\n</head>');
    } else {
        console.log(`⚠️  ${file} - estrutura não reconhecida`);
        skipped++;
        continue;
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✏️  ${file} atualizado`);
    updated++;
}

console.log(`\n📊 Resumo: ${updated} atualizados, ${skipped} pulados`);
