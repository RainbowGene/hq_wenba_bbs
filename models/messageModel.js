const pool = require("./db");

const messageModel = {
  // 发送站内消息
  send: async (userId, fromAdminId, content) => {
    const [result] = await pool.query(
      "INSERT INTO user_messages (user_id, from_admin_id, content) VALUES (?, ?, ?)",
      [userId, fromAdminId, content],
    );
    return result.insertId;
  },

  // 获取用户的留言列表（带管理员昵称）
  getByUser: async (userId) => {
    const [rows] = await pool.query(
      `SELECT um.*, u.nickname as from_admin
       FROM user_messages um
       LEFT JOIN users u ON um.from_admin_id = u.id
       WHERE um.user_id = ?
       ORDER BY um.created_at DESC`,
      [userId],
    );
    return rows;
  },

  // 标记单条消息为已读
  markAsRead: async (messageId, userId) => {
    await pool.query(
      "UPDATE user_messages SET is_read = 1 WHERE id = ? AND user_id = ?",
      [messageId, userId],
    );
  },

  // 获取所有消息（管理端可查看，分页）
  listAll: async (page = 1, size = 20) => {
    const offset = (page - 1) * size;
    const [rows] = await pool.query(
      `SELECT um.*, u.username, u.nickname, a.nickname as admin_nickname
       FROM user_messages um
       JOIN users u ON um.user_id = u.id
       LEFT JOIN users a ON um.from_admin_id = a.id
       ORDER BY um.created_at DESC
       LIMIT ?, ?`,
      [offset, size],
    );
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) as total FROM user_messages",
    );
    return { list: rows, total, page };
  },
};

module.exports = messageModel;
