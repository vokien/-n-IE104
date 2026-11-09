/**
 * =============================================================
 * MODULES/NOTIFICATION-MANAGER.JS - Notification Center (ESM)
 * Quản lý Thông báo Biến động Hội nghị, Tạp chí & Mục Tiêu
 * Tuân thủ 100% Vanilla JS, SRP, Không thư viện bên ngoài
 * =============================================================
 */

import { getBookmarks, isBookmarked } from "./storage.js";

export const NOTIF_STORAGE_KEYS = {
  NOTIFICATIONS: "ie104_system_notifications",
  READ_IDS: "ie104_notif_read_ids",
  SNAPSHOT: "ie104_system_snapshot"
};

let currentFilter = "all";
let cachedNotifications = [];

/**
 * Lấy danh sách ID thông báo đã đọc từ localStorage
 * @returns {Array<string>}
 */
export function getReadNotificationIds() {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEYS.READ_IDS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Lưu danh sách ID thông báo đã đọc
 * @param {Array<string>} ids
 */
export function saveReadNotificationIds(ids) {
  try {
    localStorage.setItem(NOTIF_STORAGE_KEYS.READ_IDS, JSON.stringify(ids));
  } catch (e) {
    console.warn("[Notifications] Không thể lưu trạng thái đã đọc:", e);
  }
}

/**
 * Lấy danh sách thông báo đã lưu
 * @returns {Array<Object>}
 */
export function getStoredNotifications() {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEYS.NOTIFICATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Lưu danh sách thông báo vào localStorage
 * @param {Array<Object>} list
 */
export function saveStoredNotifications(list) {
  try {
    localStorage.setItem(NOTIF_STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
    cachedNotifications = list;
    updateNotificationBadge();
  } catch (e) {
    console.warn("[Notifications] Không thể lưu danh sách thông báo:", e);
  }
}

/**
 * Cập nhật số lượng thông báo chưa đọc lên badge header
 */
export function updateNotificationBadge() {
  const readIds = new Set(getReadNotificationIds());
  const list = cachedNotifications.length > 0 ? cachedNotifications : getStoredNotifications();
  const unreadCount = list.filter(item => !readIds.has(item.id)).length;

  const badgeEls = document.querySelectorAll("#notification-badge, .notification-count");
  badgeEls.forEach(el => {
    el.textContent = unreadCount;
    if (unreadCount > 0) {
      el.classList.add("has-unread");
      el.setAttribute("aria-label", `${unreadCount} thông báo mới chưa đọc`);
    } else {
      el.classList.remove("has-unread");
      el.setAttribute("aria-label", "Không có thông báo mới");
    }
  });

  // Cập nhật số đếm trên các Tab trong Modal
  const countAllEl = document.getElementById("notif-tab-all-count");
  const countWatchlistEl = document.getElementById("notif-tab-watchlist-count");
  const countNewEl = document.getElementById("notif-tab-new-count");

  if (countAllEl) countAllEl.textContent = list.length;
  if (countWatchlistEl) {
    countWatchlistEl.textContent = list.filter(i => i.category === "watchlist").length;
  }
  if (countNewEl) {
    countNewEl.textContent = list.filter(i => i.category === "new_venues").length;
  }
}

/**
 * Đánh dấu một thông báo là đã đọc
 * @param {string} notifId
 */
export function markNotificationAsRead(notifId) {
  if (!notifId) return;
  const readIds = getReadNotificationIds();
  if (!readIds.includes(notifId)) {
    readIds.push(notifId);
    saveReadNotificationIds(readIds);
    updateNotificationBadge();
  }
}

/**
 * Đánh dấu tất cả thông báo hiện có là đã đọc
 */
export function markAllNotificationsAsRead() {
  const list = getStoredNotifications();
  const allIds = list.map(item => item.id);
  saveReadNotificationIds(allIds);
  updateNotificationBadge();
  renderNotificationList();
}

/**
 * Định dạng ngày thân thiện cho thông báo
 * @param {string|number} dateStr
 * @returns {string}
 */
function formatNotificationDate(dateStr) {
  if (!dateStr) return "Chưa công bố";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    }).format(d);
  } catch (e) {
    return String(dateStr);
  }
}

/**
 * Trích xuất deadline hợp lệ từ conference record
 */
function extractConfDeadline(conf) {
  if (conf.submission_deadlines && Array.isArray(conf.submission_deadlines) && conf.submission_deadlines.length > 0) {
    return conf.submission_deadlines[0].deadline || null;
  }
  return conf.deadline || conf.cfp_deadline || null;
}

