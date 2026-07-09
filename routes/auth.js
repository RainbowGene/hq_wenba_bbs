const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../models/db");
const { escapeHtml, filterSensitiveWords } = require("../utils/helpers");
const config = require("../config/config");
const { verifyToken } = require("../middleware/auth");
const { generateCaptcha, verifyCaptcha } = require("../utils/captcha");

const secret = "wenba_secret_key";
const USERNAME_REG = /^[A-Z]\d{7}$/;
const PASSWORD_MIN = 6,
  PASSWORD_MAX = 12;

// ========== 获取验证码 ==========
router.get("/captcha", (req, res) => {
  try {
    const { token, svg } = generateCaptcha();
    res.json({ code: 200, data: { captchaToken: token, svg } });
  } catch (err) {
    res.status(500).json({ code: 500, msg: "验证码生成失败" });
  }
});

// 注册
router.post("/register", async (req, res) => {
  try {
    let {
      username,
      password,
      nickname,
      campus_id,
      id_card,
      contact,
      security_question,
      security_answer,
      captchaToken,
    } = req.body;

    // 基础校验
    if (!USERNAME_REG.test(username))
      return res.json({
        code: 400,
        msg: "账号格式错误：需为1大写字母+7位数字",
      });
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)
      return res.json({ code: 400, msg: "密码长度6-12字符" });
    if (nickname.replace(/[^\x00-\xff]/g, "aa").length > 6 * 3)
      return res.json({ code: 400, msg: "昵称最长6个汉字" });
    if (!campus_id || !id_card || !contact || !security_answer)
      return res.json({ code: 400, msg: "请填写所有必填项" });

    // 验证码校验
    if (!captchaToken) return res.json({ code: 400, msg: "验证码缺失" });
    // 注意：前端可能传入 captchaInput 和 captchaToken，我们这里统一接收 captchaToken，并在 verifyCaptcha 中比对
    // 但我们的 verifyCaptcha 需要 captchaToken 和用户输入，因此前端需将输入的验证码也传来。
    // 前端已将 captchaToken 和 captchaInput 分开传递，这里修正：实际我们需要 captchaToken 和用户输入的验证码。
    // 因此还是从 req.body 中取 captchaToken 和 captchaInput。
    const { captchaInput } = req.body;
    if (!captchaInput || !verifyCaptcha(captchaToken, captchaInput))
      return res.json({ code: 400, msg: "验证码错误或已过期" });

    // 强制设置密保问题为“身份证后6位”
    security_question = "身份证后6位";

    // XSS 过滤
    username = escapeHtml(username);
    nickname = escapeHtml(nickname);
    security_question = escapeHtml(security_question);
    security_answer = escapeHtml(security_answer);
    nickname = filterSensitiveWords(nickname, config.sensitiveWords);

    // 检查账号唯一性
    const [rows] = await pool.query("SELECT id FROM users WHERE username = ?", [
      username,
    ]);
    if (rows.length > 0) return res.json({ code: 400, msg: "账号已存在" });

    const password_hash = await bcrypt.hash(password, 10);
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      const [result] = await conn.query(
        "INSERT INTO users (username, password_hash, nickname, campus_id, id_card, contact, security_question, security_answer, points) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          username,
          password_hash,
          nickname,
          campus_id,
          id_card,
          contact,
          security_question,
          security_answer,
          config.points.registerReward,
        ],
      );
      const userId = result.insertId;
      await conn.query(
        "INSERT INTO points_log (user_id, change_amount, type, description) VALUES (?,?,?,?)",
        [userId, config.points.registerReward, "register", "注册奖励"],
      );
      await conn.commit();
      res.json({ code: 200, msg: "注册成功，赠送300积分" });
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

// ========== 登录（增强：验证码校验 + 7天免登录） ==========
router.post("/login", async (req, res) => {
  try {
    const { username, password, captchaToken, captchaInput, rememberMe } =
      req.body;
    if (!username || !password)
      return res.json({ code: 400, msg: "请输入账号和密码" });

    // 验证码校验
    if (!captchaToken || !captchaInput)
      return res.json({ code: 400, msg: "请输入验证码" });
    if (!verifyCaptcha(captchaToken, captchaInput))
      return res.json({ code: 400, msg: "验证码错误或已过期" });

    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);
    if (rows.length === 0)
      return res.json({ code: 400, msg: "账号或密码错误" });
    const user = rows[0];
    if (user.status !== 1) {
      const statusText = user.status === 0 ? "已冻结" : "已封禁";
      return res.json({ code: 403, msg: `账号${statusText}，无法登录` });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.json({ code: 400, msg: "账号或密码错误" });

    // 生成 JWT，7天免登录则有效期设为7天，否则8小时
    const expiresIn = rememberMe ? "7d" : "8h";
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        nickname: user.nickname,
      },
      secret,
      { expiresIn },
    );

    // 记录登录日志
    const ip = req.ip || req.connection.remoteAddress;
    await pool.query(
      "INSERT INTO login_logs (user_id, username, ip) VALUES (?,?,?)",
      [user.id, user.username, ip],
    );

    // 每日登录积分奖励（当天仅一次）
    const today = new Date().toISOString().slice(0, 10);
    const [logRows] = await pool.query(
      "SELECT id FROM points_log WHERE user_id=? AND type=? AND DATE(created_at)=?",
      [user.id, "daily_login", today],
    );
    if (logRows.length === 0) {
      await pool.query(
        "INSERT INTO points_log (user_id, change_amount, type, description) VALUES (?,?,?,?)",
        [
          user.id,
          config.points.dailyLoginReward,
          "daily_login",
          "每日登录奖励",
        ],
      );
      await pool.query("UPDATE users SET points = points + ? WHERE id = ?", [
        config.points.dailyLoginReward,
        user.id,
      ]);
    }

    res.json({
      code: 200,
      msg: "登录成功",
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          role: user.role,
          points:
            user.points +
            (logRows.length === 0 ? config.points.dailyLoginReward : 0),
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 找回密码 - 验证密保（固定问题“身份证后6位”）
router.post("/forgot-password/verify", async (req, res) => {
  const { username, security_answer } = req.body;
  if (!username || !security_answer)
    return res.json({ code: 400, msg: "账号和密保答案不能为空" });
  try {
    // 查询用户，密保问题固定为身份证后6位
    const [rows] = await pool.query(
      "SELECT security_question, security_answer FROM users WHERE username = ? AND security_question = ?",
      [username, "身份证后6位"],
    );
    if (rows.length === 0)
      return res.json({ code: 400, msg: "账号不存在或密保问题不匹配" });
    const user = rows[0];
    if (user.security_answer !== security_answer)
      return res.json({ code: 400, msg: "密保答案错误" });
    const resetToken = jwt.sign({ username, action: "reset_pwd" }, secret, {
      expiresIn: "10m",
    });
    res.json({ code: 200, msg: "验证通过", data: { resetToken } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

// 重置密码
router.post("/forgot-password/reset", async (req, res) => {
  const { resetToken, newPassword } = req.body;
  try {
    const decoded = jwt.verify(resetToken, secret);
    if (decoded.action !== "reset_pwd")
      return res.json({ code: 400, msg: "无效的重置令牌" });
    if (newPassword.length < 6 || newPassword.length > 12)
      return res.json({ code: 400, msg: "密码长度6-12字符" });
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash=? WHERE username=?", [
      hash,
      decoded.username,
    ]);
    res.json({ code: 200, msg: "密码重置成功" });
  } catch (err) {
    if (err.name === "TokenExpiredError")
      return res.json({ code: 400, msg: "重置令牌已过期" });
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

module.exports = router;
