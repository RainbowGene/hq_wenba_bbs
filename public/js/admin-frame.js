// admin-frame.js - 后台框架核心（修复关闭所有后统计看板不刷新）
(function () {
  // ========== 菜单结构 ==========
  const menuData = [
    {
      title: "数据统计",
      items: [
        { name: "统计看板", url: "dashboard.html", icon: "bi-speedometer2" },
      ],
    },
    {
      title: "内容审核",
      items: [
        { name: "审核提问", url: "post-audit.html", icon: "bi-check-circle" },
        {
          name: "提问管理",
          url: "post-manage.html",
          icon: "bi-question-circle",
        },
        { name: "回复管理", url: "reply-manage.html", icon: "bi-chat-dots" },
        { name: "已删提问", url: "trash-posts.html", icon: "bi-trash" },
        { name: "已删回复", url: "trash-replies.html", icon: "bi-trash2" },
      ],
    },
    {
      title: "网站管理",
      items: [
        { name: "栏目分类", url: "category-manage.html", icon: "bi-grid" },
        { name: "会员管理", url: "member-manage.html", icon: "bi-people" },
        { name: "园区管理", url: "campus-manage.html", icon: "bi-building" },
        { name: "公告管理", url: "announcement.html", icon: "bi-megaphone" },
      ],
    },
    {
      title: "其他管理",
      items: [
        { name: "用户反馈", url: "feedback.html", icon: "bi-chat-square-text" },
        { name: "网站配置", url: "site-config.html", icon: "bi-sliders" },
        { name: "登录日志", url: "login-logs.html", icon: "bi-journal-text" },
        {
          name: "IP黑名单",
          url: "ip-blacklist.html",
          icon: "bi-shield-exclamation",
        },
        { name: "操作日志", url: "admin-logs.html", icon: "bi-activity" },
      ],
    },
  ];

  // ========== 侧边栏渲染 ==========
  function renderSidebar() {
    const sidebarNav = document.querySelector("#sidebar .nav");
    let html = "";
    menuData.forEach((group) => {
      html += `<li class="menu-group">
        <div class="menu-group-title" data-toggle-group>
          <span>${group.title}</span>
          <i class="bi bi-chevron-down"></i>
        </div>
        <ul class="nav flex-column menu-group-items">`;
      group.items.forEach((item) => {
        html += `<li class="nav-item">
          <a class="nav-link" data-url="${item.url}" data-name="${item.name}" href="#">
            <i class="${item.icon}"></i> <span>${item.name}</span>
          </a>
        </li>`;
      });
      html += `</ul></li>`;
    });
    sidebarNav.innerHTML = html;

    // 分组折叠
    document.querySelectorAll(".menu-group-title").forEach((title) => {
      title.addEventListener("click", () => {
        const items = title.nextElementSibling;
        items.classList.toggle("collapsed");
        const icon = title.querySelector("i");
        icon.classList.toggle("bi-chevron-down");
        icon.classList.toggle("bi-chevron-up");
      });
    });
  }

  // 侧边栏折叠按钮
  const sidebar = document.getElementById("sidebar");
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
  });

  // ========== 标签页管理 ==========
  const STORAGE_KEY = "admin_tabs";
  let tabs = [];
  let activeIndex = -1;

  function loadTabs() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        tabs = JSON.parse(saved).filter((t) => t.name && t.url);
      }
    } catch (e) {}
    if (!tabs || tabs.length === 0) {
      tabs = [{ name: "统计看板", url: "dashboard.html", active: true }];
    }
    let found = false;
    tabs.forEach((t, i) => {
      if (t.active && !found) {
        activeIndex = i;
        found = true;
      } else t.active = false;
    });
    if (!found && tabs.length > 0) {
      tabs[0].active = true;
      activeIndex = 0;
    }
  }

  function saveTabs() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  }

  // 隐藏 iframe 内旧侧边栏（如果存在）
  function hideIframeSidebar(iframe) {
    if (!iframe || !iframe.contentDocument) return;
    try {
      const doc = iframe.contentDocument;
      const selectors = [
        "nav.bg-dark",
        ".d-flex > nav",
        "body > div > nav:first-child",
        ".sidebar",
      ];
      for (let sel of selectors) {
        const nav = doc.querySelector(sel);
        if (nav) {
          nav.style.display = "none";
          const content = nav.nextElementSibling;
          if (content && content.style) {
            content.style.flex = "1";
            content.style.width = "100%";
          }
          break;
        }
      }
    } catch (e) {}
  }

  // 创建/更新 iframe，确保 src 匹配
  function ensureIframe(index) {
    const id = "iframe-" + index;
    const url = tabs[index].url;
    let iframe = document.getElementById(id);
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = id;
      iframe.src = url;
      iframe.style.display = "none";
      iframe.addEventListener("load", () => hideIframeSidebar(iframe));
      document.getElementById("iframeContainer").appendChild(iframe);
    } else {
      // 如果已存在但 src 不匹配，则更新 src
      if (
        iframe.src !== window.location.origin + "/" + url &&
        iframe.src !== url
      ) {
        iframe.src = url;
      }
    }
    return iframe;
  }

  // 更新所有 iframe 可见性
  function updateIframeVisibility() {
    tabs.forEach((tab, index) => {
      const iframe = document.getElementById("iframe-" + index);
      if (iframe) {
        iframe.style.display = tab.active ? "block" : "none";
      }
    });
  }

  // 清除孤立 iframe
  function removeOrphanIframes() {
    const container = document.getElementById("iframeContainer");
    const allIframes = container.querySelectorAll("iframe");
    const ids = tabs.map((_, i) => "iframe-" + i);
    allIframes.forEach((iframe) => {
      if (!ids.includes(iframe.id)) {
        iframe.remove();
      }
    });
  }

  // 渲染标签栏
  function renderTabsBar() {
    const container = document.getElementById("tabContainer");
    let html = "";
    tabs.forEach((tab, index) => {
      html += `<div class="tab-item ${tab.active ? "active" : ""}" data-index="${index}">
        ${tab.name}
        <span class="tab-close" data-index="${index}">&times;</span>
      </div>`;
    });
    container.innerHTML = html;
  }

  // 全量刷新界面
  function refreshUI() {
    renderTabsBar();
    // 确保所有当前标签都有对应的 iframe
    tabs.forEach((_, i) => ensureIframe(i));
    removeOrphanIframes();
    updateIframeVisibility();
  }

  // 切换标签
  function switchTab(index) {
    if (index === activeIndex) return;
    tabs.forEach((t, i) => (t.active = i === index));
    activeIndex = index;
    saveTabs();
    refreshUI();
    const url = tabs[index].url;
    document.querySelectorAll("#sidebar .nav-link").forEach((l) => {
      l.classList.toggle("active", l.dataset.url === url);
    });
  }

  // 关闭标签
  function closeTab(index) {
    if (tabs.length <= 1) return;
    const wasActive = tabs[index].active;
    tabs.splice(index, 1);
    if (wasActive) {
      if (index < tabs.length) activeIndex = index;
      else activeIndex = tabs.length - 1;
      tabs[activeIndex].active = true;
    } else {
      activeIndex = tabs.findIndex((t) => t.active);
      if (activeIndex === -1) {
        activeIndex = 0;
        tabs[0].active = true;
      }
    }
    saveTabs();
    refreshUI();
  }

  // 刷新指定标签（重新加载 iframe）
  function refreshTab(index) {
    const iframe = document.getElementById("iframe-" + index);
    if (iframe) {
      iframe.src = iframe.src;
    }
  }

  // 打开或新建标签
  function openTab(name, url) {
    const existing = tabs.findIndex((t) => t.url === url);
    if (existing !== -1) {
      switchTab(existing);
      return;
    }
    tabs.forEach((t) => (t.active = false));
    tabs.push({ name, url, active: true });
    activeIndex = tabs.length - 1;
    saveTabs();
    refreshUI();
    document.querySelectorAll("#sidebar .nav-link").forEach((l) => {
      l.classList.toggle("active", l.dataset.url === url);
    });
  }

  // ========== 右键菜单 ==========
  const contextMenu = document.getElementById("tabContextMenu");
  let contextTabIndex = -1;

  document
    .getElementById("tabContainer")
    .addEventListener("contextmenu", (e) => {
      const tabItem = e.target.closest(".tab-item");
      if (!tabItem) return;
      e.preventDefault();
      contextTabIndex = parseInt(tabItem.dataset.index);
      contextMenu.style.display = "block";
      contextMenu.style.left = e.pageX + "px";
      contextMenu.style.top = e.pageY + "px";
    });

  document.addEventListener(
    "click",
    () => (contextMenu.style.display = "none"),
  );

  contextMenu.querySelectorAll(".context-item").forEach((item) => {
    item.addEventListener("click", () => {
      const action = item.dataset.action;
      if (action === "close") closeTab(contextTabIndex);
      else if (action === "close-others") {
        const keep = tabs[contextTabIndex];
        tabs = [keep];
        keep.active = true;
        activeIndex = 0;
        saveTabs();
        refreshUI();
      } else if (action === "close-all") {
        tabs = [{ name: "统计看板", url: "dashboard.html", active: true }];
        activeIndex = 0;
        saveTabs();
        refreshUI();
        // 强制刷新统计看板 iframe
        const iframe = document.getElementById("iframe-0");
        if (iframe) {
          iframe.src = "dashboard.html";
        }
      } else if (action === "refresh") {
        refreshTab(contextTabIndex);
      }
      contextMenu.style.display = "none";
    });
  });

  // 标签栏点击事件
  document.getElementById("tabContainer").addEventListener("click", (e) => {
    if (e.target.classList.contains("tab-close")) {
      e.stopPropagation();
      closeTab(parseInt(e.target.dataset.index));
      return;
    }
    const tabItem = e.target.closest(".tab-item");
    if (tabItem) switchTab(parseInt(tabItem.dataset.index));
  });

  // 侧边栏菜单点击
  document.querySelector("#sidebar").addEventListener("click", (e) => {
    const link = e.target.closest("a.nav-link");
    if (link) {
      e.preventDefault();
      openTab(link.dataset.name, link.dataset.url);
    }
  });

  // 退出登录
  document.getElementById("logoutBtn").addEventListener("click", logout);

  // ========== 初始化 ==========
  function init() {
    renderSidebar();
    loadTabs();
    tabs.forEach((_, i) => ensureIframe(i));
    refreshUI();
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    document.getElementById("adminNickname").textContent =
      user.nickname || user.username || "管理员";
    const activeTab = tabs.find((t) => t.active);
    if (activeTab) {
      document.querySelectorAll("#sidebar .nav-link").forEach((l) => {
        if (l.dataset.url === activeTab.url) l.classList.add("active");
      });
    }
  }
  init();
})();