/**
 * Động cơ Phân tích & Phát hiện Biến động (Notification Engine)
 * Xử lý:
 * 1. Tạp chí / Hội nghị trong Mục Tiêu bị hủy hoặc hết deadline
 * 2. Deadline của hội nghị trong Mục Tiêu bị thay đổi
 * 3. Tạp chí / Hội nghị mới xuất hiện hoặc mới công bố deadline
 *
 * @param {Array<Object>} conferences Danh sách hội nghị hiện tại
 * @param {Array<Object>} journals Danh sách tạp chí hiện tại
 */
export function evaluateSystemNotifications(conferences = [], journals = []) {
  if (!Array.isArray(conferences) || conferences.length === 0) return;

  const now = Date.now();
  const bookmarks = getBookmarks();
  let existingNotifs = getStoredNotifications();
  const existingMap = new Map(existingNotifs.map(n => [n.id, n]));

  // Lấy snapshot lần trước để so sánh diff
  let snapshot = null;
  try {
    const rawSnap = localStorage.getItem(NOTIF_STORAGE_KEYS.SNAPSHOT);
    snapshot = rawSnap ? JSON.parse(rawSnap) : null;
  } catch (e) {
    snapshot = null;
  }

  const currentConfMap = new Map();
  conferences.forEach(c => {
    if (c && c.id) currentConfMap.set(String(c.id), c);
  });

  const currentJourMap = new Map();
  journals.forEach(j => {
    if (j && j.id) currentJourMap.set(String(j.id), j);
  });

  const newDetectedNotifs = [];

  // =========================================================================
  // 1. KIỂM TRA MỤC TIÊU CỦA NGƯỜI DÙNG (WATCHLIST BIẾN ĐỘNG)
  // =========================================================================
  bookmarks.forEach(bm => {
    const isConf = bm.type === "conference" || Boolean(bm.core_rank) || currentConfMap.has(String(bm.id));
    const isJour = bm.type === "journal" || Boolean(bm.scopus_rank) || currentJourMap.has(String(bm.id));

    // A. Hội nghị trong Mục Tiêu
    if (isConf) {
      const conf = currentConfMap.get(String(bm.id));

      if (!conf) {
        // Hội nghị trong mục tiêu đã bị xóa khỏi cơ sở dữ liệu (hủy bỏ)
        const notifId = `wl_del_conf_${bm.id}`;
        if (!existingMap.has(notifId)) {
          newDetectedNotifs.push({
            id: notifId,
            category: "watchlist",
            type: "watchlist_removed",
            severity: "danger",
            title: `Hội nghị trong Mục Tiêu không còn tồn tại: ${bm.name}`,
            message: `Hội nghị "${bm.name}" bạn đã lưu hiện không còn xuất hiện trong cơ sở dữ liệu CFP (có thể đã dừng hoặc bị hủy tổ chức).`,
            link: "venues.html",
            timestamp: now,
            created_at: new Date().toISOString()
          });
        }
      } else {
        const curDeadline = extractConfDeadline(conf);
        const curDeadlineTs = curDeadline ? new Date(curDeadline).getTime() : NaN;

        // B. Hội nghị trong mục tiêu đã hết hạn nộp bài
        if (!isNaN(curDeadlineTs) && curDeadlineTs < now) {
          const notifId = `wl_exp_conf_${bm.id}_${curDeadline.substring(0, 10)}`;
          if (!existingMap.has(notifId)) {
            newDetectedNotifs.push({
              id: notifId,
              category: "watchlist",
              type: "watchlist_expired",
              severity: "warning",
              title: `Hội nghị trong Mục Tiêu đã hết hạn: ${bm.name}`,
              message: `Hội nghị "${bm.name}" đã chính thức kết thúc thời gian nộp bài vào ${formatNotificationDate(curDeadline)}.`,
              link: `timeline.html?id=${bm.id}`,
              timestamp: now,
              created_at: new Date().toISOString()
            });
          }
        }

        // C. Deadline của hội nghị trong Mục Tiêu bị thay đổi so với lúc lưu hoặc snapshot
        const savedDeadline = bm.saved_deadline;
        if (savedDeadline && curDeadline && savedDeadline !== curDeadline) {
          const notifId = `wl_changed_conf_${bm.id}_${curDeadline.substring(0, 10)}`;
          if (!existingMap.has(notifId)) {
            newDetectedNotifs.push({
              id: notifId,
              category: "watchlist",
              type: "watchlist_deadline_changed",
              severity: "info",
              title: `Cập nhật hạn nộp bài trong Mục Tiêu: ${bm.name}`,
              message: `Hội nghị "${bm.name}" vừa thay đổi/gia hạn hạn nộp bài mới: ${formatNotificationDate(curDeadline)} (Hạn cũ: ${formatNotificationDate(savedDeadline)}).`,
              link: `timeline.html?id=${bm.id}`,
              timestamp: now,
              created_at: new Date().toISOString()
            });
          }
        }
      }
    }

    // B. Tạp chí trong Mục Tiêu
    if (isJour && journals.length > 0) {
      const jour = currentJourMap.get(String(bm.id));
      if (!jour) {
        const notifId = `wl_del_jour_${bm.id}`;
        if (!existingMap.has(notifId)) {
          newDetectedNotifs.push({
            id: notifId,
            category: "watchlist",
            type: "watchlist_removed",
            severity: "danger",
            title: `Tạp chí trong Mục Tiêu không còn trong danh mục: ${bm.name}`,
            message: `Tạp chí "${bm.name}" không còn xuất hiện trong danh mục Scopus cập nhật mới nhất.`,
            link: "venues.html",
            timestamp: now,
            created_at: new Date().toISOString()
          });
        }
      }
    }
  });

  // =========================================================================
  // 2. KIỂM TRA HỘI NGHỊ / TẠP CHÍ MỚI HOẶC MỚI CÔNG BỐ DEADLINE
  // =========================================================================
  if (snapshot && snapshot.confIds) {
    const oldConfSet = new Set(snapshot.confIds);
    const oldDeadlines = snapshot.confDeadlines || {};

    conferences.forEach(c => {
      const cId = String(c.id);
      const curDeadline = extractConfDeadline(c);

      // Hội nghị mới xuất hiện
      if (!oldConfSet.has(cId)) {
        const notifId = `new_conf_${cId}`;
        if (!existingMap.has(notifId)) {
          newDetectedNotifs.push({
            id: notifId,
            category: "new_venues",
            type: "new_conference",
            severity: "success",
            title: `Hội nghị quốc tế mới được bổ sung: ${c.acronym || c.name}`,
            message: `Hệ thống vừa cập nhật hội nghị mới "${c.name}" (${c.core_rank ? `CORE ${c.core_rank}` : "Quốc tế"}) với hạn nộp bài: ${formatNotificationDate(curDeadline)}.`,
            link: `timeline.html?id=${c.id}`,
            timestamp: now,
            created_at: new Date().toISOString()
          });
        }
      } else if (!oldDeadlines[cId] && curDeadline) {
        // Hội nghị trước đây chưa có deadline, nay mới công bố
        const notifId = `new_dl_${cId}_${curDeadline.substring(0, 10)}`;
        if (!existingMap.has(notifId)) {
          newDetectedNotifs.push({
            id: notifId,
            category: "new_venues",
            type: "new_deadline",
            severity: "info",
            title: `Mới công bố hạn nộp bài CFP: ${c.acronym || c.name}`,
            message: `Hội nghị "${c.name}" vừa chính thức công bố thời hạn nhận bài: ${formatNotificationDate(curDeadline)}.`,
            link: `timeline.html?id=${c.id}`,
            timestamp: now,
            created_at: new Date().toISOString()
          });
        }
      }
    });

    if (snapshot.jourIds && journals.length > 0) {
      const oldJourSet = new Set(snapshot.jourIds);
      journals.slice(0, 20).forEach(j => {
        const jId = String(j.id);
        if (!oldJourSet.has(jId)) {
          const notifId = `new_jour_${jId}`;
          if (!existingMap.has(notifId)) {
            newDetectedNotifs.push({
              id: notifId,
              category: "new_venues",
              type: "new_journal",
              severity: "success",
              title: `Tạp chí Scopus mới: ${j.name}`,
              message: `Tạp chí "${j.name}" (${j.scopus_rank || "Scopus"}) vừa được cập nhật vào kho dữ liệu.`,
              link: `venues.html?search=${encodeURIComponent(j.name)}`,
              timestamp: now,
              created_at: new Date().toISOString()
            });
          }
        }
      });
    }
  } else {
    // Lần đầu người dùng truy cập: Tạo các thông báo hữu ích mẫu ban đầu
    const initialSeedNotifs = [
      {
        id: "seed_urgent_noms_2027",
        category: "watchlist",
        type: "watchlist_expired",
        severity: "warning",
        title: "Cảnh báo hạn nộp bài khẩn cấp: NOMS 2027",
        message: "Hội nghị IEEE/IFIP NOMS 2027 (CORE B) sắp hết hạn nộp bài Full Paper vào ngày 10/11/2026. Hãy nhanh chóng hoàn thiện bản thảo!",
        link: "timeline.html?id=CONF-074",
        timestamp: now - 3600000,
        created_at: new Date(now - 3600000).toISOString()
      },
      {
        id: "seed_system_update_2026",
        category: "new_venues",
        type: "new_conference",
        severity: "info",
        title: "Cập nhật dữ liệu CFP 2026-2027",
        message: "Hệ thống đã đồng bộ toàn bộ 85 hội nghị xếp hạng CORE và 42.000+ tạp chí Scopus mới nhất. Hỗ trợ song song Múi giờ thiết bị và Chuẩn AoE.",
        link: "timeline.html",
        timestamp: now - 7200000,
        created_at: new Date(now - 7200000).toISOString()
      },
      {
        id: "seed_tip_watchlist_monitor",
        category: "watchlist",
        type: "watchlist_deadline_changed",
        severity: "success",
        title: "Mẹo giám sát thông minh",
        message: "Bấm nút 'Lưu' trên thẻ hội nghị hoặc tạp chí để đưa vào danh sách 'Mục Tiêu'. Hệ thống sẽ tự động phát chuông thông báo nếu ban tổ chức dời deadline hoặc hội nghị hết hạn!",
        link: "venues.html",
        timestamp: now - 10800000,
        created_at: new Date(now - 10800000).toISOString()
      }
    ];

    initialSeedNotifs.forEach(item => {
      if (!existingMap.has(item.id)) {
        newDetectedNotifs.push(item);
      }
    });
  }

  // Cập nhật snapshot mới vào localStorage
  const newSnapshot = {
    confIds: conferences.map(c => String(c.id)),
    confDeadlines: {},
    jourIds: journals.slice(0, 500).map(j => String(j.id)),
    savedAt: now
  };
  conferences.forEach(c => {
    newSnapshot.confDeadlines[String(c.id)] = extractConfDeadline(c);
  });

  try {
    localStorage.setItem(NOTIF_STORAGE_KEYS.SNAPSHOT, JSON.stringify(newSnapshot));
  } catch (e) {}

  // Gộp thông báo mới và cũ (sắp xếp mới nhất lên đầu)
  if (newDetectedNotifs.length > 0) {
    const combined = [...newDetectedNotifs, ...existingNotifs];
    // Giới hạn tối đa 50 thông báo gần nhất
    const trimmed = combined.slice(0, 50);
    saveStoredNotifications(trimmed);
  } else {
    cachedNotifications = existingNotifs;
    updateNotificationBadge();
  }
}

