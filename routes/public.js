const express = require("express");
const router = express.Router();
const pool = require("../models/db");

// 栏目分类（含二级）
router.get("/categories", async (req, res) => {
  const [categories] = await pool.query(
    "SELECT id, name, parent_id FROM categories",
  );
  const tree = [];
  const map = {};
  categories.forEach((c) => {
    map[c.id] = { ...c, children: [] };
  });
  categories.forEach((c) => {
    if (c.parent_id) {
      map[c.parent_id]?.children.push(map[c.id]);
    } else {
      tree.push(map[c.id]);
    }
  });
  res.json({ code: 200, data: tree });
});

// 轮播图（公告中标记为轮播的）
router.get("/carousel", async (req, res) => {
  const [items] = await pool.query(
    "SELECT title, cover_image, link_url FROM announcements WHERE is_carousel=1 AND is_active=1 ORDER BY created_at DESC LIMIT 5",
  );
  res.json({ code: 200, data: items });
});

// 公告列表
router.get("/announcements", async (req, res) => {
  const [list] = await pool.query(
    "SELECT id, title, content, created_at FROM announcements WHERE is_active=1 AND is_carousel=0 ORDER BY created_at DESC LIMIT 10",
  );
  res.json({ code: 200, data: list });
});

// 待解决问题（未解决且审核通过的）
router.get("/unsolved", async (req, res) => {
  const [posts] = await pool.query(`
    SELECT p.id, p.title, p.bounty, p.created_at, u.nickname
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE p.audit_status=1 AND p.is_deleted=0 AND p.is_resolved=0 AND p.is_blocked=0
    ORDER BY p.created_at DESC LIMIT 10`);
  res.json({ code: 200, data: posts });
});

// 推荐帖子
router.get("/recommended", async (req, res) => {
  const [posts] = await pool.query(`
    SELECT p.id, p.title, p.bounty, p.created_at, u.nickname
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE p.is_recommended=1 AND p.audit_status=1 AND p.is_deleted=0 AND p.is_blocked=0
    ORDER BY p.created_at DESC LIMIT 10`);
  res.json({ code: 200, data: posts });
});

// 最新回复区（最近回复的帖子）
router.get("/latest-reply", async (req, res) => {
  const [posts] = await pool.query(`
    SELECT p.id, p.title, p.bounty, MAX(r.created_at) as last_reply, u.nickname as poster
    FROM posts p
    JOIN replies r ON p.id = r.post_id AND r.is_deleted=0 AND r.is_approved_by_owner=1
    JOIN users u ON p.user_id = u.id
    WHERE p.audit_status=1 AND p.is_deleted=0 AND p.is_blocked=0
    GROUP BY p.id
    ORDER BY last_reply DESC LIMIT 10`);
  res.json({ code: 200, data: posts });
});

// 按分类获取帖子
router.get("/posts-by-category/:categoryId", async (req, res) => {
  const { page = 1, size = 20 } = req.query;
  const offset = (page - 1) * size;
  const catId = req.params.categoryId;
  // 获取该分类及其子分类
  const [subCats] = await pool.query(
    "SELECT id FROM categories WHERE parent_id=? OR id=?",
    [catId, catId],
  );
  const ids = subCats.map((c) => c.id);
  const [posts] = await pool.query(
    `
    SELECT p.id, p.title, p.bounty, p.created_at, u.nickname
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE p.category_id IN (?) AND p.audit_status=1 AND p.is_deleted=0 AND p.is_blocked=0
    ORDER BY p.created_at DESC LIMIT ?,?`,
    [ids, offset, +size],
  );
  const [[{ total }]] = await pool.query(
    "SELECT COUNT(*) as total FROM posts WHERE category_id IN (?) AND audit_status=1 AND is_deleted=0 AND is_blocked=0",
    [ids],
  );
  res.json({ code: 200, data: { list: posts, total, page: +page } });
});

router.get("/campuses", async (req, res) => {
  const [campuses] = await pool.query("SELECT id, name FROM campus");
  res.json({ code: 200, data: campuses });
});

router.get("/config/upload", async (req, res) => {
  const config = require("../config/config");
  res.json({
    code: 200,
    data: { allowUserUpload: config.upload.allowUserUpload },
  });
});
module.exports = router;
