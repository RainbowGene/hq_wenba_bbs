const express = require("express");
const router = express.Router();
const { verifyToken, requireAdmin } = require("../middleware/auth");
const pool = require("../models/db");
const config = require("../config/config");
const { escapeHtml, filterSensitiveWords } = require("../utils/helpers");
const upload = require("../middleware/upload");

// ===================== 全局中间件 =====================
router.use(verifyToken, requireAdmin);

// ===================== 管理员身份检查（独立路由，不需要requireAdmin，但在后续定义，此处可以先定义在全局中间件之前？实际本文件所有路由都需要requireAdmin，/check 接口需要放在全局中间件之前。特此调整） =====================
// 为了兼容，我们将 /check 定义在 use(verifyToken, requireAdmin) 之前（实际上应先定义 /check 再使用全局中间件）。重新组织文件顺序：

// 临时解决方案：将 /check 路由移动到本文件最开始，在全局中间件之前。以下是正确的结构：
// （注意：如果你直接复制本文件，将覆盖原有内容，请确保原有其他非管理路由不在此文件内，本文件仅含 /admin 下的管理路由）

// 由于本文件是作为 admin 路由挂载，app.use('/api/admin', adminRoutes)，所以路径均为相对路径。
// 我们在文件开始处定义 /check，然后才使用全局中间件，其他路由则受保护。请将以下代码按顺序放入文件。