/**
 * Render danh sách thẻ thông báo trong Modal
 */
export function renderNotificationList() {
  const modalBody = document.getElementById("notification-modal-body");
  if (!modalBody) return;

  const readIds = new Set(getReadNotificationIds());
  let list = cachedNotifications.length > 0 ? cachedNotifications : getStoredNotifications();

  // Lọc theo Tab đang chọn
  if (currentFilter === "watchlist") {
    list = list.filter(item => item.category === "watchlist");
  } else if (currentFilter === "new_venues") {
    list = list.filter(item => item.category === "new_venues");
  }

  if (list.length === 0) {
    modalBody.innerHTML = `
      <div class="notif-empty-state">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        <p class="notif-empty-title">Không có thông báo nào</p>
        <p class="notif-empty-desc">Bạn đã cập nhật đầy đủ mọi thông tin về hội nghị, tạp chí và danh sách mục tiêu.</p>
      </div>
    `;
    return;
  }

  modalBody.innerHTML = `
    <div class="notif-list">
      ${list.map(item => {
        const isRead = readIds.has(item.id);
        const iconSvg = getNotificationIcon(item.severity, item.type);
        const badgeLabel = getCategoryBadgeLabel(item.category, item.type);

        return `
          <article class="notif-card notif-card--${item.severity || 'info'} ${isRead ? 'notif-card--read' : 'notif-card--unread'}" data-notif-id="${item.id}">
            <div class="notif-card-icon" aria-hidden="true">
              ${iconSvg}
            </div>
            <div class="notif-card-content">
              <div class="notif-card-header">
                <span class="badge notif-badge notif-badge--${item.severity || 'info'}">${badgeLabel}</span>
                <span class="notif-time">${formatRelativeTime(item.timestamp || item.created_at)}</span>
              </div>
              <h4 class="notif-card-title">${item.title}</h4>
              <p class="notif-card-msg">${item.message}</p>
              <div class="notif-card-actions">
                ${item.link ? `<a href="${item.link}" class="notif-action-link">Xem chi tiết &rarr;</a>` : ''}
                ${!isRead ? `<button type="button" class="notif-read-btn" data-action="mark-read" data-id="${item.id}">Đánh dấu đã đọc</button>` : '<span class="notif-read-status">Đã đọc</span>'}
              </div>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;

  // Gán sự kiện click nút "Đánh dấu đã đọc" từng thẻ
  modalBody.querySelectorAll('[data-action="mark-read"]').forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      if (id) {
        markNotificationAsRead(id);
        renderNotificationList();
      }
    });
  });
}

