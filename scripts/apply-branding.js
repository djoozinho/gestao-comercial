/**
 * Script para adicionar branding.js a todas as páginas HTML
 * E substituir "IBRAIM E DANIEL" por "SISTEMA" (será substituído dinamicamente pelo branding.js)
 * 
 * Executar: node scripts/apply-branding.js
 */

const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, '..', 'frontend');

// Lista de arquivos HTML para processar
const htmlFiles = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html'));

console.log(`Encontrados ${htmlFiles.length} arquivos HTML para processar...\n`);

let modified = 0;

htmlFiles.forEach(file => {
  const filePath = path.join(frontendDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  let changed = false;
  
  // 1. Substituir "IBRAIM E DANIEL" por "SISTEMA" no sidebar h4
  if (content.includes('IBRAIM E DANIEL')) {
    content = content.replace(/<h4>IBRAIM E DANIEL<\/h4>/gi, '<h4>SISTEMA</h4>');
    content = content.replace(/IBRAIM E DANIEL/gi, 'Sistema');
    changed = true;
    console.log(`[${file}] Substituído "IBRAIM E DANIEL" por "SISTEMA"`);
  }
  
  // 2. Substituir título da página
  const titleRegex = /(<title>)([^<]*)(- Ibraim e Daniel|Ibraim e Daniel)([^<]*)(<\/title>)/gi;
  if (titleRegex.test(content)) {
    content = content.replace(titleRegex, '$1$2- Sistema$4$5');
    changed = true;
    console.log(`[${file}] Atualizado título da página`);
  }
  
  // 3. Adicionar branding.js se não existir
  if (!content.includes('js/branding.js')) {
    // Inserir após auth-guard.js ou após </head> se não existir
    if (content.includes('js/auth-guard.js')) {
      content = content.replace(
        /<script src="js\/auth-guard\.js"><\/script>/,
        '<script src="js/auth-guard.js"></script>\n  <script src="js/branding.js"></script>'
      );
      changed = true;
      console.log(`[${file}] Adicionado branding.js após auth-guard.js`);
    } else if (content.includes('</head>')) {
      content = content.replace(
        '</head>',
        '  <script src="js/branding.js"></script>\n</head>'
      );
      changed = true;
      console.log(`[${file}] Adicionado branding.js antes de </head>`);
    }
  }
  
  // 4. Atualizar textos de boas-vindas específicos
  if (content.includes('Bem-vindo ao Ibraim e Daniel')) {
    content = content.replace(/Bem-vindo ao Ibraim e Daniel/gi, 'Bem-vindo ao Sistema');
    changed = true;
    console.log(`[${file}] Atualizado texto de boas-vindas`);
  }
  
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf-8');
    modified++;
  }
});

console.log(`\n✅ Processamento concluído! ${modified} arquivos modificados.`);
console.log('\nLembre-se: O branding.js irá substituir "SISTEMA" pelo nome da empresa do cliente automaticamente!');
