/**
 * Teste direto da função listTenants
 */

const database = require('../server/database');
const auth = require('../server/auth');

async function test() {
    console.log('🔧 Inicializando banco...');
    await database.initializeDatabase();
    
    console.log('🔧 Inicializando auth...');
    await auth.initializeMasterDb(database);
    
    console.log('\n📋 Testando listTenants()...');
    const result = await auth.listTenants();
    
    console.log('\n📦 Resultado:');
    console.log('success:', result.success);
    console.log('tenants:', JSON.stringify(result.tenants, null, 2));
    
    process.exit(0);
}

test().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
