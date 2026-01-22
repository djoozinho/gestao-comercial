const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'gestao_comercial.db'));
const rows = db.prepare(`SELECT vi.product_id, vi.product_name, COUNT(*) as cnt FROM vendas_itens vi LEFT JOIN produtos p ON vi.product_id = p.id WHERE p.id IS NULL GROUP BY vi.product_id ORDER BY cnt DESC`).all();
console.log(rows);
db.close();
