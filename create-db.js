const mysql = require('mysql2/promise');

async function createDb() {
  try {
    const connection = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root' });
    await connection.query('CREATE DATABASE IF NOT EXISTS `stok_yonetimi`;');
    console.log('Database stok_yonetimi created or already exists.');
    await connection.end();
  } catch (err) {
    console.error('Error creating database:', err);
  }
}
createDb();
