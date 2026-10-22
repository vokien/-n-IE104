/**
 * =============================================================
 * MODULES/BOOKMARK-MODAL.JS - Watchlist Modal & Card Triggers (ESM)
 * Quản lý popup xem nhanh danh sách mục tiêu đã lưu
 * Áp dụng Event Delegation và Keyboard Accessibility (a11y)
 * =============================================================
 */

import {
  getBookmarks,
  isBookmarked,
  toggleBookmark,
  removeBookmark,
  clearAllBookmarks,
  updateBadgeCounter
} from "./storage.js";

let previousActiveElement = null;

/**
 * Khởi tạo Modal và gán tương tác bookmark
 */
export function initBookmarkModal() {
  const modalBackdrop = document.getElementById("bookmark-modal-backdrop");
  const openBtn = document.getElementById("bookmark-header-btn");
  const closeBtn = document.getElementById("bookmark-modal-close-btn");
  const clearBtn = document.getElementById("bookmark-modal-clear-btn");
  const modalBody = document.getElementById("bookmark-modal-body");

  // Mở modal
  function openModal() {
    if (!modalBackdrop) return;
    previousActiveElement = document.activeElement;
    renderBookmarksList();
    modalBackdrop.classList.add("active");
    modalBackdrop.setAttribute("aria-hidden", "false");
    
    // Đưa focus vào nút đóng hoặc nội dung modal
    if (closeBtn) {
      closeBtn.focus();
    }
    document.body.style.overflow = "hidden"; // Ngăn cuộn trang nền
  }

  // Đóng modal
  function closeModal() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.remove("active");
    modalBackdrop.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";

    // Phục hồi focus lại nút trigger ban đầu
    if (previousActiveElement && typeof previousActiveElement.focus === "function") {
      previousActiveElement.focus();
    }
  }

  if (openBtn) {
    openBtn.addEventListener("click", openModal);
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

  // Đóng khi click ngoài backdrop
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) {
        closeModal();
      }
    });
  }

  // Đóng khi nhấn phím Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalBackdrop && modalBackdrop.classList.contains("active")) {
      closeModal();
    }
  });

  // Xóa toàn bộ
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const list = getBookmarks();
      if (list.length === 0) return;
      if (window.confirm("ĐẠI CA có chắc muốn xóa toàn bộ danh sách mục tiêu đã lưu?")) {
        clearAllBookmarks();
        renderBookmarksList();
        updateTriggerButtons();
      }
    });
  }

  // EVENT DELEGATION: Xử lý nút xóa từng item trong Modal Body
  if (modalBody) {
    modalBody.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".remove-item-btn");
      if (!removeBtn) return;

      const venueId = removeBtn.getAttribute("data-id");
      if (venueId) {
        removeBookmark(venueId);
        renderBookmarksList();
        updateTriggerButtons();
      }
    });
  }

  // EVENT DELEGATION: Xử lý các nút Bookmark trên thẻ Venue ở trang chủ
  document.addEventListener("click", (e) => {
    const triggerBtn = e.target.closest(".bookmark-trigger-btn");
    if (!triggerBtn) return;

    const id = triggerBtn.getAttribute("data-id");
    const name = triggerBtn.getAttribute("data-name");
    const rank = triggerBtn.getAttribute("data-rank");
    const isConf = id.startsWith("CONF");
    const type = isConf ? "conference" : "journal";

    toggleBookmark({
      id,
      name,
      acronym: isConf ? name.split(" ")[0] : null,
      type,
      scopus_rank: !isConf ? rank : null,
      core_rank: isConf ? rank : null
    });

    updateTriggerButtons();
  });

  // Lắng nghe sự kiện toàn cục khi bookmark thay đổi từ bất kỳ đâu
  window.addEventListener("venueBookmarkChanged", () => {
    updateTriggerButtons();
    updateBadgeCounter();
  });

  // Cập nhật trạng thái ban đầu
  updateTriggerButtons();
  updateBadgeCounter();
}

/**
 * Render danh sách bookmarks vào nội dung modal
 */
export function renderBookmarksList() {
  const modalBody = document.getElementById("bookmark-modal-body");
  if (!modalBody) return;

  const list = getBookmarks();

  if (list.length === 0) {
    modalBody.innerHTML = `
      <div class="modal-empty-state">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <p class="empty-title">Chưa có venue nào trong danh sách mục tiêu</p>
        <p class="empty-desc">Nhấn vào nút "Lưu" trên các thẻ hội nghị hoặc tạp chí để theo dõi tiến độ nộp bài.</p>
      </div>
    `;
    return;
  }

  const itemsHtml = list.map(v => {
    const isJournal = v.type === "journal";
    const rankText = v.scopus_rank ? `Scopus ${v.scopus_rank}` : (v.core_rank ? `CORE ${v.core_rank}` : "N/A");
    const typeText = isJournal ? "Tạp chí" : "Hội nghị";

    return `
      <div class="watchlist-item">
        <div class="watchlist-item-info">
          <div class="watchlist-item-title">
            ${v.acronym ? `<strong>${v.acronym}</strong> - ` : ""}${escapeHtml(v.name)}
          </div>
          <div class="watchlist-item-meta">
            <span class="watchlist-type-tag">${typeText}</span>
            <span class="watchlist-rank-tag">${rankText}</span>
          </div>
        </div>
        <button type="button" class="btn-icon remove-item-btn" data-id="${escapeHtml(v.id)}" title="Xóa khỏi danh sách" aria-label="Xóa ${escapeHtml(v.name)}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="6"/>
          </svg>
        </button>
      </div>
    `;
  }).join("");

  modalBody.innerHTML = `<div class="watchlist-list">${itemsHtml}</div>`;
}

/**
 * Cập nhật trạng thái nút bookmark trên tất cả các thẻ
 */
export function updateTriggerButtons() {
  const buttons = document.querySelectorAll(".bookmark-trigger-btn");
  buttons.forEach(btn => {
    const id = btn.getAttribute("data-id");
    if (!id) return;

    const saved = isBookmarked(id);
    btn.classList.toggle("bookmarked", saved);
    btn.setAttribute("aria-pressed", String(saved));

    const iconSvg = saved
      ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
      : `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

    btn.innerHTML = `${iconSvg} <span>${saved ? "Đã lưu" : "Lưu"}</span>`;
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
