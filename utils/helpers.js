// XSS 简单过滤（生产环境可扩展）
function escapeHtml(text) {
  if (!text) return text;
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 敏感词过滤，替换为 ***
function filterSensitiveWords(text, words) {
  if (!text || !words || words.length === 0) return text;
  let result = text;
  words.forEach((word) => {
    const reg = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    result = result.replace(reg, "***");
  });
  return result;
}

module.exports = { escapeHtml, filterSensitiveWords };
