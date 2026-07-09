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
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 获取某帖子下所有回复（贴主审核用）
router.get("/questions/:postId/replies", verifyToken, async (req, res) => {
  const [post] = await pool.query("SELECT user_id FROM posts WHERE id=?", [
    req.params.postId,
  ]);
  if (!post.length || post[0].user_id !== req.user.id)
    return res.json({ code: 403, msg: "无权查看" });
  const [replies] = await pool.query(
    `
    SELECT r.*, u.nickname
    FROM replies r JOIN users u ON r.user_id = u.id
    WHERE r.post_id = ? AND r.is_deleted = 0
    ORDER BY r.is_best DESC, r.created_at ASC`,
    [req.params.postId],
  );
  res.json({ code: 200, data: replies });
});

// 审核通过回复
router.put(
  "/questions/:postId/replies/:replyId/approve",
  verifyToken,
  async (req, res) => {
    const [post] = await pool.query("SELECT user_id FROM posts WHERE id=?", [
      req.params.postId,
    ]);
    if (!post.length || post[0].user_id !== req.user.id)
      return res.json({ code: 403, msg: "无权操作" });
    try {
      await pool.query(
        "UPDATE replies SET is_approved_by_owner = 1 WHERE id=?",
        [req.params.replyId],
      );
      res.json({ code: 200, msg: "审核通过" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ code: 500, msg: "服务器错误" });
    }
  },
);

// 设为未审
router.put(
  "/questions/:postId/replies/:replyId/unapprove",
  verifyToken,
  async (req, res) => {
    const [post] = await pool.query("SELECT user_id FROM posts WHERE id=?", [
      req.params.postId,
    ]);
    if (!post.length || post[0].user_id !== req.user.id)
      return res.json({ code: 403, msg: "无权操作" });
    try {
      await pool.query(
        "UPDATE replies SET is_approved_by_owner = 0 WHERE id=?",
        [req.params.replyId],
      );
      res.json({ code: 200, msg: "已设为未审核" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ code: 500, msg: "服务器错误" });
    }
  },
);

// 删除回复（贴主专用，软删）
router.delete(
  "/questions/:postId/replies/:replyId",
  verifyToken,
  async (req, res) => {
    const [post] = await pool.query("SELECT user_id FROM posts WHERE id=?", [
      req.params.postId,
    ]);
    if (!post.length || post[0].user_id !== req.user.id)
      return res.json({ code: 403, msg: "无权操作" });
    try {
      await pool.query(
        "UPDATE replies SET is_deleted=1, deleted_at=NOW(), deleted_by=? WHERE id=?",
        [req.user.id, req.params.replyId],
      );
      res.json({ code: 200, msg: "已删除" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ code: 500, msg: "服务器错误" });
    }
  },
);

// 获取个人资料（昵称）
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT nickname FROM users WHERE id = ?", [
      req.user.id,
    ]);
    if (!rows.length) return res.json({ code: 404, msg: "用户不存在" });
    res.json({ code: 200, data: { nickname: rows[0].nickname } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 修改昵称
router.put("/profile", verifyToken, async (req, res) => {
  const { nickname } = req.body;
  if (!nickname) return res.json({ code: 400, msg: "昵称不能为空" });
  if (nickname.replace(/[^\x00-\xff]/g, "aa").length > 6 * 3)
    return res.json({ code: 400, msg: "昵称最长6个汉字" });
  try {
    await pool.query("UPDATE users SET nickname=? WHERE id=?", [
      nickname,
      req.user.id,
    ]);
    res.json({ code: 200, msg: "昵称修改成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 修改密码
router.put("/change-password", verifyToken, async (req, res) => {
  const { security_answer, new_password } = req.body;
  if (!security_answer || !new_password)
    return res.json({ code: 400, msg: "参数不完整" });
  if (new_password.length < 6 || new_password.length > 12)
    return res.json({ code: 400, msg: "密码长度6-12字符" });
  try {
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 参与回答列表
router.get("/replies", verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT r.id, r.content, r.created_at, r.is_best,
             p.id as post_id, p.title as post_title
      FROM replies r
      JOIN posts p ON r.post_id = p.id
      WHERE r.user_id = ? AND r.is_deleted = 0
      ORDER BY r.created_at DESC`,
      [req.user.id],
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 站内留言列表
router.get("/messages", verifyToken, async (req, res) => {
  try {
    const [msgs] = await pool.query(
      `
      SELECT um.*, u.nickname as from_admin
      FROM user_messages um LEFT JOIN users u ON um.from_admin_id = u.id
      WHERE um.user_id = ? ORDER BY um.created_at DESC`,
      [req.user.id],
    );
    res.json({ code: 200, data: msgs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 提交反馈
router.post("/feedback", verifyToken, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.json({ code: 400, msg: "内容不能为空" });
  try {
    await pool.query("INSERT INTO feedbacks (user_id, content) VALUES (?,?)", [
      req.user.id,
      content,
    ]);
    res.json({ code: 200, msg: "反馈已提交" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 获取自己的反馈列表
router.get("/feedbacks", verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM feedbacks WHERE user_id=? ORDER BY created_at DESC",
      [req.user.id],
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 未审核回复数量（红点通知）
router.get("/notification-count", verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT COUNT(*) as count FROM replies r
      JOIN posts p ON r.post_id = p.id
      WHERE p.user_id = ? AND r.is_approved_by_owner = 0 AND r.is_deleted = 0`,
      [req.user.id],
    );
    res.json({ code: 200, data: { count: rows[0].count } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

module.exports = router;
