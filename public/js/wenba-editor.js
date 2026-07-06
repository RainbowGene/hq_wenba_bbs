// wenba-editor.js - 基于 Quill 的富文本编辑器封装（管理员免上传限制）
(function () {
  // 加载 Quill 样式
  if (!document.getElementById("quill-css")) {
    const link = document.createElement("link");
    link.id = "quill-css";
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css";
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function ensureQuill() {
    if (typeof Quill !== "undefined") return;
    await loadScript("https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js");
  }

  // 获取当前用户角色（简单从 localStorage 读取）
  function getUserRole() {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      return user.role || "user";
    } catch (e) {
      return "user";
    }
  }

  window.WenbaEditor = {
    create: async function (container, options = {}) {
      await ensureQuill();
      const el =
        typeof container === "string"
          ? document.querySelector(container)
          : container;
      if (!el) throw new Error("容器不存在");

      el.style.height = options.height || "300px";
      el.innerHTML = "";

      const quill = new Quill(el, {
        theme: "snow",
        modules: {
          toolbar: {
            container: [
              [{ header: [1, 2, 3, false] }],
              ["bold", "italic", "underline", "strike"],
              [{ color: [] }, { background: [] }],
              [{ list: "ordered" }, { list: "bullet" }],
              ["blockquote", "code-block"],
              [{ align: [] }],
              ["link", "image", "video"],
              ["clean"],
            ],
            handlers: {
              image: function () {
                // 管理员直接允许上传，普通用户检查配置（简化：直接上传，后端做权限控制）
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  try {
                    const res = await fetch("/api/upload", {
                      method: "POST",
                      headers: { Authorization: `Bearer ${getToken()}` },
                      body: formData,
                    });
                    const data = await res.json();
                    if (data.code === 200) {
                      const range = quill.getSelection(true);
                      quill.insertEmbed(range.index, "image", data.data.url);
                    } else {
                      ModalAlert.error(data.msg || "上传失败");
                    }
                  } catch (err) {
                    ModalAlert.error("上传出错");
                  }
                };
                input.click();
              },
            },
          },
        },
        placeholder: options.placeholder || "请输入内容...",
      });

      if (options.content) {
        quill.root.innerHTML = options.content;
      }

      return {
        quill,
        container: el,
        getContent: () => quill.root.innerHTML,
        setContent: (html) => (quill.root.innerHTML = html),
        getText: () => quill.getText(),
        destroy: () => {},
      };
    },
  };
})();
