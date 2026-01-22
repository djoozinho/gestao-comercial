const db = require('../database');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  await db.initializeDatabase();
  const dbType = db.getDatabaseType();
  console.log('📦 Tipo de banco:', dbType);

  try {
    // Empresa padrão
    const companyId = 'empresa_default';
    const compExists = await db.query('SELECT id FROM empresas WHERE id = ?', [companyId]);
    if (!compExists || compExists.length === 0) {
      try {
        await db.query(`INSERT INTO empresas (id, razao_social, nome_fantasia, cnpj, email) VALUES (?, ?, ?, ?, ?)`, [companyId, 'Empresa Padrão LTDA', 'Minha Empresa', '00.000.000/0000-00', 'contato@empresa.local']);
        console.log('✅ Empresa padrão criada');
      } catch (e) {
        // fallback caso colunas diferentes
        try { await db.query(`INSERT INTO empresas (id, razao_social, nome_fantasia) VALUES (?, ?, ?)`, [companyId, 'Empresa Padrão LTDA', 'Minha Empresa']); console.log('✅ Empresa padrão criada (fallback)'); } catch (e2) { console.warn('⚠️ Falha ao inserir empresa:', e2.message || e2); }
      }
    } else console.log('ℹ️ Empresa padrão já existe');

    // Usuário admin
    const adminId = 'admin';
    const adminExists = await db.query('SELECT id FROM users WHERE id = ?', [adminId]);
    if (!adminExists || adminExists.length === 0) {
      try {
        await db.query(`INSERT INTO users (id, name, email, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)`, [adminId, 'Admin', 'admin@local', 'admin', 1, JSON.stringify({ superadmin: true })]);
        console.log('✅ Usuário admin criado');
      } catch (e) {
        try { await db.query(`INSERT INTO users (id, name, email, role, active) VALUES (?, ?, ?, ?, ?)`, [adminId, 'Admin', 'admin@local', 'admin', 1]); console.log('✅ Usuário admin criado (fallback)'); } catch (e2) { console.warn('⚠️ Falha ao inserir usuário admin:', e2.message || e2); }
      }
    } else console.log('ℹ️ Usuário admin já existe');

    // Cliente padrão
    const clientId = 'cliente_padrao';
    const clientExists = await db.query('SELECT id FROM pessoas WHERE id = ?', [clientId]);
    if (!clientExists || clientExists.length === 0) {
      try {
        await db.query(`INSERT INTO pessoas (id, name, type, email, phone) VALUES (?, ?, ?, ?, ?)`, [clientId, 'Cliente Padrão', 'Cliente', 'cliente@local', '00000000000']);
        console.log('✅ Cliente padrão criado');
      } catch (e) { console.warn('⚠️ Falha ao inserir cliente padrão:', e.message || e); }
    } else console.log('ℹ️ Cliente padrão já existe');

    // Produto exemplo
    const prodId = 'prod_padrao';
    const prodExists = await db.query('SELECT id FROM produtos WHERE id = ?', [prodId]);
    if (!prodExists || prodExists.length === 0) {
      try {
        await db.query(`INSERT INTO produtos (id, name, sku, price, cost, stock) VALUES (?, ?, ?, ?, ?, ?)`, [prodId, 'Produto Exemplo', 'SKU-0001', 10.00, 5.00, 100]);
        console.log('✅ Produto exemplo criado');
      } catch (e) { console.warn('⚠️ Falha ao inserir produto exemplo:', e.message || e); }
    } else console.log('ℹ️ Produto exemplo já existe');

    // Contagens rápidas
    const tables = ['empresas','users','pessoas','produtos'];
    const counts = {};
    for (const t of tables) {
      try { const r = await db.query(`SELECT COUNT(*) as c FROM ${t}`); counts[t] = r && r[0] && (r[0].c || r[0].count || 0) || 0; } catch(e){ counts[t] = null; }
    }

    console.log('\n🔍 Contagens após seed:');
    console.log(JSON.stringify(counts, null, 2));

    console.log('\n🎉 Seed mínimo concluído com sucesso.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro no seed:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

seed();