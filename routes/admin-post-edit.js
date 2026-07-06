const express = require("express");
const router = express.Router();
const { verifyToken, requireAdmin } = require("../middleware/auth");
const pool = require("../models/db");
const { escapeHtml, filterSensitiveWords } = require("../utils/helpers");
const config = require("../config/config");

// 中间件：管理员权限
router.use(verifyToken, requireAdmin);

// 获取单个帖子详情（用于编辑加载）
router.get("/:id", async (req, res) => {
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
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 编辑并审核通过
router.put("/:id/edit-approve", async (req, res) => {
  const postId = req.params.id;
  let { title, category_id, bounty, content } = req.body;
  if (!title || !category_id)
    return res.json({ code: 400, msg: "标题和分类不能为空" });

  // 过滤
  const words = config.sensitiveWords;
  title = filterSensitiveWords(escapeHtml(title), words);
  content = filterSensitiveWords(escapeHtml(content || ""), words);

  try {
    const [post] = await pool.query("SELECT * FROM posts WHERE id = ?", [
      postId,
    ]);
    if (!post.length) return res.json({ code: 404, msg: "帖子不存在" });

    // 更新帖子并审核通过
    await pool.query(
      "UPDATE posts SET title=?, category_id=?, bounty=?, content=?, audit_status=1 WHERE id=?",
      [title, category_id, bounty || post[0].bounty, content, postId],
    );

    // 记录操作日志
    await pool.query(
      "INSERT INTO admin_logs (admin_id, admin_username, admin_nickname, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?,?)",
      [
        req.user.id,
        req.user.username,
        req.user.nickname,
        "编辑并审核通过",
        "post",
        postId,
        `编辑后通过审核，修改字段：标题、分类等`,
      ],
    );

    res.json({ code: 200, msg: "已保存并通过审核" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

module.exports = router;
