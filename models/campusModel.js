const pool = require("./db");

const campusModel = {
  // 获取所有园区（带父级名称）
  getAll: async () => {
    const [rows] = await pool.query(
      `SELECT c.*, p.name AS parent_name
       FROM campus c
       LEFT JOIN campus p ON c.parent_id = p.id
       ORDER BY c.parent_id IS NULL DESC, c.id ASC`,
    );
    return rows;
  },

  // 获取树形结构（一级包含二级）
  getTree: async () => {
    const all = await campusModel.getAll();
    const map = {};
    const tree = [];
    all.forEach((campus) => {
      map[campus.id] = { ...campus, children: [] };
    });
    all.forEach((campus) => {
      if (campus.parent_id) {
        if (map[campus.parent_id]) {
          map[campus.parent_id].children.push(map[campus.id]);
        }
      } else {
        tree.push(map[campus.id]);
      }
    });
    return tree;
  },

  // 根据 ID 获取园区
  findById: async (id) => {
    const [rows] = await pool.query("SELECT * FROM campus WHERE id = ?", [id]);
    return rows[0] || null;
  },

  // 创建园区
  create: async ({ name, parent_id = null, description = null }) => {
    const [result] = await pool.query(
      "INSERT INTO campus (name, parent_id, description) VALUES (?, ?, ?)",
      [name, parent_id, description],
    );
    return result.insertId;
  },

  // 更新园区
  update: async (id, { name, parent_id, description }) => {
    const fields = [];
    const values = [];
    if (name !== undefined) {
      fields.push("name = ?");
      values.push(name);
    }
    if (parent_id !== undefined) {
      fields.push("parent_id = ?");
      values.push(parent_id);
    }
    if (description !== undefined) {
      fields.push("description = ?");
      values.push(description);
    }
    if (fields.length === 0) return false;
    values.push(id);
    const [result] = await pool.query(
      `UPDATE campus SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
    return result.affectedRows > 0;
  },

  // 删除园区（先处理子园区和用户关联）
  delete: async (id) => {
    // 将子园区的 parent_id 置空
    await pool.query("UPDATE campus SET parent_id = NULL WHERE parent_id = ?", [
      id,
    ]);
    // 将归属于该园区的用户的 campus_id 置空（或更新为其他园区，此处置空）
    await pool.query("UPDATE users SET campus_id = NULL WHERE campus_id = ?", [
      id,
    ]);
    const [result] = await pool.query("DELETE FROM campus WHERE id = ?", [id]);
    return result.affectedRows > 0;
  },
};

module.exports = campusModel;