function getCategoryBadgeLabel(category, type) {
  if (category === "watchlist") {
    if (type === "watchlist_deadline_changed") return "Thay Đổi Deadline";
    if (type === "watchlist_expired") return "Mục Tiêu Đã Hết Hạn";
    if (type === "watchlist_removed") return "Mục Tiêu Bị Hủy";
    return "Mục Tiêu";
  }
  if (type === "new_conference") return "Hội Nghị Mới";
  if (type === "new_deadline") return "Công Bố Deadline";
  if (type === "new_journal") return "Tạp Chí Mới";
  return "Hệ Thống";
}

function getNotificationIcon(severity, type) {
  if (severity === "danger" || type === "watchlist_removed") {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  }
  if (severity === "warning" || type === "watchlist_expired") {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  }
  if (type === "watchlist_deadline_changed" || type === "new_deadline") {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;
}

function formatRelativeTime(ts) {
  if (!ts) return "Vừa xong";
  const time = typeof ts === "number" ? ts : new Date(ts).getTime();
  if (isNaN(time)) return "Mới đây";
  const diffMinutes = Math.floor((Date.now() - time) / 60000);
  if (diffMinutes < 1) return "Vừa xong";
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) return `${diffDays} ngày trước`;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(new Date(time));
}

/**
 * Khởi tạo toàn bộ tương tác giao diện Notification Center
 */
