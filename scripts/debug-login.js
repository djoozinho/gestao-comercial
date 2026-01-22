const db = require('better-sqlite3')('c:/Users/JOAO/Desktop/SOFTWARE/server/gestao_comercial.db');
const bcrypt = require('bcryptjs');

const username = 'superadmin';
const password = 'SuperAdmin@2026';

console.log('Testando login para:', username);

// Query igual à do auth.js
const result = db.prepare(`
    SELECT u.*, t.id as tid, t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status 
    FROM auth_users u 
    LEFT JOIN tenants t ON u.tenant_id = t.id 
    WHERE u.username = ?
`).get(username);

console.log('\nResultado da query:');
console.log(JSON.stringify(result, null, 2));

if (result) {
    console.log('\nVerificando senha...');
    const valid = bcrypt.compareSync(password, result.password_hash);
    console.log('Senha válida:', valid);
}
