const mysql = require("mysql2/promise");
const config = require("../config/config");

const pool = mysql.createPool({
  host: config.db.host || "127.0.0.1",
  port: config.db.port || 3306,
  user: config.db.user || "root",
  password: config.db.password || "root",
  database: config.db.database || "wenba",
  connectionLimit: config.db.connectionLimit || 10,
  waitForConnections: true,
  queueLimit: 0,
});

// 测试连接
pool
  .getConnection()
  .then((conn) => {
    console.log("数据库连接成功");
    conn.release();
  })
  .catch((err) => {
    console.error("数据库连接失败:", err.message);
  });

module.exports = pool;
