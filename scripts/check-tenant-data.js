/**
 * Script para verificar dados nos bancos de dados (principal vs tenants)
 * Ajuda a diagnosticar problemas de isolamento de dados
 */

const path = require('path');
const fs = require('fs');

async function main() {
  console.log('='.repeat(60));
  console.log('  DIAGNÓSTICO DE ISOLAMENTO DE DADOS POR TENANT');
  console.log('='.repeat(60));
  
  // 1. Verificar banco principal
  console.log('\n📦 BANCO PRINCIPAL (gestao_comercial.db):');
  const mainDbPath = path.join(__dirname, '../server/gestao_comercial.db');
  
  if (!fs.existsSync(mainDbPath)) {
    console.log('   ❌ Banco principal não encontrado!');
    return;
  }
  
  const sqlite = require('better-sqlite3');
  const mainDb = new sqlite(mainDbPath);
  
  // Contar registros no banco principal
  const tables = ['produtos', 'pessoas', 'vendas', 'departamentos', 'fornecedores'];
  
  console.log('   Contagem de registros:');
  for (const table of tables) {
    try {
      const count = mainDb.prepare(`SELECT COUNT(*) as c FROM ${table}`).get();
      console.log(`   - ${table}: ${count.c} registros`);
    } catch (e) {
      console.log(`   - ${table}: tabela não existe`);
    }
  }
  
  // Listar tenants
  console.log('\n👥 TENANTS CADASTRADOS:');
  try {
    const tenants = mainDb.prepare('SELECT id, name, slug, database_name, status FROM tenants').all();
    if (tenants.length === 0) {
      console.log('   Nenhum tenant cadastrado');
    }
    for (const t of tenants) {
      console.log(`   - ${t.name} (${t.slug})`);
      console.log(`     ID: ${t.id}`);
      console.log(`     DB: ${t.database_name}`);
      console.log(`     Status: ${t.status}`);
      
      // Verificar banco do tenant
      const tenantDbPath = path.join(__dirname, '../server/tenants', t.database_name);
      if (fs.existsSync(tenantDbPath)) {
        console.log(`     ✅ Arquivo do banco existe`);
        
        // Abrir e verificar dados
        const tenantDb = new sqlite(tenantDbPath);
        console.log('     Contagem de registros no tenant:');
        for (const table of tables) {
          try {
            const count = tenantDb.prepare(`SELECT COUNT(*) as c FROM ${table}`).get();
            console.log(`       - ${table}: ${count.c} registros`);
          } catch (e) {
            console.log(`       - ${table}: tabela não existe`);
          }
        }
        tenantDb.close();
      } else {
        console.log(`     ❌ Arquivo do banco NÃO existe!`);
      }
    }
  } catch (e) {
    console.log('   Erro ao listar tenants:', e.message);
  }
  
  // Listar usuários
  console.log('\n👤 USUÁRIOS CADASTRADOS:');
  try {
    const users = mainDb.prepare(`
      SELECT u.username, u.name, u.role, u.tenant_id, t.name as tenant_name 
      FROM auth_users u 
      LEFT JOIN tenants t ON u.tenant_id = t.id
    `).all();
    
    for (const u of users) {
      console.log(`   - ${u.username} (${u.role})`);
      console.log(`     Nome: ${u.name}`);
      console.log(`     Tenant: ${u.tenant_name || 'NENHUM (banco principal)'}`);
      console.log(`     Tenant ID: ${u.tenant_id || 'NULL'}`);
    }
  } catch (e) {
    console.log('   Erro ao listar usuários:', e.message);
  }
  
  mainDb.close();
  
  console.log('\n' + '='.repeat(60));
  console.log('  DIAGNÓSTICO CONCLUÍDO');
  console.log('='.repeat(60));
  
  console.log('\n⚠️  PROBLEMA IDENTIFICADO:');
  console.log('   Se o banco principal tem dados e o banco do tenant está vazio,');
  console.log('   o usuário do tenant está vendo dados do banco principal!');
  console.log('\n💡 SOLUÇÕES:');
  console.log('   1. Limpar dados do banco principal (para entrega limpa)');
  console.log('   2. Migrar dados do banco principal para o banco do tenant');
  console.log('   3. Verificar se o middleware de tenant está funcionando');
}

main().catch(console.error);
