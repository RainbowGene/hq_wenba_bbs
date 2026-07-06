const jwt = require("jsonwebtoken"); // 需要安装 jsonwebtoken
const secret = "wenba_secret_key"; // 建议放配置文件

// 登录校验中间件
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ code: 401, msg: "请先登录" });
  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded; // {id, username, role}
    next();
  } catch (err) {
    return res.status(401).json({ code: 401, msg: "登录已过期" });
  }
}

// 管理员权限校验
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ code: 403, msg: "无管理员权限" });
  }
  next();
}

module.exports = { verifyToken, requireAdmin };
