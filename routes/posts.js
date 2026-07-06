const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const { escapeHtml, filterSensitiveWords } = require("../utils/helpers");
const config = require("../config/config");
const pool = require("../models/db");

// 发布提问（需登录）
// 发布提问
router.post("/", verifyToken, async (req, res) => {
  try {
    let { category_id, title, content, bounty } = req.body;
    if (!category_id || !title || !content) {
      return res.json({ code: 400, msg: "参数不完整" });
    }
    // 悬赏积分：普通用户必须选择有效的积分值，管理员可免悬赏
    const bountyNum = parseInt(bounty) || 0;
    const isAdmin = req.user.role === "admin";

    if (!isAdmin) {
      // 普通用户必须选择允许的悬赏积分
      if (!config.points.publishPostOptions.includes(bountyNum)) {
        return res.json({ code: 400, msg: "悬赏积分无效" });
      }
    } else {
      // 管理员悬赏积分可以是0（表示不悬赏）或允许的值
      if (
        bountyNum !== 0 &&
        !config.points.publishPostOptions.includes(bountyNum)
      ) {
        return res.json({ code: 400, msg: "悬赏积分无效" });
      }
    }

    // 普通用户检查积分是否足够
    if (!isAdmin && bountyNum > 0) {
      const [userRows] = await pool.query(
        "SELECT points FROM users WHERE id=?",
        [req.user.id],
      );
      if (userRows[0].points < bountyNum) {
        return res.json({ code: 400, msg: "积分不足" });
      }
    }

    // 过滤内容
    const words = config.sensitiveWords;
    title = filterSensitiveWords(escapeHtml(title), words);
    content = filterSensitiveWords(escapeHtml(content), words);

    // 获取用户园区
    const [u] = await pool.query("SELECT campus_id FROM users WHERE id=?", [
      req.user.id,
    ]);
    const campus_id = u[0].campus_id;

    // 审核状态：管理员免悬赏时直接通过，否则待审核
    // const auditStatus = isAdmin && bountyNum === 0 ? 1 : 0;
    const auditStatus = 1; // 这里直接免审核了

    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      // 如果需要扣积分
      if (!isAdmin || bountyNum > 0) {
        // 管理员悬赏积分>0 也需扣除积分，此处按普通用户逻辑
        if (bountyNum > 0) {
          await conn.query(
            "UPDATE users SET points = points - ? WHERE id = ?",
            [bountyNum, req.user.id],
          );
          await conn.query(
            "INSERT INTO points_log (user_id, change_amount, type, description) VALUES (?,?,?,?)",
            [req.user.id, -bountyNum, "publish_post", "发布提问扣除悬赏积分"],
          );
        }
      }

      // 插入帖子
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

// 帖子详情
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
    // 获取回复（仅贴主审核通过的）
    const [replies] = await pool.query(
      `
      SELECT r.*, u.username, u.nickname
      FROM replies r
      JOIN users u ON r.user_id = u.id
      WHERE r.post_id=? AND r.is_deleted=0 AND r.is_blocked=0 AND r.is_approved_by_owner=1
      ORDER BY r.is_best DESC, r.created_at ASC`,
      [post.id],
    );
    res.json({ code: 200, data: { post, replies } });
  } catch (err) {
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 发布回复
router.post("/:id/reply", verifyToken, async (req, res) => {
  const postId = req.params.id;
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
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 贴主审核自己帖子下的留言（我的提问中操作）
router.put(
  "/:postId/replies/:replyId/approve",
  verifyToken,
  async (req, res) => {
    // 校验帖子是否属于当前用户
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

// 贴主删除留言（软删除进回收站）
router.delete("/:postId/replies/:replyId", verifyToken, async (req, res) => {
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
});

// 设为最佳答案（转积分）
router.put("/:postId/replies/:replyId/best", verifyToken, async (req, res) => {
  const postId = req.params.postId;
  const replyId = req.params.replyId;
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    // 校验帖子归属
    const [posts] = await conn.query(
      "SELECT * FROM posts WHERE id=? AND user_id=? AND is_deleted=0",
      [postId, req.user.id],
    );
    if (!posts.length) return res.json({ code: 400, msg: "无权操作" });
    const post = posts[0];
    if (post.is_resolved)
      return res.json({ code: 400, msg: "该问题已有最佳答案" });
    // 查找回复
    const [replies] = await conn.query(
      "SELECT * FROM replies WHERE id=? AND post_id=? AND is_deleted=0",
      [replyId, postId],
    );
    if (!replies.length) return res.json({ code: 400, msg: "回复不存在" });
    // 设置最佳
    await conn.query("UPDATE replies SET is_best=1 WHERE id=?", [replyId]);
    await conn.query("UPDATE posts SET is_resolved=1 WHERE id=?", [postId]);
    // 转账积分给回复者
    const bounty = post.bounty;
    await conn.query("UPDATE users SET points = points + ? WHERE id = ?", [
      bounty,
      replies[0].user_id,
    ]);
    await conn.query(
      "INSERT INTO points_log (user_id, change_amount, type, description) VALUES (?,?,?,?)",
      [
        replies[0].user_id,
        bounty,
        "best_answer",
        `问题#${postId}最佳答案获得悬赏`,
      ],
    );
    await conn.commit();
    res.json({ code: 200, msg: "已设为最佳答案，积分已转给回答者" });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

module.exports = router;
