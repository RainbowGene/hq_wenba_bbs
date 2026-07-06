const pool = require("./db");

const replyModel = {
  // 创建回复
  create: async (replyData) => {
    const { post_id, user_id, content, is_approved_by_owner = 0 } = replyData;
    const [result] = await pool.query(
      "INSERT INTO replies (post_id, user_id, content, is_approved_by_owner) VALUES (?, ?, ?, ?)",
      [post_id, user_id, content, is_approved_by_owner],
    );
    return result.insertId;
  },

  // 根据 ID 获取回复
  findById: async (id) => {
    const [rows] = await pool.query("SELECT * FROM replies WHERE id = ?", [id]);
    return rows[0] || null;
  },

  // 获取某个帖子的所有回复（支持筛选是否审核通过、是否删除）
  getByPostId: async (postId, options = {}) => {
    let conditions = ["post_id = ?"];
    const params = [postId];
    if (options.is_approved_by_owner !== undefined) {
      conditions.push("is_approved_by_owner = ?");
      params.push(options.is_approved_by_owner);
    }
    if (options.is_deleted !== undefined) {
      conditions.push("is_deleted = ?");
      params.push(options.is_deleted);
    }
    if (options.is_blocked !== undefined) {
      conditions.push("is_blocked = ?");
      params.push(options.is_blocked);
    }
    const where = "WHERE " + conditions.join(" AND ");
    const [rows] = await pool.query(
      `SELECT r.*, u.username, u.nickname
       FROM replies r
       JOIN users u ON r.user_id = u.id
       ${where}
       ORDER BY r.is_best DESC, r.created_at ASC`,
      params,
    );
    return rows;
  },

  // 回复列表（管理端，支持分页和筛选）
  list: async (filters = {}, page = 1, size = 20) => {
    let conditions = ["r.is_deleted = 0"];
    const params = [];
    if (filters.post_id) {
      conditions.push("r.post_id = ?");
      params.push(filters.post_id);
    }
    if (filters.user_id) {
      conditions.push("r.user_id = ?");
      params.push(filters.user_id);
    }
    if (filters.content) {
      conditions.push("r.content LIKE ?");
      params.push(`%${filters.content}%`);
    }
    const where = "WHERE " + conditions.join(" AND ");
    const offset = (page - 1) * size;
    const [rows] = await pool.query(
      `SELECT r.*, u.username, u.nickname
       FROM replies r
       JOIN users u ON r.user_id = u.id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT ?,?`,
      [...params, offset, size],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM replies r ${where}`,
      params,
    );
    return { list: rows, total, page };
  },

  // 更新回复（支持贴主审核、设为最佳、屏蔽、软删除等）
  update: async (id, updates) => {
    const allowed = [
      "is_approved_by_owner",
      "is_best",
      "is_blocked",
      "is_deleted",
      "deleted_at",
      "deleted_by",
      "content",
    ];
    const fields = [];
    const values = [];
    for (let key in updates) {
      if (allowed.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }
    if (fields.length === 0) return false;
    values.push(id);
    const [result] = await pool.query(
      `UPDATE replies SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
    return result.affectedRows > 0;
  },

  // 批量软删除
  batchSoftDelete: async (ids, deletedBy) => {
    const [result] = await pool.query(
      "UPDATE replies SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE id IN (?)",
      [deletedBy, ids],
    );
    return result.affectedRows;
  },

  // 批量屏蔽/取消屏蔽（切换状态）
  toggleBlock: async (ids) => {
    const [result] = await pool.query(
      "UPDATE replies SET is_blocked = CASE WHEN is_blocked = 1 THEN 0 ELSE 1 END WHERE id IN (?)",
      [ids],
    );
    return result.affectedRows;
  },

  // 永久删除
  permanentDelete: async (ids) => {
    const [result] = await pool.query("DELETE FROM replies WHERE id IN (?)", [
      ids,
    ]);
    return result.affectedRows;
  },
};

module.exports = replyModel;
