const { escapeHtml, filterSensitiveWords } = require("../utils/helpers");
const config = require("../config/config");

/**
 * 请求体过滤中间件
 * 对所有 req.body 中的字符串字段进行 XSS 转义和敏感词过滤
 * 可在需要的路由上显式调用，也可全局使用
 */
function bodyFilter(req, res, next) {
  if (req.body) {
    for (let key in req.body) {
      if (typeof req.body[key] === "string") {
        req.body[key] = escapeHtml(req.body[key]);
        req.body[key] = filterSensitiveWords(
          req.body[key],
          config.sensitiveWords,
        );
      }
    }
  }
  next();
}

module.exports = { bodyFilter };
