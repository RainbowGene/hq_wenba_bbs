const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./config/config");

const authRoutes = require("./routes/auth");
const postRoutes = require("./routes/posts");
const userRoutes = require("./routes/user"); // 个人中心
const publicRoutes = require("./routes/public"); // 首页公共数据
const adminRoutes = require("./routes/admin");
const uploadRoutes = require("./routes/upload");
const adminPostEditRoutes = require("./routes/admin-post-edit");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(config.upload.path));

// 路由挂载
app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/user", userRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/admin/posts", adminPostEditRoutes);

// 处理前端路由（SPA）
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = config.server.port || 3000;
app.listen(PORT, () => {
  console.log(`问吧系统启动于端口 ${PORT}`);
});
