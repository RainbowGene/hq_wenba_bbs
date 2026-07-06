const pool = require("./db");

const postModel = {
  // 创建帖子（插入 posts 表）
  create: async (postData) => {
    const {
      user_id,
      category_id,
      title,
      content,
      bounty,
      campus_id,
      audit_status = 0,
    } = postData;
    const [result] = await pool.query(
      `INSERT INTO posts (user_id, category_id, title, content, bounty, campus_id, audit_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, category_id, title, content, bounty, campus_id, audit_status],
    );
    return result.insertId;
  },

  // 根据 ID 获取帖子详情（联表查询用户和分类）
  findById: async (id) => {
    const [rows] = await pool.query(
      `SELECT p.*, u.username, u.nickname, c.name as category_name, cam.name as campus_name
       FROM posts p
       JOIN users u ON p.user_id = u.id
       JOIN categories c ON p.category_id = c.id
       LEFT JOIN campus cam ON p.campus_id = cam.id
       WHERE p.id = ?`,
      [id],
    );
    return rows[0] || null;
  },

  // 获取帖子列表（支持复杂筛选 + 分页）
  list: async (filters = {}, page = 1, size = 20) => {
    let conditions = ["p.is_deleted = 0"];
    const params = [];

    if (filters.audit_status !== undefined) {
      conditions.push("p.audit_status = ?");
      params.push(filters.audit_status);
    }
    if (filters.is_resolved !== undefined) {
      conditions.push("p.is_resolved = ?");
      params.push(filters.is_resolved);
    }
    if (filters.is_recommended !== undefined) {
      conditions.push("p.is_recommended = ?");
      params.push(filters.is_recommended);
    }
    if (filters.category_id) {
      conditions.push("p.category_id = ?");
      params.push(filters.category_id);
    }
    if (filters.user_id) {
      conditions.push("p.user_id = ?");
      params.push(filters.user_id);
    }
    if (filters.title) {
      conditions.push("p.title LIKE ?");
      params.push(`%${filters.title}%`);
    }
    if (filters.id) {
      conditions.push("p.id = ?");
      params.push(filters.id);
    }

    const where = "WHERE " + conditions.join(" AND ");
    const offset = (page - 1) * size;

    const [rows] = await pool.query(
      `SELECT p.*, u.username, u.nickname, c.name as category_name, cam.name as campus_name
       FROM posts p
       JOIN users u ON p.user_id = u.id
       JOIN categories c ON p.category_id = c.id
       LEFT JOIN campus cam ON p.campus_id = cam.id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT ?,?`,
      [...params, offset, size],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM posts p ${where}`,
      params,
    );
    return { list: rows, total, page };
  },

  // 更新帖子（部分字段）
  update: async (id, updates) => {
    const allowed = [
      "title",
      "content",
      "category_id",
      "bounty",
      "audit_status",
      "is_resolved",
      "is_recommended",
      "is_top",
      "is_blocked",
      "is_deleted",
      "deleted_at",
      "deleted_by",
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
      `UPDATE posts SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
    return result.affectedRows > 0;
  },

  // 软删除（移入回收站）
  softDelete: async (id, deletedBy) => {
    const [result] = await pool.query(
      "UPDATE posts SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE id = ?",
      [deletedBy, id],
    );
    return result.affectedRows > 0;
  },

  // 批量软删除
  batchSoftDelete: async (ids, deletedBy) => {
    const [result] = await pool.query(
      "UPDATE posts SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE id IN (?)",
      [deletedBy, ids],
    );
    return result.affectedRows;
  },

  // 永久删除
  permanentDelete: async (ids) => {
    const [result] = await pool.query("DELETE FROM posts WHERE id IN (?)", [
      ids,
    ]);
    return result.affectedRows;
  },

  // 批量更新状态（用于审核、推荐、置顶等）
  batchUpdate: async (ids, updates) => {
    const allowed = ["audit_status", "is_recommended", "is_top", "is_blocked"];
    const fields = [];
    const values = [];
    for (let key in updates) {
      if (allowed.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }
    if (fields.length === 0) return 0;
    values.push(ids);
    const [result] = await pool.query(
      `UPDATE posts SET ${fields.join(", ")} WHERE id IN (?)`,
      values,
    );
    return result.affectedRows;
  },
};

module.exports = postModel;
