// common.js - 公共工具（增强版）
function getToken() {
  return localStorage.getItem("token");
}

async function api(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (getToken()) {
    headers["Authorization"] = `Bearer ${getToken()}`;
  }
  const res = await fetch(url, { ...options, headers });
  const data = await res.json();
  if (data.code === 401) {
    localStorage.clear();
    window.location.href = "/login.html";
    return;
  }
  return data;
}

// 退出登录（防御性调用 ModalAlert）
async function logout() {
  if (window.ModalAlert && typeof window.ModalAlert.confirm === "function") {
    const confirmed = await window.ModalAlert.confirm(
      "确认退出",
      "确定要退出当前账号吗？",
      "退出",
      "取消",
    );
    if (!confirmed) return;
  } else {
    // 降级为原生确认框
    if (!window.confirm("确定要退出当前账号吗？")) return;
  }
  localStorage.clear();
  window.location.href = "/login.html";
}

function renderPagination(container, page, total, size, callback) {
  const totalPages = Math.ceil(total / size);
  let html = '<ul class="pagination pagination-sm">';
  html += `<li class="page-item ${page <= 1 ? "disabled" : ""}"><a class="page-link" href="#" data-page="${page - 1}">上一页</a></li>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<li class="page-item ${i === page ? "active" : ""}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
  }
  html += `<li class="page-item ${page >= totalPages ? "disabled" : ""}"><a class="page-link" href="#" data-page="${page + 1}">下一页</a></li>`;
  html += "</ul>";
  container.innerHTML = html;
  container.querySelectorAll("a.page-link").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const p = parseInt(a.dataset.page);
      if (p && p !== page) callback(p);
    });
  });
}

// ========== 集成 ModalAlert 提示组件 ==========
// 如果页面已加载 modal-alert.js 则自动可用，无需额外操作
// 提供便捷方法，也可以选择覆盖原生 alert（取消注释即可启用）

// window.alert = function(message) {
//   window.ModalAlert.info(typeof message === 'string' ? message : JSON.stringify(message), '提示');
// };
