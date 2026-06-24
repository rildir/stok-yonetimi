const mysql = require('mysql2/promise');

async function main() {
  try {
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      database: 'stok_yonetimi'
    });
    
    const [rows] = await connection.execute(
      "SELECT id, name, sku, quantity, warehouses FROM products WHERE isDeleted = 0"
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
  } catch (err) {
    console.error(err);
  }
}
main();