// ===================== 定义 /check 路由（必须在全局中间件之前） =====================
router.get("/check", verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, username, nickname, role FROM users WHERE id = ?",
      [req.user.id],
    );
    if (!rows.length || rows[0].role !== "admin") {
      return res.status(403).json({ code: 403, msg: "非管理员" });
    }
    res.json({ code: 200, data: rows[0] });
  } catch (err) {
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 然后应用全局管理员中间件
router.use(verifyToken, requireAdmin);

// ===================== 统计看板 =====================
router.get("/dashboard/stats", async (req, res) => {
  try {
    const [[{ totalUsers }]] = await pool.query(
      "SELECT COUNT(*) as totalUsers FROM users",
    );
    const [[{ yesterdayActive }]] = await pool.query(
      "SELECT COUNT(DISTINCT user_id) as yesterdayActive FROM login_logs WHERE DATE(login_time) = CURDATE() - INTERVAL 1 DAY",
    );
    const [[{ yesterdayPosts }]] = await pool.query(
      "SELECT COUNT(*) as yesterdayPosts FROM posts WHERE DATE(created_at) = CURDATE() - INTERVAL 1 DAY",
    );
    const [[{ weekNewUsers }]] = await pool.query(
      "SELECT COUNT(*) as weekNewUsers FROM users WHERE created_at >= CURDATE() - INTERVAL 7 DAY",
    );
    const [[{ yearAudited }]] = await pool.query(
      "SELECT COUNT(*) as yearAudited FROM admin_logs WHERE action='审核通过' AND YEAR(created_at)=YEAR(NOW())",
    );
    res.json({
      code: 200,
      data: {
        totalUsers,
        yesterdayActive,
        yesterdayPosts,
        weekNewUsers,
        yearAudited,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 审核提问 =====================
// 待审核列表
router.get("/posts/audit", async (req, res) => {
  const { page = 1, size = 20 } = req.query;
  const offset = (page - 1) * size;
  try {
    const [rows] = await pool.query(
      `
      SELECT p.id, p.title, p.bounty, p.created_at, p.audit_status,
             u.username, u.nickname, c.name as category_name
      FROM posts p
      JOIN users u ON p.user_id = u.id
      JOIN categories c ON p.category_id = c.id
      WHERE p.is_deleted=0 AND p.audit_status=0
      ORDER BY p.created_at DESC
      LIMIT ?,?`,
      [offset, +size],
    );
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) as total FROM posts WHERE is_deleted=0 AND audit_status=0",
    );
    res.json({ code: 200, data: { list: rows, total, page: +page } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 审核操作：通过/退回
router.put("/posts/audit/:action", async (req, res) => {
  const { action } = req.params; // approve 或 reject
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return res.json({ code: 400, msg: "参数错误" });
  const status = action === "approve" ? 1 : 2;
  try {
    await pool.query("UPDATE posts SET audit_status=? WHERE id IN (?)", [
      status,
      ids,
    ]);
    // 记录操作日志
    const adminNickname = req.user.nickname || req.user.username;
    for (const id of ids) {
      await pool.query(
        "INSERT INTO admin_logs (admin_id, admin_username, admin_nickname, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?,?)",
        [
          req.user.id,
          req.user.username,
          adminNickname,
          action === "approve" ? "审核通过" : "退回",
          "post",
          id,
          null,
        ],
      );
    }
    res.json({ code: 200, msg: "操作成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 删除帖子（软删除，进入回收站）
router.delete("/posts/delete", async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return res.json({ code: 400, msg: "参数错误" });
  try {
    await pool.query(
      "UPDATE posts SET is_deleted=1, deleted_at=NOW(), deleted_by=? WHERE id IN (?)",
      [req.user.id, ids],
    );
    const adminNickname = req.user.nickname || req.user.username;
    for (const id of ids) {
      await pool.query(
        "INSERT INTO admin_logs (admin_id, admin_username, admin_nickname, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?,?)",
        [
          req.user.id,
          req.user.username,
          adminNickname,
          "删除帖子",
          "post",
          id,
          null,
        ],
      );
    }
    res.json({ code: 200, msg: "已移入回收站" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 提问管理 =====================
router.get("/posts/manage", async (req, res) => {
  const {
    page = 1,
    size = 20,
    id,
    title,
    audit_status,
    is_resolved,
    is_recommended,
    is_top,
    is_blocked,
  } = req.query;
  const offset = (page - 1) * size;
  let conditions = ["p.is_deleted = 0"];
  const params = [];
  if (id) {
    conditions.push("p.id = ?");
    params.push(id);
  }
  if (title) {
    conditions.push("p.title LIKE ?");
    params.push(`%${title}%`);
  }
  if (audit_status !== "" && audit_status !== undefined) {
    conditions.push("p.audit_status = ?");
    params.push(audit_status);
  }
  if (is_resolved !== "" && is_resolved !== undefined) {
    conditions.push("p.is_resolved = ?");
    params.push(is_resolved);
  }
  if (is_recommended !== "" && is_recommended !== undefined) {
    conditions.push("p.is_recommended = ?");
    params.push(is_recommended);
  }
  if (is_top !== "" && is_top !== undefined) {
    conditions.push("p.is_top = ?");
    params.push(is_top);
  }
  if (is_blocked !== "" && is_blocked !== undefined) {
    conditions.push("p.is_blocked = ?");
    params.push(is_blocked);
  }
  const where = "WHERE " + conditions.join(" AND ");
  try {
    const [rows] = await pool.query(
      `
      SELECT p.*, u.username, u.nickname, c.name as category_name, cam.name as campus_name
      FROM posts p
      JOIN users u ON p.user_id = u.id
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN campus cam ON p.campus_id = cam.id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT ?,?`,
      [...params, offset, +size],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM posts p ${where}`,
      params,
    );
    res.json({ code: 200, data: { list: rows, total, page: +page } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 切换审核状态（独立，必须在 :action 之前） =====================
router.put("/posts/manage/toggle-audit", async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return res.json({ code: 400, msg: "参数错误" });
  try {
    await pool.query(
      "UPDATE posts SET audit_status = CASE WHEN audit_status = 1 THEN 0 ELSE 1 END WHERE id IN (?)",
      [ids],
    );
    const adminNickname = req.user.nickname || req.user.username;
    for (const id of ids) {
      await pool.query(
        "INSERT INTO admin_logs (admin_id, admin_username, admin_nickname, action, target_type, target_id) VALUES (?,?,?,?,?,?)",
        [
          req.user.id,
          req.user.username,
          adminNickname,
          "切换审核状态",
          "post",
          id,
        ],
      );
    }
    res.json({ code: 200, msg: "审核状态已切换" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 推荐/置顶/屏蔽 切换（统一为反转状态） =====================
router.put("/posts/manage/:action", async (req, res) => {
  const { action } = req.params;
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return res.json({ code: 400, msg: "参数错误" });
  let logAction = "";
  try {
    switch (action) {
      case "recommend":
      case "unrecommend":
        await pool.query(
          "UPDATE posts SET is_recommended = CASE WHEN is_recommended = 1 THEN 0 ELSE 1 END WHERE id IN (?)",
          [ids],
        );
        logAction = "切换推荐状态";
        break;
      case "top":
      case "untop":
        await pool.query(
          "UPDATE posts SET is_top = CASE WHEN is_top = 1 THEN 0 ELSE 1 END WHERE id IN (?)",
          [ids],
        );
        logAction = "切换置顶状态";
        break;
      case "block":
      case "unblock":
        await pool.query(
          "UPDATE posts SET is_blocked = CASE WHEN is_blocked = 1 THEN 0 ELSE 1 END WHERE id IN (?)",
          [ids],
        );
        logAction = "切换屏蔽状态";
        break;
      default:
        return res.json({ code: 400, msg: "操作非法" });
    }
    const adminNickname = req.user.nickname || req.user.username;
    for (const id of ids) {
      await pool.query(
        "INSERT INTO admin_logs (admin_id, admin_username, admin_nickname, action, target_type, target_id) VALUES (?,?,?,?,?,?)",
        [req.user.id, req.user.username, adminNickname, logAction, "post", id],
      );
    }
    res.json({ code: 200, msg: "操作成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 帖子详情与编辑 =====================
// 获取单个帖子详情
router.get("/posts/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT p.*, u.username, u.nickname, c.name as category_name
      FROM posts p
      JOIN users u ON p.user_id = u.id
      JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?`,
      [req.params.id],
    );
    if (!rows.length) return res.json({ code: 404, msg: "帖子不存在" });
    res.json({ code: 200, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 编辑并审核通过
router.put("/posts/:id/edit-approve", async (req, res) => {
  const postId = req.params.id;
  let { title, category_id, bounty, content } = req.body;
  if (!title || !category_id)
    return res.json({ code: 400, msg: "标题和分类不能为空" });

  const words = config.sensitiveWords;
  title = filterSensitiveWords(escapeHtml(title), words);
  content = filterSensitiveWords(escapeHtml(content || ""), words);

  try {
    const [post] = await pool.query("SELECT * FROM posts WHERE id = ?", [
      postId,
    ]);
    if (!post.length) return res.json({ code: 404, msg: "帖子不存在" });

    await pool.query(
      "UPDATE posts SET title=?, category_id=?, bounty=?, content=?, audit_status=1 WHERE id=?",
      [title, category_id, bounty || post[0].bounty, content, postId],
    );

    const adminNickname = req.user.nickname || req.user.username;
    await pool.query(
      "INSERT INTO admin_logs (admin_id, admin_username, admin_nickname, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?,?)",
      [
        req.user.id,
        req.user.username,
        adminNickname,
        "编辑并审核通过",
        "post",
        postId,
        "编辑后通过审核",
      ],
    );

    res.json({ code: 200, msg: "已保存并通过审核" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 编辑保存（不改变审核状态）
router.put("/posts/:id", async (req, res) => {
  const postId = req.params.id;
  let { title, category_id, bounty, content } = req.body;
  if (!title || !category_id)
    return res.json({ code: 400, msg: "标题和分类不能为空" });

  const words = config.sensitiveWords;
  title = filterSensitiveWords(escapeHtml(title), words);
  content = filterSensitiveWords(escapeHtml(content || ""), words);

  try {
    await pool.query(
      "UPDATE posts SET title=?, category_id=?, bounty=?, content=? WHERE id=?",
      [title, category_id, bounty, content, postId],
    );
    const adminNickname = req.user.nickname || req.user.username;
    await pool.query(
      "INSERT INTO admin_logs (admin_id, admin_username, admin_nickname, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?,?)",
      [
        req.user.id,
        req.user.username,
        adminNickname,
        "编辑帖子",
        "post",
        postId,
        "管理员修改内容",
      ],
    );
    res.json({ code: 200, msg: "保存成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 回复管理 =====================
router.get("/replies", async (req, res) => {
  const { page = 1, size = 20, post_id, user_id, content } = req.query;
  const offset = (page - 1) * size;
  let conditions = ["r.is_deleted = 0"];
  const params = [];
  if (post_id) {
    conditions.push("r.post_id = ?");
    params.push(post_id);
  }
  if (user_id) {
    conditions.push("r.user_id = ?");
    params.push(user_id);
  }
  if (content) {
    conditions.push("r.content LIKE ?");
    params.push(`%${content}%`);
  }
  const where = "WHERE " + conditions.join(" AND ");
  try {
    const [rows] = await pool.query(
      `
      SELECT r.*, u.username, u.nickname
      FROM replies r JOIN users u ON r.user_id = u.id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT ?,?`,
      [...params, offset, +size],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM replies r ${where}`,
      params,
    );
    res.json({ code: 200, data: { list: rows, total, page: +page } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 批量/单项删除回复（软删）
router.delete("/replies/delete", async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.json({ code: 400, msg: "参数错误" });
  }
  try {
    await pool.query(
      "UPDATE replies SET is_deleted=1, deleted_at=NOW(), deleted_by=? WHERE id IN (?)",
      [req.user.id, ids],
    );
    res.json({ code: 200, msg: "已删除" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.delete("/replies/delete", async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return res.json({ code: 400, msg: "参数错误" });
  try {
    await pool.query(
      "UPDATE replies SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE id IN (?)",
      [req.user.id, ids],
    );
    res.json({ code: 200, msg: "已删除" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.put("/replies/block", async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.json({ code: 400, msg: "参数错误" });
  }
  try {
    await pool.query(
      "UPDATE replies SET is_blocked = CASE WHEN is_blocked = 1 THEN 0 ELSE 1 END WHERE id IN (?)",
      [ids],
    );
    res.json({ code: 200, msg: "操作成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 回收站 - 帖子 =====================
router.get("/trash/posts", async (req, res) => {
  const { page = 1, size = 20 } = req.query;
  const offset = (page - 1) * size;
  try {
    const [rows] = await pool.query(
      "SELECT p.*, u.nickname FROM posts p JOIN users u ON p.user_id = u.id WHERE p.is_deleted = 1 ORDER BY p.deleted_at DESC LIMIT ?,?",
      [offset, +size],
    );
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) as total FROM posts WHERE is_deleted = 1",
    );
    res.json({ code: 200, data: { list: rows, total, page: +page } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.put("/trash/posts/restore", async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return res.json({ code: 400, msg: "参数错误" });
  try {
    await pool.query(
      "UPDATE posts SET is_deleted = 0, audit_status = 0 WHERE id IN (?)",
      [ids],
    );
    res.json({ code: 200, msg: "已还原（待审核状态）" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.delete("/trash/posts/permanent", async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return res.json({ code: 400, msg: "参数错误" });
  try {
    await pool.query("DELETE FROM posts WHERE id IN (?)", [ids]);
    res.json({ code: 200, msg: "已永久删除" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 回收站 - 回复 =====================
router.get("/trash/replies", async (req, res) => {
  const { page = 1, size = 20 } = req.query;
  const offset = (page - 1) * size;
  try {
    const [rows] = await pool.query(
      "SELECT r.*, u.username, u.nickname FROM replies r JOIN users u ON r.user_id = u.id WHERE r.is_deleted = 1 ORDER BY r.deleted_at DESC LIMIT ?,?",
      [offset, +size],
    );
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) as total FROM replies WHERE is_deleted = 1",
    );
    res.json({ code: 200, data: { list: rows, total, page: +page } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.put("/trash/replies/restore", async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return res.json({ code: 400, msg: "参数错误" });
  try {
    await pool.query(
      "UPDATE replies SET is_deleted = 0, deleted_at = NULL, is_approved_by_owner = 0 WHERE id IN (?)",
      [ids],
    );
    res.json({ code: 200, msg: "已还原为未审核状态" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.delete("/trash/replies/permanent", async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return res.json({ code: 400, msg: "参数错误" });
  try {
    await pool.query("DELETE FROM replies WHERE id IN (?)", [ids]);
    res.json({ code: 200, msg: "已永久删除" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 栏目分类 =====================
router.get("/categories", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, p.name AS parent_name FROM categories c LEFT JOIN categories p ON c.parent_id = p.id ORDER BY c.parent_id IS NULL DESC, c.id ASC`,
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.get("/categories/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM categories WHERE id=?", [
      req.params.id,
    ]);
    if (!rows.length) return res.json({ code: 404, msg: "分类不存在" });
    res.json({ code: 200, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.post("/categories", async (req, res) => {
  const { name, parent_id } = req.body;
  if (!name) return res.json({ code: 400, msg: "名称必填" });
  try {
    await pool.query("INSERT INTO categories (name, parent_id) VALUES (?,?)", [
      name,
      parent_id || null,
    ]);
    res.json({ code: 200, msg: "添加成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.put("/categories/:id", async (req, res) => {
  const { name, parent_id } = req.body;
  try {
    await pool.query("UPDATE categories SET name=?, parent_id=? WHERE id=?", [
      name,
      parent_id || null,
      req.params.id,
    ]);
    res.json({ code: 200, msg: "修改成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.delete("/categories/:id", async (req, res) => {
  try {
    await pool.query("UPDATE categories SET parent_id=NULL WHERE parent_id=?", [
      req.params.id,
    ]);
    await pool.query("DELETE FROM categories WHERE id=?", [req.params.id]);
    res.json({ code: 200, msg: "删除成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 园区管理 =====================
router.get("/campuses", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, p.name AS parent_name FROM campus c LEFT JOIN campus p ON c.parent_id = p.id ORDER BY c.parent_id IS NULL DESC, c.id ASC`,
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.get("/campuses/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM campus WHERE id=?", [
      req.params.id,
    ]);
    if (!rows.length) return res.json({ code: 404, msg: "园区不存在" });
    res.json({ code: 200, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.post("/campuses", async (req, res) => {
  const { name, parent_id, description } = req.body;
  if (!name) return res.json({ code: 400, msg: "名称必填" });
  try {
    await pool.query(
      "INSERT INTO campus (name, parent_id, description) VALUES (?,?,?)",
      [name, parent_id || null, description || null],
    );
    res.json({ code: 200, msg: "添加成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.put("/campuses/:id", async (req, res) => {
  const { name, parent_id, description } = req.body;
  try {
    await pool.query(
      "UPDATE campus SET name=?, parent_id=?, description=? WHERE id=?",
      [name, parent_id || null, description || null, req.params.id],
    );
    res.json({ code: 200, msg: "修改成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.delete("/campuses/:id", async (req, res) => {
  try {
    await pool.query("UPDATE campus SET parent_id=NULL WHERE parent_id=?", [
      req.params.id,
    ]);
    await pool.query("UPDATE users SET campus_id=NULL WHERE campus_id=?", [
      req.params.id,
    ]);
    await pool.query("DELETE FROM campus WHERE id=?", [req.params.id]);
    res.json({ code: 200, msg: "删除成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 会员管理 =====================
router.get("/members", async (req, res) => {
  const { page = 1, size = 20, username, nickname, status } = req.query;
  const offset = (page - 1) * size;
  let conditions = [];
  const params = [];
  if (username) {
    conditions.push("u.username LIKE ?");
    params.push(`%${username}%`);
  }
  if (nickname) {
    conditions.push("u.nickname LIKE ?");
    params.push(`%${nickname}%`);
  }
  if (status !== "" && status !== undefined) {
    conditions.push("u.status = ?");
    params.push(status);
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  try {
    const [rows] = await pool.query(
      `
      SELECT u.id, u.username, u.nickname, u.points, u.status, u.created_at, c.name AS campus_name
      FROM users u LEFT JOIN campus c ON u.campus_id = c.id
      ${where} ORDER BY u.created_at DESC LIMIT ?,?`,
      [...params, offset, +size],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM users u ${where}`,
      params,
    );
    res.json({ code: 200, data: { list: rows, total, page: +page } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.get("/members/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.*, c.name AS campus_name FROM users u LEFT JOIN campus c ON u.campus_id = c.id WHERE u.id = ?`,
      [req.params.id],
    );
    if (!rows.length) return res.json({ code: 404, msg: "用户不存在" });
    const user = rows[0];
    delete user.password_hash;
    res.json({ code: 200, data: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.put("/members/:id/toggle-freeze", async (req, res) => {
  try {
    const [user] = await pool.query("SELECT status FROM users WHERE id=?", [
      req.params.id,
    ]);
    if (!user.length) return res.json({ code: 404, msg: "用户不存在" });
    const newStatus = user[0].status === 0 ? 1 : 0;
    await pool.query("UPDATE users SET status=? WHERE id=?", [
      newStatus,
      req.params.id,
    ]);
    res.json({ code: 200, msg: newStatus === 0 ? "已冻结" : "已解冻" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.put("/members/:id/toggle-ban", async (req, res) => {
  try {
    const [user] = await pool.query("SELECT status FROM users WHERE id=?", [
      req.params.id,
    ]);
    if (!user.length) return res.json({ code: 404, msg: "用户不存在" });
    const newStatus = user[0].status === -1 ? 1 : -1;
    await pool.query("UPDATE users SET status=? WHERE id=?", [
      newStatus,
      req.params.id,
    ]);
    res.json({ code: 200, msg: newStatus === -1 ? "已封禁" : "已解封" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 公告管理 =====================
router.get("/announcements", async (req, res) => {
  const { page = 1, size = 10 } = req.query;
  const offset = (page - 1) * size;
  try {
    const [rows] = await pool.query(
      "SELECT * FROM announcements ORDER BY created_at DESC LIMIT ?,?",
      [offset, +size],
    );
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) as total FROM announcements",
    );
    res.json({ code: 200, data: { list: rows, total, page: +page } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.get("/announcements/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM announcements WHERE id=?", [
      req.params.id,
    ]);
    if (!rows.length) return res.json({ code: 404, msg: "公告不存在" });
    res.json({ code: 200, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.post(
  "/announcements",
  upload.single("cover_image"),
  async (req, res) => {
    try {
      const { title, content, link_url, is_carousel, is_active } = req.body;
      let cover_image = null;
      if (req.file) cover_image = "/uploads/" + req.file.filename;
      await pool.query(
        "INSERT INTO announcements (title, content, cover_image, link_url, is_carousel, is_active) VALUES (?,?,?,?,?,?)",
        [
          title,
          content || null,
          cover_image,
          link_url || null,
          is_carousel || 0,
          is_active || 1,
        ],
      );
      res.json({ code: 200, msg: "公告发布成功" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ code: 500, msg: "服务器错误" });
    }
  },
);

router.put(
  "/announcements/:id",
  upload.single("cover_image"),
  async (req, res) => {
    try {
      const { title, content, link_url, is_carousel, is_active } = req.body;
      let cover_image = req.body.cover_image || null;
      if (req.file) cover_image = "/uploads/" + req.file.filename;
      await pool.query(
        "UPDATE announcements SET title=?, content=?, cover_image=?, link_url=?, is_carousel=?, is_active=? WHERE id=?",
        [
          title,
          content || null,
          cover_image,
          link_url || null,
          is_carousel || 0,
          is_active || 1,
          req.params.id,
        ],
      );
      res.json({ code: 200, msg: "公告更新成功" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ code: 500, msg: "服务器错误" });
    }
  },
);

router.delete("/announcements/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM announcements WHERE id=?", [req.params.id]);
    res.json({ code: 200, msg: "公告已删除" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 用户反馈 =====================
router.get("/feedbacks", async (req, res) => {
  const { page = 1, size = 20 } = req.query;
  const offset = (page - 1) * size;
  try {
    const [rows] = await pool.query(
      `SELECT f.*, u.username, u.nickname FROM feedbacks f JOIN users u ON f.user_id = u.id ORDER BY f.created_at DESC LIMIT ?,?`,
      [offset, +size],
    );
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) as total FROM feedbacks",
    );
    res.json({ code: 200, data: { list: rows, total, page: +page } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.get("/feedbacks/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM feedbacks WHERE id=?", [
      req.params.id,
    ]);
    if (!rows.length) return res.json({ code: 404, msg: "反馈不存在" });
    res.json({ code: 200, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.put("/feedbacks/:id/reply", async (req, res) => {
  const { reply } = req.body;
  if (!reply) return res.json({ code: 400, msg: "回复内容不能为空" });
  try {
    await pool.query(
      "UPDATE feedbacks SET reply=?, replied_at=NOW() WHERE id=?",
      [reply, req.params.id],
    );
    res.json({ code: 200, msg: "回复成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 网站配置 =====================
router.get("/site-config", async (req, res) => {
  res.json({
    code: 200,
    data: { sensitiveWords: config.sensitiveWords, points: config.points },
  });
});

router.put("/site-config", async (req, res) => {
  const { sensitiveWords, points } = req.body;
  const updated = {};
  if (sensitiveWords) updated.sensitiveWords = sensitiveWords;
  if (points) updated.points = points;
  try {
    config.save(updated);
    res.json({ code: 200, msg: "配置已更新并写入配置文件" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "配置更新失败" });
  }
});

// ===================== 登录日志 =====================
router.get("/login-logs", async (req, res) => {
  const { page = 1, size = 20, username, ip, date } = req.query;
  const offset = (page - 1) * size;
  let conditions = [];
  const params = [];
  if (username) {
    conditions.push("username LIKE ?");
    params.push(`%${username}%`);
  }
  if (ip) {
    conditions.push("ip LIKE ?");
    params.push(`%${ip}%`);
  }
  if (date) {
    conditions.push("DATE(login_time) = ?");
    params.push(date);
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  try {
    const [rows] = await pool.query(
      `SELECT * FROM login_logs ${where} ORDER BY login_time DESC LIMIT ?,?`,
      [...params, offset, +size],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM login_logs ${where}`,
      params,
    );
    res.json({ code: 200, data: { list: rows, total, page: +page } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== IP黑名单 =====================
router.get("/ip-blacklist", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM ip_blacklist ORDER BY created_at DESC",
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.post("/ip-blacklist", async (req, res) => {
  const { ip, reason } = req.body;
  if (!ip) return res.json({ code: 400, msg: "IP不能为空" });
  try {
    await pool.query("INSERT INTO ip_blacklist (ip, reason) VALUES (?,?)", [
      ip,
      reason || null,
    ]);
    res.json({ code: 200, msg: "已封禁IP" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

router.delete("/ip-blacklist/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM ip_blacklist WHERE id=?", [req.params.id]);
    res.json({ code: 200, msg: "已解封" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 管理员操作日志 =====================
router.get("/admin-logs", async (req, res) => {
  const { page = 1, size = 20, admin, action, date } = req.query;
  const offset = (page - 1) * size;
  let conditions = [];
  const params = [];
  if (admin) {
    conditions.push(
      "(admin_nickname LIKE ? OR admin_username LIKE ? OR employee_id LIKE ?)",
    );
    params.push(`%${admin}%`, `%${admin}%`, `%${admin}%`);
  }
  if (action) {
    conditions.push("action LIKE ?");
    params.push(`%${action}%`);
  }
  if (date) {
    conditions.push("DATE(created_at) = ?");
    params.push(date);
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  try {
    const [rows] = await pool.query(
      `SELECT * FROM admin_logs ${where} ORDER BY created_at DESC LIMIT ?,?`,
      [...params, offset, +size],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM admin_logs ${where}`,
      params,
    );
    res.json({ code: 200, data: { list: rows, total, page: +page } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// ===================== 发送站内消息 =====================
router.post("/messages/send", async (req, res) => {
  const { user_id, content } = req.body;
  if (!user_id || !content) return res.json({ code: 400, msg: "参数不完整" });
  try {
    await pool.query(
      "INSERT INTO user_messages (user_id, from_admin_id, content) VALUES (?, ?, ?)",
      [user_id, req.user.id, content],
    );
    res.json({ code: 200, msg: "发送成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

module.exports = router;
