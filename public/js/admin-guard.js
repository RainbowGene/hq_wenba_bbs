// admin-guard.js - 后台权限守卫（iframe 兼容版）
(function () {
  // 如果不是在 iframe 中，且当前页面不是框架首页，则跳转到框架首页
  if (
    window.top === window.self &&
    !window.location.pathname.endsWith("/admin/index.html")
  ) {
    window.location.replace("/admin/index.html");
    return;
  }

  // 如果在 iframe 中，或就是框架首页，继续执行权限验证
  document.documentElement.style.display = "none";

  const token = localStorage.getItem("token");
  if (!token) {
    window.location.replace("/login.html");
    return;
  }

  fetch("/api/admin/check", {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.code === 200) {
        document.documentElement.style.display = "";
      } else {
        window.location.replace("/login.html");
      }
    })
    .catch(() => {
      window.location.replace("/login.html");
    });
})();
