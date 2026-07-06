const pool = require("./db");

const userModel = {
  // 根据账号查找用户
  findByUsername: async (username) => {
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);
    return rows[0] || null;
  },

  // 根据ID查找用户
  findById: async (id) => {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    return rows[0] || null;
  },

  // 创建用户
  create: async (userData) => {
    const {
      username,
      password_hash,
      nickname,
      campus_id,
      id_card,
      contact,
      security_question,
      security_answer,
      points = 300,
    } = userData;
    const [result] = await pool.query(
      `INSERT INTO users (username, password_hash, nickname, campus_id, id_card, contact, security_question, security_answer, points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        username,
        password_hash,
        nickname,
        campus_id,
        id_card,
        contact,
        security_question,
        security_answer,
        points,
      ],
    );
    return result.insertId;
  },

  // 更新用户资料（支持部分字段）
  update: async (id, updates) => {
    const allowedFields = [
      "nickname",
      "password_hash",
      "status",
      "points",
      "campus_id",
    ];
    const fields = [];
    const values = [];
    for (let key in updates) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }
    if (fields.length === 0) return false;
    values.push(id);
    const [result] = await pool.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
    return result.affectedRows > 0;
  },

  // 查询用户列表（带分页、条件）
  list: async (conditions = {}, page = 1, size = 20) => {
    let where = [];
    let params = [];
    if (conditions.username) {
      where.push("username LIKE ?");
      params.push(`%${conditions.username}%`);
    }
    if (conditions.nickname) {
      where.push("nickname LIKE ?");
      params.push(`%${conditions.nickname}%`);
    }
    if (conditions.status !== undefined) {
      where.push("status = ?");
      params.push(conditions.status);
    }
    const whereClause = where.length > 0 ? "WHERE " + where.join(" AND ") : "";
    const offset = (page - 1) * size;
    const [rows] = await pool.query(
      `SELECT id, username, nickname, campus_id, points, status, created_at FROM users ${whereClause} ORDER BY created_at DESC LIMIT ?,?`,
      [...params, offset, size],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params,
    );
    return { list: rows, total, page };
  },

  // 获取积分
  getPoints: async (id) => {
    const [rows] = await pool.query("SELECT points FROM users WHERE id = ?", [
      id,
    ]);
    return rows[0] ? rows[0].points : 0;
  },

  // 增加/减少积分（原子操作）
  modifyPoints: async (id, amount, conn = null) => {
    const db = conn || pool;
    await db.query("UPDATE users SET points = points + ? WHERE id = ?", [
      amount,
      id,
    ]);
  },
};

module.exports = userModel;
