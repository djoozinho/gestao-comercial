/**
 * Script de teste do sistema de autenticação
 */

const http = require('http');

function makeRequest(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });
        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function runTests() {
    console.log('🧪 Testando Sistema de Autenticação\n');
    console.log('='.repeat(50));
    
    // Teste 1: Login do Super Admin
    console.log('\n1. Testando login do Super Admin...');
    try {
        const loginResult = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/auth/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { username: 'superadmin', password: 'SuperAdmin@2026' });
        
        if (loginResult.status === 200 && loginResult.data.token) {
            console.log('   ✅ Login bem sucedido!');
            console.log(`   Token: ${loginResult.data.token.substring(0, 50)}...`);
            console.log(`   Role: ${loginResult.data.role}`);
            
            // Teste 2: Validar token
            console.log('\n2. Testando validação de token...');
            const validateResult = await makeRequest({
                hostname: 'localhost',
                port: 3000,
                path: '/api/auth/validate',
                method: 'GET',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${loginResult.data.token}`
                }
            });
            
            if (validateResult.data.valid) {
                console.log('   ✅ Token válido!');
                console.log(`   Usuário: ${validateResult.data.user.name}`);
            } else {
                console.log('   ❌ Token inválido');
            }
            
            // Teste 3: Listar tenants
            console.log('\n3. Testando listagem de empresas...');
            const tenantsResult = await makeRequest({
                hostname: 'localhost',
                port: 3000,
                path: '/api/auth/tenants',
                method: 'GET',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${loginResult.data.token}`
                }
            });
            
            if (Array.isArray(tenantsResult.data)) {
                console.log(`   ✅ ${tenantsResult.data.length} empresa(s) encontrada(s)`);
                tenantsResult.data.forEach(t => console.log(`      - ${t.name} (${t.status})`));
            }
            
        } else {
            console.log('   ❌ Falha no login');
            console.log(`   Status: ${loginResult.status}`);
            console.log(`   Erro: ${JSON.stringify(loginResult.data)}`);
        }
    } catch (error) {
        console.log(`   ❌ Erro: ${error.message}`);
    }
    
    // Teste 4: Login do Admin padrão
    console.log('\n4. Testando login do Admin padrão...');
    try {
        const adminResult = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/auth/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { username: 'admin', password: 'admin123' });
        
        if (adminResult.status === 200 && adminResult.data.token) {
            console.log('   ✅ Login do admin bem sucedido!');
            console.log(`   Role: ${adminResult.data.role}`);
            console.log(`   Empresa: ${adminResult.data.tenantName || 'N/A'}`);
        } else {
            console.log('   ❌ Falha no login do admin');
            console.log(`   Erro: ${JSON.stringify(adminResult.data)}`);
        }
    } catch (error) {
        console.log(`   ❌ Erro: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🏁 Testes concluídos!\n');
}

runTests().catch(console.error);
