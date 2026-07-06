const pool = require("./db");

const logModel = {
  // ========== 登录日志 ==========
  // 记录登录
  recordLogin: async (userId, username, ip) => {
    await pool.query(
      "INSERT INTO login_logs (user_id, username, ip) VALUES (?, ?, ?)",
      [userId, username, ip],
    );
  },

  // 查询登录日志（分页，支持筛选）
  getLoginLogs: async (page = 1, size = 20, filters = {}) => {
    let conditions = [];
    const params = [];
    if (filters.username) {
      conditions.push("username LIKE ?");
      params.push(`%${filters.username}%`);
    }
    if (filters.ip) {
      conditions.push("ip LIKE ?");
      params.push(`%${filters.ip}%`);
    }
    if (filters.date) {
      conditions.push("DATE(login_time) = ?");
      params.push(filters.date);
    }
    const where =
      conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const offset = (page - 1) * size;
    const [rows] = await pool.query(
      `SELECT * FROM login_logs ${where} ORDER BY login_time DESC LIMIT ?,?`,
      [...params, offset, size],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM login_logs ${where}`,
      params,
    );
    return { list: rows, total, page };
  },

  // ========== 管理员操作日志 ==========
  // 记录管理员操作
  recordAdminAction: async (
    adminId,
    adminUsername,
    adminNickname,
    employeeId,
    action,
    targetType = null,
    targetId = null,
    detail = null,
  ) => {
    await pool.query(
      "INSERT INTO admin_logs (admin_id, admin_username, admin_nickname, employee_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        adminId,
        adminUsername,
        adminNickname,
        employeeId,
        action,
        targetType,
        targetId,
        detail,
      ],
    );
  },

  // 查询管理员操作日志（分页，支持筛选）
  getAdminLogs: async (page = 1, size = 20, filters = {}) => {
    let conditions = [];
    const params = [];
    if (filters.admin) {
      conditions.push(
        "(admin_nickname LIKE ? OR admin_username LIKE ? OR employee_id LIKE ?)",
      );
      params.push(
        `%${filters.admin}%`,
        `%${filters.admin}%`,
        `%${filters.admin}%`,
      );
    }
    if (filters.action) {
      conditions.push("action LIKE ?");
      params.push(`%${filters.action}%`);
    }
    if (filters.date) {
      conditions.push("DATE(created_at) = ?");
      params.push(filters.date);
    }
    const where =
      conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const offset = (page - 1) * size;
    const [rows] = await pool.query(
      `SELECT * FROM admin_logs ${where} ORDER BY created_at DESC LIMIT ?,?`,
      [...params, offset, size],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM admin_logs ${where}`,
      params,
    );
    return { list: rows, total, page };
  },

  // ========== 积分日志 ==========
  // 记录积分变动
  recordPointsChange: async (
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
};

module.exports = logModel;