export function initNotificationCenter() {
  const openBtn = document.getElementById("notification-header-btn");
  const modalBackdrop = document.getElementById("notification-modal-backdrop");
  const closeBtn = document.getElementById("notification-modal-close-btn");
  const markAllBtn = document.getElementById("notification-mark-all-read-btn");
  const clearBtn = document.getElementById("notification-clear-btn");
  const tabBtns = document.querySelectorAll(".notification-tab");

  function openModal() {
    if (!modalBackdrop) return;
    renderNotificationList();
    updateNotificationBadge();
    modalBackdrop.classList.add("active");
    modalBackdrop.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.remove("active");
    modalBackdrop.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (openBtn) openBtn.focus();
  }

  if (openBtn) {
    openBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openModal();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) {
        closeModal();
      }
    });
  }

  if (markAllBtn) {
    markAllBtn.addEventListener("click", () => {
      markAllNotificationsAsRead();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      saveStoredNotifications([]);
      saveReadNotificationIds([]);
      renderNotificationList();
      updateNotificationBadge();
    });
  }

  // Tương tác Tabs lọc
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      currentFilter = btn.getAttribute("data-filter") || "all";
      renderNotificationList();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalBackdrop && modalBackdrop.classList.contains("active")) {
      closeModal();
    }
  });

  // Tự động kiểm tra và lắng nghe thay đổi danh sách Mục Tiêu (Bookmarks)
  window.addEventListener("venueBookmarkChanged", () => {
    // Tự động nạp dữ liệu cache để kiểm tra ngay lập tức
    const confCache = window.__IE104_VENUES_CACHE__?.conf || [];
    const jourCache = window.__IE104_VENUES_CACHE__?.jour || [];
    if (confCache.length > 0) {
      evaluateSystemNotifications(confCache, jourCache);
    }
  });

  // Tự động tải conf.json để phân tích thông báo ngay khi tải trang
  fetch("./data/conf.json")
    .then(res => res.ok ? res.json() : [])
    .then(rawData => {
      const confs = Array.isArray(rawData) ? rawData : (rawData.conferences || rawData.venues || []);
      const cachedJour = window.__IE104_VENUES_CACHE__?.jour || [];
      evaluateSystemNotifications(confs, cachedJour);
    })
    .catch(() => {
      // Fallback: cập nhật badge từ bộ nhớ có sẵn
      updateNotificationBadge();
    });

  updateNotificationBadge();
}
