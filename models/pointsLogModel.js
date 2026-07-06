const pool = require("./db");

const pointsLogModel = {
  // 记录积分变动（conn 可选，用于事务）
  record: async (
    userId,
    changeAmount,
    type,
    description = null,
    conn = null,
  ) => {
    const db = conn || pool;
    await db.query(
      "INSERT INTO points_log (user_id, change_amount, type, description) VALUES (?, ?, ?, ?)",
      [userId, changeAmount, type, description],
    );
  },

  // 获取用户积分日志
  getByUser: async (userId, page = 1, size = 20) => {
    const offset = (page - 1) * size;
    const [rows] = await pool.query(
      "SELECT * FROM points_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?, ?",
      [userId, offset, size],
    );
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) as total FROM points_log WHERE user_id = ?",
      [userId],
    );
    return { list: rows, total, page };
  },

  // 检查某日是否已有某类型日志（例如每日登录奖励）
  hasTodayRecord: async (userId, type) => {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await pool.query(
      "SELECT id FROM points_log WHERE user_id = ? AND type = ? AND DATE(created_at) = ?",
      [userId, type, today],
    );
    return rows.length > 0;
  },
};

module.exports = pointsLogModel;
