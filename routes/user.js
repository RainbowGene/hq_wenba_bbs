const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const pool = require("../models/db");
const bcrypt = require("bcryptjs");

// 我的提问列表（含未审核留言数量）
router.get("/questions", verifyToken, async (req, res) => {
  try {
    const [posts] = await pool.query(
      `
      SELECT p.id, p.title, p.bounty, p.created_at, p.audit_status,
      (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id AND r.is_approved_by_owner = 0 AND r.is_deleted = 0) as unapprovedCount
      FROM posts p
      WHERE p.user_id = ? AND p.is_deleted = 0
      ORDER BY p.created_at DESC`,
      [req.user.id],
    );
    res.json({ code: 200, data: { list: posts } });
  } catch (err) {
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 获取某帖子下所有待审核留言（贴主可见）
router.get("/questions/:postId/replies", verifyToken, async (req, res) => {
  const [post] = await pool.query("SELECT user_id FROM posts WHERE id=?", [
    req.params.postId,
  ]);
  if (!post.length || post[0].user_id !== req.user.id)
    return res.json({ code: 403, msg: "无权查看" });
  const [replies] = await pool.query(
    `
    SELECT r.id, r.content, r.is_approved_by_owner, r.created_at, u.nickname
    FROM replies r JOIN users u ON r.user_id = u.id
    WHERE r.post_id = ? AND r.is_deleted = 0
    ORDER BY r.created_at DESC`,
    [req.params.postId],
  );
  res.json({ code: 200, data: replies });
});

// 贴主审核回复（通过）
router.put(
  "/questions/:postId/replies/:replyId/approve",
  verifyToken,
  async (req, res) => {
    const [post] = await pool.query("SELECT user_id FROM posts WHERE id=?", [
      req.params.postId,
    ]);
    if (!post.length || post[0].user_id !== req.user.id)
      return res.json({ code: 403, msg: "无权操作" });
    await pool.query("UPDATE replies SET is_approved_by_owner = 1 WHERE id=?", [
      req.params.replyId,
    ]);
    res.json({ code: 200, msg: "审核通过" });
  },
);

// 贴主删除回复（软删）
router.delete(
  "/questions/:postId/replies/:replyId",
  verifyToken,
  async (req, res) => {
    const [post] = await pool.query("SELECT user_id FROM posts WHERE id=?", [
      req.params.postId,
    ]);
    if (!post.length || post[0].user_id !== req.user.id)
      return res.json({ code: 403, msg: "无权操作" });
    await pool.query(
      "UPDATE replies SET is_deleted=1, deleted_at=NOW(), deleted_by=? WHERE id=?",
      [req.user.id, req.params.replyId],
    );
    res.json({ code: 200, msg: "已删除" });
  },
);

// 设为最佳答案（已在posts路由实现，此处可复用或调用post路由）

// 参与回答记录
router.get("/replies", verifyToken, async (req, res) => {
  const [replies] = await pool.query(
    `
    SELECT r.id, r.content, r.created_at, r.is_approved_by_owner, p.id as post_id, p.title
    FROM replies r JOIN posts p ON r.post_id = p.id
    WHERE r.user_id = ? AND r.is_deleted = 0
    ORDER BY r.created_at DESC`,
    [req.user.id],
  );
  res.json({ code: 200, data: replies });
});

// 站内留言列表
router.get("/messages", verifyToken, async (req, res) => {
  const [msgs] = await pool.query(
    `
    SELECT um.*, u.nickname as from_admin
    FROM user_messages um LEFT JOIN users u ON um.from_admin_id = u.id
    WHERE um.user_id = ? ORDER BY um.created_at DESC`,
    [req.user.id],
  );
  res.json({ code: 200, data: msgs });
});

// 标记留言已读
router.put("/messages/:id/read", verifyToken, async (req, res) => {
  await pool.query(
    "UPDATE user_messages SET is_read=1 WHERE id=? AND user_id=?",
    [req.params.id, req.user.id],
  );
  res.json({ code: 200, msg: "已读" });
});

// 个人资料修改（昵称）
router.put("/profile", verifyToken, async (req, res) => {
  const { nickname } = req.body;
  if (!nickname) return res.json({ code: 400, msg: "昵称不能为空" });
  // 长度校验
  if (nickname.replace(/[^\x00-\xff]/g, "aa").length > 6 * 3)
    return res.json({ code: 400, msg: "昵称最长6个汉字" });
  await pool.query("UPDATE users SET nickname=? WHERE id=?", [
    nickname,
    req.user.id,
  ]);
  res.json({ code: 200, msg: "昵称修改成功" });
});

// 修改密码（需密保验证）
router.put("/change-password", verifyToken, async (req, res) => {
  const { security_answer, new_password } = req.body;
  if (!security_answer || !new_password)
    return res.json({ code: 400, msg: "参数不完整" });
  if (new_password.length < 6 || new_password.length > 12)
    return res.json({ code: 400, msg: "密码长度6-12字符" });
  const [rows] = await pool.query(
    "SELECT security_answer FROM users WHERE id=?",
    [req.user.id],
  );
  if (rows[0].security_answer !== security_answer)
    return res.json({ code: 400, msg: "密保答案错误" });
  const hash = await bcrypt.hash(new_password, 10);
  await pool.query("UPDATE users SET password_hash=? WHERE id=?", [
    hash,
    req.user.id,
  ]);
  res.json({ code: 200, msg: "密码修改成功" });
});

module.exports = router;
