const pool = require("./db");

const categoryModel = {
  // 获取所有分类（带父级名称）
  getAll: async () => {
    const [rows] = await pool.query(
      `SELECT c.*, p.name AS parent_name
       FROM categories c
       LEFT JOIN categories p ON c.parent_id = p.id
       ORDER BY c.parent_id IS NULL DESC, c.id ASC`,
    );
    return rows;
  },

  // 获取树形分类（一级包含二级）
  getTree: async () => {
    const all = await categoryModel.getAll();
    const map = {};
    const tree = [];
    all.forEach((cat) => {
      map[cat.id] = { ...cat, children: [] };
    });
    all.forEach((cat) => {
      if (cat.parent_id) {
        if (map[cat.parent_id]) {
          map[cat.parent_id].children.push(map[cat.id]);
        }
      } else {
        tree.push(map[cat.id]);
      }
    });
    return tree;
  },

  // 根据 ID 获取分类
  findById: async (id) => {
    const [rows] = await pool.query("SELECT * FROM categories WHERE id = ?", [
      id,
    ]);
    return rows[0] || null;
  },

  // 创建分类
  create: async (name, parent_id = null) => {
    const [result] = await pool.query(
      "INSERT INTO categories (name, parent_id) VALUES (?, ?)",
      [name, parent_id],
    );
    return result.insertId;
  },

  // 更新分类
  update: async (id, { name, parent_id }) => {
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
    if (fields.length === 0) return false;
    values.push(id);
    const [result] = await pool.query(
      `UPDATE categories SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
    return result.affectedRows > 0;
  },

  // 删除分类（同时将子分类的 parent_id 置空）
  delete: async (id) => {
    // 先将子分类的 parent_id 置空
    await pool.query(
      "UPDATE categories SET parent_id = NULL WHERE parent_id = ?",
      [id],
    );
    const [result] = await pool.query("DELETE FROM categories WHERE id = ?", [
      id,
    ]);
    return result.affectedRows > 0;
  },
};

module.exports = categoryModel;
