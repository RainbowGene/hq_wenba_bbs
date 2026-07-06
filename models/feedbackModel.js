const pool = require("./db");

const feedbackModel = {
  // 提交反馈
  create: async (userId, content) => {
    const [result] = await pool.query(
      "INSERT INTO feedbacks (user_id, content) VALUES (?, ?)",
      [userId, content],
    );
    return result.insertId;
  },

  // 获取反馈列表（联用户，分页）
  list: async (page = 1, size = 20) => {
    const offset = (page - 1) * size;
    const [rows] = await pool.query(
      `SELECT f.*, u.username, u.nickname
       FROM feedbacks f
       JOIN users u ON f.user_id = u.id
       ORDER BY f.created_at DESC
       LIMIT ?, ?`,
      [offset, size],
    );
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) as total FROM feedbacks",
    );
    return { list: rows, total, page };
  },

  // 获取单个反馈
  findById: async (id) => {
    const [rows] = await pool.query(
      `SELECT f.*, u.username, u.nickname
       FROM feedbacks f JOIN users u ON f.user_id = u.id
       WHERE f.id = ?`,
      [id],
    );
    return rows[0] || null;
  },

  // 管理员回复
  reply: async (id, replyContent) => {
    const [result] = await pool.query(
      "UPDATE feedbacks SET reply = ?, replied_at = NOW() WHERE id = ?",
      [replyContent, id],
    );
    return result.affectedRows > 0;
  },

  // 获取用户的反馈列表
  getByUser: async (userId) => {
    const [rows] = await pool.query(
      "SELECT * FROM feedbacks WHERE user_id = ? ORDER BY created_at DESC",
      [userId],
    );
    return rows;
  },
};

module.exports = feedbackModel;
