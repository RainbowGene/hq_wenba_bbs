const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const upload = require("../middleware/upload");
const config = require("../config/config");

// 图片上传（管理员始终允许，普通用户根据配置）
router.post(
  "/",
  verifyToken,
  (req, res, next) => {
    // 检查权限：管理员直接放行
    if (req.user.role === "admin") {
      return next();
    }
    // 普通用户检查配置
    if (!config.upload.allowUserUpload) {
      return res.status(403).json({ code: 403, msg: "无上传权限" });
    }
    next();
  },
  upload.single("file"),
  (req, res) => {
    if (!req.file) {
      return res.json({ code: 400, msg: "请选择文件" });
    }
    const url = "/uploads/" + req.file.filename;
    res.json({ code: 200, data: { url } });
  },
);

module.exports = router;
