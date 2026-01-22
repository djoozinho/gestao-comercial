// Script de migração para adicionar novos campos na tabela produtos
const db = require('./database');

async function migrate() {
  console.log('===========================================');
  console.log('  Migração da Tabela Produtos');
  console.log('===========================================\n');

  try {
    await db.initializeDatabase();
    console.log('✓ Conectado ao banco de dados\n');

    console.log('Adicionando novas colunas...');

    const migrations = [
      { sql: "ALTER TABLE produtos ADD COLUMN code VARCHAR(50)", name: "code" },
      { sql: "ALTER TABLE produtos ADD COLUMN unit VARCHAR(10) DEFAULT 'UN'", name: "unit" },
      { sql: "ALTER TABLE produtos ADD COLUMN short_description VARCHAR(100)", name: "short_description" },
      { sql: "ALTER TABLE produtos ADD COLUMN sub_category VARCHAR(100)", name: "sub_category" },
      { sql: "ALTER TABLE produtos ADD COLUMN brand VARCHAR(100)", name: "brand" },
      { sql: "ALTER TABLE produtos ADD COLUMN photo TEXT", name: "photo" },
      { sql: "ALTER TABLE produtos ADD COLUMN margin REAL DEFAULT 0", name: "margin" }
    ];

    for (const migration of migrations) {
      try {
        await db.query(migration.sql);
        console.log(`✓ Coluna ${migration.name} adicionada`);
      } catch (error) {
        if (error.message.includes('duplicate column')) {
          console.log(`• Coluna ${migration.name} já existe`);
        } else {
          console.error(`✗ Erro ao adicionar ${migration.name}: ${error.message}`);
        }
      }
    }

    // Adicionar índices
    console.log('\nAdicionando índices...');
    try {
      await db.query("CREATE INDEX IF NOT EXISTS idx_code ON produtos(code)");
      console.log('✓ Índice idx_code adicionado');
    } catch (e) {
      console.log('• Erro ao adicionar índice idx_code:', e.message);
    }

    try {
      await db.query("CREATE INDEX IF NOT EXISTS idx_brand ON produtos(brand)");
      console.log('✓ Índice idx_brand adicionado');
    } catch (e) {
      console.log('• Erro ao adicionar índice idx_brand:', e.message);
    }

    // Atualizar códigos para registros existentes
    console.log('\nAtualizando códigos dos registros existentes...');
    
    try {
      const produtos = await db.query("SELECT id, code FROM produtos WHERE code IS NULL OR code = ''");
      
      if (produtos.length > 0) {
        for (let i = 0; i < produtos.length; i++) {
          await db.query("UPDATE produtos SET code = ? WHERE id = ?", [`PROD${Date.now() + i}`, produtos[i].id]);
        }
        console.log(`✓ ${produtos.length} registro(s) atualizado(s) com códigos`);
      } else {
        console.log('• Todos os registros já possuem código');
      }
    } catch (e) {
      console.log('• Não foi possível atualizar códigos:', e.message);
    }

    // Atualizar unidades para registros existentes
    console.log('\nAtualizando unidades dos registros existentes...');
    
    try {
      await db.query("UPDATE produtos SET unit = 'UN' WHERE unit IS NULL OR unit = ''");
      console.log('✓ Unidades atualizadas para UN (padrão)');
    } catch (e) {
      console.log('• Não foi possível atualizar unidades:', e.message);
    }

    console.log('\n===========================================');
    console.log('  Migração concluída com sucesso!');
    console.log('===========================================\n');

    console.log('Novas colunas adicionadas:');
    console.log('  • code (Código interno)');
    console.log('  • unit (Unidade de medida)');
    console.log('  • short_description (Descrição reduzida)');
    console.log('  • sub_category (Subgrupo)');
    console.log('  • brand (Marca)');
    console.log('  • photo (Foto em base64)');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Erro na migração:', error.message);
    console.error(error);
    process.exit(1);
  }
}

migrate();
