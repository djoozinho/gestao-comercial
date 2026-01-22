/**
 * Teste direto do login - bypass do servidor HTTP
 */

const path = require('path');

// Configurar caminho do banco
process.chdir(path.join(__dirname, '..'));

const db = require('../server/database');
const auth = require('../server/auth');

async function test() {
    console.log('🔧 Inicializando banco de dados...');
    await db.initializeDatabase();
    
    console.log('🔧 Inicializando autenticação...');
    await auth.initializeMasterDb(db);
    
    console.log('\n🔐 Testando login superadmin...');
    const result = await auth.login('superadmin', 'SuperAdmin@2026', '127.0.0.1', 'Test');
    
    console.log('\n📦 Resultado:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
        console.log('\n✅ Login funcionou!');
    } else {
        console.log('\n❌ Login falhou:', result.error);
    }
    
    process.exit(0);
}

test().catch(err => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
});
