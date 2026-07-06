const pool = require("./db");

const announcementModel = {
  // 创建公告
  create: async (data) => {
    const {
      title,
      content = null,
      cover_image = null,
      link_url = null,
      is_carousel = 0,
      is_active = 1,
    } = data;
    const [result] = await pool.query(
      "INSERT INTO announcements (title, content, cover_image, link_url, is_carousel, is_active) VALUES (?, ?, ?, ?, ?, ?)",
      [title, content, cover_image, link_url, is_carousel, is_active],
    );
    return result.insertId;
  },

  // 根据 ID 获取公告
  findById: async (id) => {
    const [rows] = await pool.query(
      "SELECT * FROM announcements WHERE id = ?",
      [id],
    );
    return rows[0] || null;
  },

  // 获取公告列表（分页）
  list: async (page = 1, size = 10, filters = {}) => {
    let conditions = [];
    const params = [];
    if (filters.is_carousel !== undefined) {
      conditions.push("is_carousel = ?");
      params.push(filters.is_carousel);
    }
    if (filters.is_active !== undefined) {
      conditions.push("is_active = ?");
      params.push(filters.is_active);
    }
    const where =
      conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const offset = (page - 1) * size;
    const [rows] = await pool.query(
      `SELECT * FROM announcements ${where} ORDER BY created_at DESC LIMIT ?,?`,
      [...params, offset, size],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM announcements ${where}`,
      params,
    );
    return { list: rows, total, page };
  },

  // 获取轮播图（仅启用的轮播公告）
  getCarousel: async () => {
    const [rows] = await pool.query(
      "SELECT title, cover_image, link_url FROM announcements WHERE is_carousel = 1 AND is_active = 1 ORDER BY created_at DESC LIMIT 5",
    );
    return rows;
  },

  // 获取普通公告列表（非轮播）
  getActiveAnnouncements: async () => {
    const [rows] = await pool.query(
      "SELECT id, title, content, created_at FROM announcements WHERE is_active = 1 AND is_carousel = 0 ORDER BY created_at DESC LIMIT 10",
    );
    return rows;
  },

  // 更新公告
  update: async (id, updates) => {
    const allowed = [
      "title",
      "content",
      "cover_image",
      "link_url",
      "is_carousel",
      "is_active",
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
      `UPDATE announcements SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
    return result.affectedRows > 0;
  },

  // 删除公告
  delete: async (id) => {
    const [result] = await pool.query(
      "DELETE FROM announcements WHERE id = ?",
      [id],
    );
    return result.affectedRows > 0;
  },
};

module.exports = announcementModel;
