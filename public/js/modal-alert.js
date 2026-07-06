// modal-alert.js - 基于 Bootstrap Modal 的提示框（健壮版）
(function () {
  // 如果 Bootstrap 未定义，延迟初始化直到 DOM 加载完毕并检测 bootstrap
  function initModalAlert() {
    // 如果已经初始化过则跳过
    if (window.ModalAlert) return;

    if (typeof bootstrap === "undefined") {
      console.warn("Bootstrap 未加载，ModalAlert 降级为原生 alert");
      window.ModalAlert = createFallback();
      return;
    }

    // 如果 DOM 尚未包含 body（极少数情况），等待 DOMContentLoaded
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", initModalAlert);
      return;
    }

    // 避免重复插入
    if (document.getElementById("globalAlertModal")) return;

    const modalHTML = `
      <div class="modal fade" id="globalAlertModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered modal-sm">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="globalAlertTitle"></h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body text-center" id="globalAlertBody"></div>
            <div class="modal-footer justify-content-center" id="globalAlertFooter">
              <button type="button" class="btn btn-primary" data-bs-dismiss="modal">确定</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    const modalElement = document.getElementById("globalAlertModal");
    const modal = new bootstrap.Modal(modalElement, {
      backdrop: true,
      keyboard: true,
    });
    const titleEl = document.getElementById("globalAlertTitle");
    const bodyEl = document.getElementById("globalAlertBody");
    const footerEl = document.getElementById("globalAlertFooter");

    function show(title, message, type = "info") {
      titleEl.textContent = title || "提示";
      bodyEl.innerHTML = message || "";
      const header = modalElement.querySelector(".modal-header");
      header.className = `modal-header bg-${type}`;
      titleEl.className = "modal-title text-white";
      footerEl.innerHTML =
        '<button type="button" class="btn btn-light" data-bs-dismiss="modal">确定</button>';
      modal.show();
    }

    function success(message, title = "成功") {
      show(title, message, "success");
    }
    function error(message, title = "错误") {
      show(title, message, "danger");
    }
    function info(message, title = "提示") {
      show(title, message, "info");
    }

    function confirm(
      title,
      message,
      confirmText = "确定",
      cancelText = "取消",
    ) {
      return new Promise((resolve) => {
        titleEl.textContent = title || "确认";
        bodyEl.innerHTML = message || "";
        const header = modalElement.querySelector(".modal-header");
        header.className = "modal-header bg-warning";
        titleEl.className = "modal-title text-dark";
        footerEl.innerHTML = `
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="modalCancelBtn">${cancelText}</button>
          <button type="button" class="btn btn-primary" id="modalConfirmBtn">${confirmText}</button>
        `;

        const confirmBtn = document.getElementById("modalConfirmBtn");
        const cancelBtn = document.getElementById("modalCancelBtn");
        const cleanup = () => {
          confirmBtn.removeEventListener("click", onConfirm);
          cancelBtn.removeEventListener("click", onCancel);
        };
        const onConfirm = () => {
          cleanup();
          modal.hide();
          resolve(true);
        };
        const onCancel = () => {
          cleanup();
          modal.hide();
          resolve(false);
        };
        confirmBtn.addEventListener("click", onConfirm);
        cancelBtn.addEventListener("click", onCancel);
        modal.show();
      });
    }

    window.ModalAlert = { show, success, error, info, confirm };
  }

  function createFallback() {
    return {
      show: function (title, message) {
        alert(title + "\n" + message);
      },
      success: function (message, title) {
        alert((title || "成功") + "\n" + message);
      },
      error: function (message, title) {
        alert((title || "错误") + "\n" + message);
      },
      info: function (message, title) {
        alert((title || "提示") + "\n" + message);
      },
      confirm: function (title, message) {
        return Promise.resolve(window.confirm(title + "\n" + message));
      },
    };
  }

  // 立即尝试初始化（如果 DOM 已经 ready）
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initModalAlert);
  } else {
    initModalAlert();
  }

  // 额外安全保险：如果上述都没有成功（例如脚本执行太早），在 window.onload 再次尝试
  window.addEventListener("load", initModalAlert);
})();
