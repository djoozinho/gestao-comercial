// Script de migração para executar via Node.js
// Adiciona as novas colunas na tabela pessoas
const db = require('./database');

async function migrate() {
  console.log('===========================================');
  console.log('  Migração da Tabela Pessoas');
  console.log('===========================================\n');

  try {
    await db.initializeDatabase();
    console.log('✓ Conectado ao banco de dados\n');

    console.log('Adicionando novas colunas...');

    // SQLite não suporta ADD COLUMN IF NOT EXISTS nem múltiplas colunas
    // Precisamos adicionar uma por vez e tratar erros
    const migrations = [
      { sql: "ALTER TABLE pessoas ADD COLUMN code VARCHAR(50)", name: "code" },
      { sql: "ALTER TABLE pessoas ADD COLUMN fantasy_name VARCHAR(255)", name: "fantasy_name" },
      { sql: "ALTER TABLE pessoas ADD COLUMN legal_type VARCHAR(10) DEFAULT 'PF'", name: "legal_type" },
      { sql: "ALTER TABLE pessoas ADD COLUMN rg_ie VARCHAR(50)", name: "rg_ie" },
      { sql: "ALTER TABLE pessoas ADD COLUMN birth_date DATE", name: "birth_date" },
      { sql: "ALTER TABLE pessoas ADD COLUMN gender VARCHAR(1)", name: "gender" },
      { sql: "ALTER TABLE pessoas ADD COLUMN phone2 VARCHAR(50)", name: "phone2" },
      { sql: "ALTER TABLE pessoas ADD COLUMN cep VARCHAR(10)", name: "cep" },
      { sql: "ALTER TABLE pessoas ADD COLUMN street VARCHAR(255)", name: "street" },
      { sql: "ALTER TABLE pessoas ADD COLUMN number VARCHAR(20)", name: "number" },
      { sql: "ALTER TABLE pessoas ADD COLUMN complement VARCHAR(100)", name: "complement" },
      { sql: "ALTER TABLE pessoas ADD COLUMN neighborhood VARCHAR(100)", name: "neighborhood" },
      { sql: "ALTER TABLE pessoas ADD COLUMN city VARCHAR(100)", name: "city" },
      { sql: "ALTER TABLE pessoas ADD COLUMN state VARCHAR(2)", name: "state" },
      { sql: "ALTER TABLE pessoas ADD COLUMN reference VARCHAR(255)", name: "reference" },
      { sql: "ALTER TABLE pessoas ADD COLUMN photo TEXT", name: "photo" }
    ];

    for (const migration of migrations) {
      try {
        await db.query(migration.sql);
        console.log(`✓ Coluna ${migration.name} adicionada`);
      } catch (error) {
        // Ignora erros de colunas que já existem
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
      await db.query("CREATE INDEX IF NOT EXISTS idx_code ON pessoas(code)");
      console.log('✓ Índice idx_code adicionado');
    } catch (e) {
      console.log('• Erro ao adicionar índice idx_code:', e.message);
    }

    try {
      await db.query("CREATE INDEX IF NOT EXISTS idx_document ON pessoas(document)");
      console.log('✓ Índice idx_document adicionado');
    } catch (e) {
      console.log('• Erro ao adicionar índice idx_document:', e.message);
    }

    // Atualizar códigos para registros existentes
    console.log('\nAtualizando códigos dos registros existentes...');
    
    // Verificar se a coluna code existe antes de tentar usá-la
    try {
      const pessoas = await db.query("SELECT id, code FROM pessoas WHERE code IS NULL OR code = ''");
      
      if (pessoas.length > 0) {
        for (let i = 0; i < pessoas.length; i++) {
          await db.query("UPDATE pessoas SET code = ? WHERE id = ?", [(i + 1).toString(), pessoas[i].id]);
        }
        console.log(`✓ ${pessoas.length} registro(s) atualizado(s) com códigos sequenciais`);
      } else {
        console.log('• Todos os registros já possuem código');
      }
    } catch (e) {
      console.log('• Não foi possível atualizar códigos:', e.message);
    }

    console.log('\n===========================================');
    console.log('  Migração concluída com sucesso!');
    console.log('===========================================\n');

    console.log('Novas colunas adicionadas:');
    console.log('  • code (Código interno)');
    console.log('  • fantasy_name (Nome fantasia)');
    console.log('  • legal_type (Tipo de pessoa: PF/PJ)');
    console.log('  • rg_ie (RG ou Inscrição Estadual)');
    console.log('  • birth_date (Data de nascimento)');
    console.log('  • gender (Sexo)');
    console.log('  • phone2 (Telefone secundário)');
    console.log('  • cep, street, number, complement');
    console.log('  • neighborhood, city, state, reference');
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
