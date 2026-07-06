// edit-post-modal.js - 修复内容实体化 + 等待依赖
(function () {
  function waitForDependencies(callback) {
    if (
      window.WenbaEditor &&
      window.WenbaEditor.create &&
      window.ModalAlert &&
      window.ModalAlert.success
    ) {
      callback();
    } else {
      let retries = 0;
      const maxRetries = 50;
      const timer = setInterval(() => {
        if (
          window.WenbaEditor &&
          window.WenbaEditor.create &&
          window.ModalAlert &&
          window.ModalAlert.success
        ) {
          clearInterval(timer);
          callback();
        } else if (++retries > maxRetries) {
          clearInterval(timer);
          console.error("edit-post-modal 依赖未加载");
        }
      }, 100);
    }
  }

  // HTML 反转义
  function unescapeHtml(text) {
    if (!text) return "";
    const map = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&#039;": "'",
    };
    return text.replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, (m) => map[m]);
  }

  waitForDependencies(function () {
    if (document.getElementById("editPostModal")) return;

    const modalHTML = `
      <div class="modal fade" id="editPostModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">编辑提问</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="editPostForm">
                <input type="hidden" id="editPostId">
                <div class="mb-3">
                  <label class="form-label">标题</label>
                  <input type="text" class="form-control" id="editTitle" required>
                </div>
                <div class="row mb-3">
                  <div class="col-md-6">
                    <label class="form-label">分类</label>
                    <select class="form-select" id="editCategory" required></select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">悬赏积分</label>
                    <select class="form-select" id="editBounty">
                      <option value="50">50</option>
                      <option value="100">100</option>
                      <option value="200">200</option>
                    </select>
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">详细内容</label>
                  <div id="editPostEditorContainer" style="height:250px; border:1px solid #ccc;"></div>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
              <button type="button" class="btn btn-success" id="saveAndApproveBtn" style="display:none;">保存并通过</button>
              <button type="button" class="btn btn-primary" id="saveOnlyBtn" style="display:none;">保存</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    let editEditor = null;

    async function initEditor() {
      if (!editEditor) {
        editEditor = await WenbaEditor.create("#editPostEditorContainer", {
          height: "250px",
          placeholder: "请输入详细描述...",
        });
      }
    }

    async function loadCategorySelect(selectedId) {
      const select = document.getElementById("editCategory");
      const res = await api("/api/public/categories");
      if (res.code !== 200) return;
      select.innerHTML = '<option value="">选择分类</option>';
      const tree = res.data;
      function addOptions(list) {
        list.forEach((cat) => {
          if (cat.children && cat.children.length > 0) {
            cat.children.forEach((sub) => {
              const option = document.createElement("option");
              option.value = sub.id;
              option.textContent = `${cat.name} > ${sub.name}`;
              if (sub.id == selectedId) option.selected = true;
              select.appendChild(option);
            });
          } else if (!cat.parent_id) {
            const option = document.createElement("option");
            option.value = cat.id;
            option.textContent = cat.name;
            if (cat.id == selectedId) option.selected = true;
            select.appendChild(option);
          }
        });
      }
      addOptions(tree);
    }

    window.openEditPostModal = async function (postId, mode = "manage") {
      await initEditor();
      const res = await api(`/api/admin/posts/${postId}`);
      if (res.code !== 200) {
        ModalAlert.error("获取帖子信息失败");
        return;
      }
      const post = res.data;
      document.getElementById("editPostId").value = post.id;
      document.getElementById("editTitle").value = post.title;
      // 反转义内容，使编辑器正确显示HTML
      editEditor.setContent(unescapeHtml(post.content) || "");
      await loadCategorySelect(post.category_id);
      document.getElementById("editBounty").value = post.bounty;

      const approveBtn = document.getElementById("saveAndApproveBtn");
      const saveBtn = document.getElementById("saveOnlyBtn");
      if (mode === "audit") {
        approveBtn.style.display = "";
        saveBtn.style.display = "none";
        approveBtn.onclick = saveAndApprove;
      } else {
        approveBtn.style.display = "none";
        saveBtn.style.display = "";
        saveBtn.onclick = saveOnly;
      }

      new bootstrap.Modal(document.getElementById("editPostModal")).show();
    };

    async function saveAndApprove() {
      const id = document.getElementById("editPostId").value;
      const title = document.getElementById("editTitle").value.trim();
      const category_id = document.getElementById("editCategory").value;
      const bounty = parseInt(document.getElementById("editBounty").value);
      const content = editEditor.getContent(); // 原始HTML
      if (!title || !category_id) {
        ModalAlert.error("标题和分类不能为空");
        return;
      }
      const res = await api(`/api/admin/posts/${id}/edit-approve`, {
        method: "PUT",
        body: JSON.stringify({ title, category_id, bounty, content }),
      });
      if (res.code === 200) {
        ModalAlert.success("已保存并通过审核");
        bootstrap.Modal.getInstance(
          document.getElementById("editPostModal"),
        ).hide();
        if (typeof onPostSaved === "function") onPostSaved();
      } else {
        ModalAlert.error(res.msg || "操作失败");
      }
    }

    async function saveOnly() {
      const id = document.getElementById("editPostId").value;
      const title = document.getElementById("editTitle").value.trim();
      const category_id = document.getElementById("editCategory").value;
      const bounty = parseInt(document.getElementById("editBounty").value);
      const content = editEditor.getContent();
      if (!title || !category_id) {
        ModalAlert.error("标题和分类不能为空");
        return;
      }
      const res = await api(`/api/admin/posts/${id}`, {
        method: "PUT",
        body: JSON.stringify({ title, category_id, bounty, content }),
      });
      if (res.code === 200) {
        ModalAlert.success("保存成功");
        bootstrap.Modal.getInstance(
          document.getElementById("editPostModal"),
        ).hide();
        if (typeof onPostSaved === "function") onPostSaved();
      } else {
        ModalAlert.error(res.msg || "操作失败");
      }
    }
  });
})();
