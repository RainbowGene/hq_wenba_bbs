const jwt = require("jsonwebtoken");
const secret = "wenba_secret_key"; // 与登录共用同一密钥，生产环境建议独立

/**
 * 生成指定长度的随机字符串（数字+大写字母，容易辨认）
 */
function randomCode(length = 4) {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 去掉易混淆字符 0,1,O,I
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * 根据文本生成 SVG 验证码图片
 */
function generateSvg(text) {
  const width = 100;
  const height = 36;
  const bgColor = "#f0f0f0";
  const fontColor = "#333";
  const noiseColor = "#ccc";

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="100%" height="100%" fill="${bgColor}" />`;

  // 干扰线
  for (let i = 0; i < 5; i++) {
    const x1 = Math.floor(Math.random() * width);
    const y1 = Math.floor(Math.random() * height);
    const x2 = Math.floor(Math.random() * width);
    const y2 = Math.floor(Math.random() * height);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${noiseColor}" stroke-width="1" />`;
  }

  // 文字
  const fontSize = 22;
  const letterSpacing = width / (text.length + 1);
  for (let i = 0; i < text.length; i++) {
    const x = letterSpacing * (i + 1) - fontSize / 2 + (Math.random() * 4 - 2);
    const y = height / 2 + fontSize / 2 + (Math.random() * 6 - 3);
    const rotate = Math.random() * 30 - 15;
    svg += `<text x="${x}" y="${y}" font-family="Arial" font-size="${fontSize}" fill="${fontColor}" transform="rotate(${rotate}, ${x}, ${y})">${text[i]}</text>`;
  }

  // 干扰点
  for (let i = 0; i < 20; i++) {
    const cx = Math.floor(Math.random() * width);
    const cy = Math.floor(Math.random() * height);
    svg += `<circle cx="${cx}" cy="${cy}" r="1" fill="${noiseColor}" />`;
  }

  svg += "</svg>";
  return svg;
}

/**
 * 生成验证码，返回 SVG 内容与加密 token（有效期5分钟）
 */
function generateCaptcha() {
  const code = randomCode(4);
  const token = jwt.sign({ code, type: "captcha" }, secret, {
    expiresIn: "5m",
  });
  const svg = generateSvg(code);
  return { token, svg };
}

/**
 * 校验验证码（传入 token 和用户输入，返回布尔值）
 */
function verifyCaptcha(token, userInput) {
  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.type !== "captcha") return false;
    return decoded.code.toUpperCase() === userInput.toUpperCase();
  } catch (e) {
    return false;
  }
}

module.exports = { generateCaptcha, verifyCaptcha };
