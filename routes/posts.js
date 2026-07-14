const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const pool = require("../models/db");
const { verifyToken } = require("../middleware/auth");
const { escapeHtml, filterSensitiveWords } = require("../utils/helpers");
const config = require("../config/config");

const secret = "wenba_secret_key";

// 发布提问
router.post("/", verifyToken, async (req, res) => {
  try {
    let { category_id, title, content, bounty } = req.body;
    if (!category_id || !title || !content)
      return res.json({ code: 400, msg: "参数不完整" });

    const bountyNum = parseInt(bounty) || 0;
    const isAdmin = req.user.role === "admin";

    if (!isAdmin && !config.points.publishPostOptions.includes(bountyNum)) {
      return res.json({ code: 400, msg: "悬赏积分无效" });
    }
    if (!isAdmin && bountyNum > 0) {
      const [userRows] = await pool.query(
        "SELECT points FROM users WHERE id=?",
        [req.user.id],
      );
      if (userRows[0].points < bountyNum)
        return res.json({ code: 400, msg: "您有正在悬赏的提问，当前积分不足" });
    }

    const words = config.sensitiveWords;
    title = filterSensitiveWords(escapeHtml(title), words);
    content = filterSensitiveWords(escapeHtml(content), words);

    const [u] = await pool.query("SELECT campus_id FROM users WHERE id=?", [
      req.user.id,
    ]);
    const campus_id = u[0].campus_id;
    const auditStatus = isAdmin && bountyNum === 0 ? 1 : 0;

    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      if ((!isAdmin || bountyNum > 0) && bountyNum > 0) {
        await conn.query("UPDATE users SET points = points - ? WHERE id = ?", [
          bountyNum,
          req.user.id,
        ]);
        await conn.query(
          "INSERT INTO points_log (user_id, change_amount, type, description) VALUES (?,?,?,?)",
          [req.user.id, -bountyNum, "publish_post", "发布提问扣除悬赏积分"],
        );
      }
      const [result] = await conn.query(
        "INSERT INTO posts (user_id, category_id, title, content, bounty, campus_id, audit_status) VALUES (?,?,?,?,?,?,?)",
        [
          req.user.id,
          category_id,
          title,
          content,
          bountyNum,
          campus_id,
          auditStatus,
        ],
      );
      await conn.commit();
      const msg =
        auditStatus === 1
          ? "提问发布成功（已自动审核通过）"
          : "提问发布成功，等待审核";
      res.json({ code: 200, msg, data: { postId: result.insertId } });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 帖子详情（支持查看自己未审核的回复）
router.get("/:id", async (req, res) => {
  try {
    const [posts] = await pool.query(
      `
      SELECT p.*, u.username, u.nickname, c.name as category_name
      FROM posts p
      JOIN users u ON p.user_id = u.id
      JOIN categories c ON p.category_id = c.id
      WHERE p.id=? AND p.is_deleted=0 AND p.audit_status=1 AND p.is_blocked=0`,
      [req.params.id],
    );
    if (posts.length === 0) return res.json({ code: 404, msg: "帖子不存在" });
    const post = posts[0];

    let currentUserId = 0;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, secret);
        currentUserId = decoded.id || 0;
      } catch (e) {}
    }

    const [replies] = await pool.query(
      `
      SELECT r.*, u.username, u.nickname
      FROM replies r
      JOIN users u ON r.user_id = u.id
      WHERE r.post_id=? AND r.is_deleted=0 AND r.is_blocked=0
        AND (r.is_approved_by_owner=1 OR r.user_id=?)
      ORDER BY r.is_best DESC, r.created_at ASC`,
      [post.id, currentUserId],
    );

    res.json({ code: 200, data: { post, replies } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 发布回复
router.post("/:id/reply", verifyToken, async (req, res) => {
  const postId = req.params.id;

  // 检查当前用户是否被提问者拉黑
  const [blockRows] = await pool.query(
    "SELECT id FROM user_blocks WHERE blocker_id = (SELECT user_id FROM posts WHERE id = ?) AND blocked_id = ?",
    [postId, req.user.id],
  );
  if (blockRows.length > 0) {
    return res.json({ code: 403, msg: "你已被该用户拉黑，无法回复" });
  }

  let { content } = req.body;
  if (!content) return res.json({ code: 400, msg: "内容不能为空" });
  content = filterSensitiveWords(escapeHtml(content), config.sensitiveWords);
  try {
    await pool.query(
      "INSERT INTO replies (post_id, user_id, content) VALUES (?,?,?)",
      [postId, req.user.id, content],
    );
    res.json({ code: 200, msg: "回复成功，待贴主审核后可见" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 贴主审核通过回复
router.put(
  "/:postId/replies/:replyId/approve",
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
router.delete("/:postId/replies/:replyId", verifyToken, async (req, res) => {
  const postId = req.params.postId;
  const replyId = req.params.replyId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [replies] = await conn.query("SELECT * FROM replies WHERE id=?", [
      replyId,
    ]);
    if (!replies.length) return res.json({ code: 404, msg: "回复不存在" });
    const reply = replies[0];
    const [posts] = await conn.query("SELECT * FROM posts WHERE id=?", [
      postId,
    ]);
    if (!posts.length) return res.json({ code: 404, msg: "帖子不存在" });
    const post = posts[0];
    const isPostOwner = post.user_id === req.user.id;
    const isReplyAuthor = reply.user_id === req.user.id;
    if (!isPostOwner && !isReplyAuthor) {
      await conn.rollback();
      return res.json({ code: 403, msg: "无权删除" });
    }

    if (reply.is_best) {
      if (post.bounty > 0) {
        const [answerer] = await conn.query(
          "SELECT points FROM users WHERE id=?",
          [reply.user_id],
        );
        if (answerer[0].points >= post.bounty) {
          await conn.query(
            "UPDATE users SET points = points - ? WHERE id = ?",
            [post.bounty, reply.user_id],
          );
          await conn.query(
            "UPDATE users SET points = points + ? WHERE id = ?",
            [post.bounty, post.user_id],
          );
          await conn.query(
            "INSERT INTO points_log (user_id, change_amount, type, description) VALUES (?,?,?,?)",
            [
              reply.user_id,
              -post.bounty,
              "best_answer_revoked",
              "最佳答案被删除，收回悬赏积分",
            ],
          );
          await conn.query(
            "INSERT INTO points_log (user_id, change_amount, type, description) VALUES (?,?,?,?)",
            [
              post.user_id,
              post.bounty,
              "best_answer_revoked",
              "最佳答案被删除，返还悬赏积分",
            ],
          );
        }
      }
      await conn.query(
        "UPDATE replies SET is_best=0, is_approved_by_owner=0 WHERE id=?",
        [replyId],
      );
      await conn.query("UPDATE posts SET is_resolved=0 WHERE id=?", [postId]);
    }

    await conn.query(
      "UPDATE replies SET is_deleted=1, deleted_at=NOW(), deleted_by=? WHERE id=?",
      [req.user.id, replyId],
    );
    await conn.commit();
    res.json({ code: 200, msg: "已删除" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  } finally {
    conn.release();
  }
});

// 设为最佳答案（不可逆，同时审核通过，发放积分并通知）
router.put("/:postId/replies/:replyId/best", verifyToken, async (req, res) => {
  const postId = req.params.postId;
  const replyId = req.params.replyId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 校验帖子所有权
    const [posts] = await conn.query(
      "SELECT * FROM posts WHERE id=? AND user_id=? AND is_deleted=0",
      [postId, req.user.id],
    );
    if (!posts.length) {
      await conn.rollback();
      return res.json({ code: 403, msg: "无权操作" });
    }
    const post = posts[0];
    if (post.is_resolved) {
      await conn.rollback();
      return res.json({ code: 400, msg: "该问题已有最佳答案" });
    }

    // 校验回复存在
    const [replies] = await conn.query(
      "SELECT * FROM replies WHERE id=? AND post_id=? AND is_deleted=0",
      [replyId, postId],
    );
    if (!replies.length) {
      await conn.rollback();
      return res.json({ code: 400, msg: "回复不存在" });
    }
    const reply = replies[0];

    // 不能自问自答
    if (reply.user_id === req.user.id) {
      await conn.rollback();
      return res.json({ code: 400, msg: "不能将自己的回答设为最佳" });
    }

    // 更新回复为最佳并审核通过，帖子标记为已解决
    await conn.query(
      "UPDATE replies SET is_best=1, is_approved_by_owner=1 WHERE id=?",
      [replyId],
    );
    await conn.query("UPDATE posts SET is_resolved=1 WHERE id=?", [postId]);

    // 积分发放给回答者（积分在发布时已扣除，无需再扣贴主）
    if (post.bounty > 0) {
      await conn.query("UPDATE users SET points = points + ? WHERE id = ?", [
        post.bounty,
        reply.user_id,
      ]);
      await conn.query(
        "INSERT INTO points_log (user_id, change_amount, type, description) VALUES (?,?,?,?)",
        [
          reply.user_id,
          post.bounty,
          "best_answer",
          `问题#${postId}最佳答案获得悬赏`,
        ],
      );
    }

    // 发送系统通知给回答者
    const messageContent = `您在《${post.title}》提问中的回答已被采纳，获得积分 ${post.bounty}。`;
    await conn.query(
      "INSERT INTO user_messages (user_id, from_admin_id, content) VALUES (?, ?, ?)",
      [reply.user_id, null, messageContent],
    );

    // 可选：通知贴主（注释掉）
    const msgToOwner = `您在《${post.title}》中设置的最佳答案已生效。`;
    await conn.query(
      "INSERT INTO user_messages (user_id, from_admin_id, content) VALUES (?, ?, ?)",
      [post.user_id, null, msgToOwner],
    );

    await conn.commit();
    res.json({ code: 200, msg: "已设为最佳答案并通知对方" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  } finally {
    conn.release();
  }
});

// 收藏/取消收藏切换
router.post("/:id/favorite", verifyToken, async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  const conn = await pool.getConnection();
  try {
    const [existing] = await conn.query(
      "SELECT id FROM favorites WHERE user_id=? AND post_id=?",
      [userId, postId],
    );
    if (existing.length > 0) {
      await conn.query("DELETE FROM favorites WHERE user_id=? AND post_id=?", [
        userId,
        postId,
      ]);
      res.json({ code: 200, msg: "已取消收藏", data: { isFavorited: false } });
    } else {
      await conn.query(
        "INSERT INTO favorites (user_id, post_id) VALUES (?,?)",
        [userId, postId],
      );
      res.json({ code: 200, msg: "收藏成功", data: { isFavorited: true } });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  } finally {
    conn.release();
  }
});

// 获取当前用户对某个帖子的收藏状态
router.get("/:id/favorite-status", verifyToken, async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  try {
    const [rows] = await pool.query(
      "SELECT id FROM favorites WHERE user_id=? AND post_id=?",
      [userId, postId],
    );
    res.json({ code: 200, data: { isFavorited: rows.length > 0 } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

module.exports = router;
