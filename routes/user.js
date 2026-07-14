const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const pool = require("../models/db");
const bcrypt = require("bcryptjs");

// 我的提问列表（含未审核留言数量）
router.get("/questions", verifyToken, async (req, res) => {
  const { page = 1, size = 5, is_resolved } = req.query;
  const offset = (page - 1) * size;
  let conditions = ["p.user_id = ?", "p.is_deleted = 0"];
  const params = [req.user.id];
  if (is_resolved !== undefined && is_resolved !== "") {
    conditions.push("p.is_resolved = ?");
    params.push(is_resolved);
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  try {
    const [rows] = await pool.query(
      `
      SELECT p.id, p.title, p.bounty, p.created_at, p.audit_status, p.is_resolved,
      (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id AND r.is_approved_by_owner = 0 AND r.is_deleted = 0) as unapprovedCount
      FROM posts p
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
  const { page = 1, size = 10 } = req.query;
  const offset = (page - 1) * size;
  try {
    const [rows] = await pool.query(
      `
      SELECT r.id, r.content, r.created_at, r.is_best,
             p.id as post_id, p.title as post_title
      FROM replies r
      JOIN posts p ON r.post_id = p.id
      WHERE r.user_id = ? AND r.is_deleted = 0
      ORDER BY r.created_at DESC
      LIMIT ?,?`,
      [req.user.id, offset, +size],
    );
    const [[{ total }]] = await pool.query(
      `
      SELECT COUNT(*) as total FROM replies r
      JOIN posts p ON r.post_id = p.id
      WHERE r.user_id = ? AND r.is_deleted = 0`,
      [req.user.id],
    );
    res.json({ code: 200, data: { list: rows, total, page: +page } });
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

// 通知计数（未审核回复 + 未读消息）
router.get("/notification-count", verifyToken, async (req, res) => {
  try {
    const [[{ unapproved }]] = await pool.query(
      `
      SELECT COUNT(*) as unapproved FROM replies r
      JOIN posts p ON r.post_id = p.id
      WHERE p.user_id = ? AND r.is_approved_by_owner = 0 AND r.is_deleted = 0
    `,
      [req.user.id],
    );
    const [[{ unread }]] = await pool.query(
      `
      SELECT COUNT(*) as unread FROM user_messages
      WHERE user_id = ? AND is_read = 0
    `,
      [req.user.id],
    );
    const count = (unapproved || 0) + (unread || 0);
    res.json({ code: 200, data: { count, unapproved, unread } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 标记消息已读
router.put("/messages/:id/read", verifyToken, async (req, res) => {
  try {
    await pool.query(
      "UPDATE user_messages SET is_read=1 WHERE id=? AND user_id=?",
      [req.params.id, req.user.id],
    );
    res.json({ code: 200, msg: "已读" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 我的收藏列表
router.get("/favorites", verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT f.id, f.created_at as favorited_at, p.id as post_id, p.title, p.bounty, p.created_at, u.nickname
      FROM favorites f
      JOIN posts p ON f.post_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC`,
      [req.user.id],
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 获取用户公开详情（不含敏感信息）
router.get("/profile/:userId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, nickname, points, created_at FROM users WHERE id = ?",
      [req.params.userId],
    );
    if (!rows.length) return res.json({ code: 404, msg: "用户不存在" });
    res.json({ code: 200, data: rows[0] });
  } catch (err) {
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 获取某用户的最近提问（公开）
router.get("/questions/:userId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.title, p.bounty, p.created_at
       FROM posts p
       WHERE p.user_id = ? AND p.is_deleted = 0 AND p.audit_status = 1
       ORDER BY p.created_at DESC
       LIMIT 10`,
      [req.params.userId],
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 关注/取消关注切换
router.post("/follow/:userId", verifyToken, async (req, res) => {
  const followeeId = req.params.userId;
  const followerId = req.user.id;
  if (followerId == followeeId)
    return res.json({ code: 400, msg: "不能关注自己" });
  const conn = await pool.getConnection();
  try {
    const [existing] = await conn.query(
      "SELECT id FROM user_follows WHERE follower_id=? AND followee_id=?",
      [followerId, followeeId],
    );
    if (existing.length > 0) {
      await conn.query(
        "DELETE FROM user_follows WHERE follower_id=? AND followee_id=?",
        [followerId, followeeId],
      );
      res.json({ code: 200, msg: "已取消关注", data: { isFollowing: false } });
    } else {
      await conn.query(
        "INSERT INTO user_follows (follower_id, followee_id) VALUES (?,?)",
        [followerId, followeeId],
      );
      res.json({ code: 200, msg: "关注成功", data: { isFollowing: true } });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  } finally {
    conn.release();
  }
});

// 获取当前用户与目标用户的关注状态
router.get("/follow-status/:userId", verifyToken, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id FROM user_follows WHERE follower_id=? AND followee_id=?",
    [req.user.id, req.params.userId],
  );
  res.json({ code: 200, data: { isFollowing: rows.length > 0 } });
});

// 拉黑/取消拉黑切换
router.post("/block/:userId", verifyToken, async (req, res) => {
  const blockedId = req.params.userId;
  const blockerId = req.user.id;
  if (blockerId == blockedId)
    return res.json({ code: 400, msg: "不能拉黑自己" });
  const conn = await pool.getConnection();
  try {
    const [existing] = await conn.query(
      "SELECT id FROM user_blocks WHERE blocker_id=? AND blocked_id=?",
      [blockerId, blockedId],
    );
    if (existing.length > 0) {
      await conn.query(
        "DELETE FROM user_blocks WHERE blocker_id=? AND blocked_id=?",
        [blockerId, blockedId],
      );
      res.json({ code: 200, msg: "已取消拉黑", data: { isBlocked: false } });
    } else {
      await conn.query(
        "INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?,?)",
        [blockerId, blockedId],
      );
      res.json({ code: 200, msg: "已拉黑", data: { isBlocked: true } });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  } finally {
    conn.release();
  }
});

// 获取当前用户与目标用户的拉黑状态
router.get("/block-status/:userId", verifyToken, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id FROM user_blocks WHERE blocker_id=? AND blocked_id=?",
    [req.user.id, req.params.userId],
  );
  res.json({ code: 200, data: { isBlocked: rows.length > 0 } });
});

// 我的关注列表
router.get("/following", verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.nickname, u.points, u.created_at, f.created_at as followed_at
       FROM user_follows f
       JOIN users u ON f.followee_id = u.id
       WHERE f.follower_id = ?
       ORDER BY f.created_at DESC`,
      [req.user.id],
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

module.exports = router;
