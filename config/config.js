const path = require("path");
const fs = require("fs");

// 默认配置（若config.json不存在，则创建）
const defaultConfig = {
  db: {
    host: "127.0.0.1",
    port: 3306,
    user: "root",
    password: "root",
    database: "wenba",
    connectionLimit: 10,
  },
  sensitiveWords: ["敏感词1", "敏感词2", "反动", "广告"],
  points: {
    registerReward: 300, // 注册奖励
    dailyLoginReward: 5, // 每日登录奖励（配置）
    publishPostMin: 50, // 最小悬赏积分
    publishPostOptions: [50, 100, 200], // 可选悬赏值
  },
  upload: {
    path: path.join(__dirname, "..", "uploads"),
    maxSize: 15 * 1024 * 1024, // 15MB
    allowedTypes: ["image/jpeg", "image/png", "image/gif"],
    allowUserUpload: false, // 是否允许普通用户上传图片（管理员始终允许）
  },
  server: {
    port: 3000,
  },
};

// 实际动态配置存放文件
const configPath = path.join(__dirname, "config.json");

let dynamicConfig = {};
try {
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf8");
    dynamicConfig = JSON.parse(raw);
  }
} catch (e) {
  dynamicConfig = {};
}

// 深度合并，优先使用动态配置
const config = Object.assign({}, defaultConfig, dynamicConfig);
// 对于对象深度合并
if (dynamicConfig.db)
  config.db = Object.assign({}, defaultConfig.db, dynamicConfig.db);
if (dynamicConfig.points)
  config.points = Object.assign({}, defaultConfig.points, dynamicConfig.points);
if (dynamicConfig.upload)
  config.upload = Object.assign({}, defaultConfig.upload, dynamicConfig.upload);
if (dynamicConfig.sensitiveWords)
  config.sensitiveWords = dynamicConfig.sensitiveWords;

// 提供更新配置并写入文件的方法
config.save = function (newConfig) {
  try {
    const current = JSON.parse(fs.readFileSync(configPath, "utf8") || "{}");
    const merged = Object.assign(current, newConfig);
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf8");
    // 同时更新到模块导出对象
    if (newConfig.sensitiveWords)
      config.sensitiveWords = newConfig.sensitiveWords;
    if (newConfig.points) Object.assign(config.points, newConfig.points);
    // 其他字段同样处理
    return true;
  } catch (e) {
    console.error("配置文件写入失败:", e);
    return false;
  }
};

module.exports = config;
