const db = require('./database');

async function migrate() {
  console.log('===========================================');
  console.log('  Migração: Adicionar colunas de impostos e NCM em produtos');
  console.log('===========================================\n');

  try {
    await db.initializeDatabase();

    const migrations = [
      { sql: "ALTER TABLE produtos ADD COLUMN ncm VARCHAR(20)", name: 'ncm' },
      { sql: "ALTER TABLE produtos ADD COLUMN icms_value REAL DEFAULT 0", name: 'icms_value' },
      { sql: "ALTER TABLE produtos ADD COLUMN icms_rate REAL DEFAULT 0", name: 'icms_rate' },
      { sql: "ALTER TABLE produtos ADD COLUMN pis_value REAL DEFAULT 0", name: 'pis_value' },
      { sql: "ALTER TABLE produtos ADD COLUMN pis_rate REAL DEFAULT 0", name: 'pis_rate' },
      { sql: "ALTER TABLE produtos ADD COLUMN cofins_value REAL DEFAULT 0", name: 'cofins_value' },
      { sql: "ALTER TABLE produtos ADD COLUMN cofins_rate REAL DEFAULT 0", name: 'cofins_rate' },
      { sql: "ALTER TABLE produtos ADD COLUMN ipi_value REAL DEFAULT 0", name: 'ipi_value' },
      { sql: "ALTER TABLE produtos ADD COLUMN ipi_rate REAL DEFAULT 0", name: 'ipi_rate' }
    ];

    for (const m of migrations) {
      try {
        await db.query(m.sql);
        console.log(`✓ Coluna ${m.name} adicionada`);
      } catch (err) {
        if (err.message && (err.message.includes('duplicate column') || err.message.toLowerCase().includes('already exists'))) {
          console.log(`• Coluna ${m.name} já existe`);
        } else {
          console.error(`✗ Erro ao adicionar ${m.name}: ${err.message}`);
        }
      }
    }

    console.log('\nMigração concluída.');
    process.exit(0);
  } catch (err) {
    console.error('Erro na migração:', err);
    process.exit(1);
  }
}

migrate();