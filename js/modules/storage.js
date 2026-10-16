/**
 * =============================================================
 * MODULES/STORAGE.JS - Client-side Storage Management (ESM)
 * Quản lý LocalStorage an toàn (try/catch chống QuotaExceededError)
 * Tuân thủ chuẩn Vanilla Web & SRP (Single Responsibility Principle)
 * =============================================================
 */

export const STORAGE_KEYS = {
  BOOKMARKS: "ie104_venue_bookmarks",
  SEARCH_HISTORY: "ie104_search_history",
  THEME: "ie104_theme_preference"
};

/**
 * Lấy danh sách bookmark từ localStorage
 * @returns {Array<Object>} Mảng danh sách venue đã lưu
 */
export function getBookmarks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BOOKMARKS);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("[Storage] Không thể đọc danh sách bookmarks:", error);
    return [];
  }
}

/**
 * Kiểm tra một venue đã được lưu hay chưa
 * @param {string} venueId
 * @returns {boolean}
 */
export function isBookmarked(venueId) {
  if (!venueId) return false;
  const list = getBookmarks();
  return list.some(item => item.id === venueId);
}

/**
 * Thêm hoặc xóa bookmark (Toggle)
 * @param {Object} venue Thông tin venue
 * @returns {boolean} true nếu vừa thêm, false nếu vừa xóa
 */
export function toggleBookmark(venue) {
  if (!venue || !venue.id) return false;
  const list = getBookmarks();
  const existingIndex = list.findIndex(item => item.id === venue.id);

  let isAdded = false;
  if (existingIndex > -1) {
    list.splice(existingIndex, 1);
    isAdded = false;
  } else {
    list.push({
      id: venue.id,
      name: venue.name,
      acronym: venue.acronym || null,
      type: venue.type || "unknown",
      scopus_rank: venue.scopus_rank || null,
      core_rank: venue.core_rank || null,
      saved_at: new Date().toISOString()
    });
    isAdded = true;
  }

  saveBookmarks(list);
  dispatchBookmarkEvent(isAdded ? "added" : "removed", venue, list.length);
  return isAdded;
}

/**
 * Xóa một venue khỏi bookmarks theo ID
 * @param {string} venueId
 */
export function removeBookmark(venueId) {
  if (!venueId) return;
  let list = getBookmarks();
  list = list.filter(item => item.id !== venueId);
  saveBookmarks(list);
  dispatchBookmarkEvent("removed", { id: venueId }, list.length);
}

/**
 * Xóa toàn bộ bookmarks
 */
export function clearAllBookmarks() {
  try {
    localStorage.removeItem(STORAGE_KEYS.BOOKMARKS);
    updateBadgeCounter();
    dispatchBookmarkEvent("cleared", null, 0);
  } catch (error) {
    console.error("[Storage] Không thể xóa toàn bộ bookmarks:", error);
  }
}

/**
 * Lưu mảng bookmarks vào localStorage an toàn
 * @param {Array<Object>} list
 */
export function saveBookmarks(list) {
  try {
    localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(list));
    updateBadgeCounter();
  } catch (error) {
    console.error("[Storage] Lỗi lưu trữ LocalStorage (vượt quota hoặc bị chặn):", error);
  }
}

/**
 * Cập nhật số lượng trên các badge hiển thị
 */
export function updateBadgeCounter() {
  const count = getBookmarks().length;
  const badgeElements = document.querySelectorAll(".bookmark-count");
  badgeElements.forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? "inline-flex" : "none";
  });
}

/**
 * Phát CustomEvent toàn cục khi danh sách bookmark biến đổi
 * @param {string} action 'added' | 'removed' | 'cleared'
 * @param {Object|null} venue
 * @param {number} total
 */
export function dispatchBookmarkEvent(action, venue, total) {
  const event = new CustomEvent("venueBookmarkChanged", {
    detail: { action, venue, total }
  });
  window.dispatchEvent(event);
}

/**
 * Lưu truy vấn tìm kiếm gần đây
 * @param {string} query
 */
export function saveSearchQuery(query) {
  if (!query || !query.trim()) return;
  try {
    let history = getSearchHistory();
    const clean = query.trim();
    history = history.filter(q => q.toLowerCase() !== clean.toLowerCase());
    history.unshift(clean);
    history = history.slice(0, 5);
    localStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(history));
  } catch (error) {
    console.warn("[Storage] Không thể lưu lịch sử tìm kiếm:", error);
  }
}

/**
 * Lấy lịch sử tìm kiếm
 * @returns {Array<string>}
 */
export function getSearchHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

export const AppStorage = {
  KEYS: STORAGE_KEYS,
  getBookmarks,
  isBookmarked,
  toggleBookmark,
  removeBookmark,
  clearAllBookmarks,
  saveBookmarks,
  saveSearchQuery,
  getSearchHistory,
  _updateBadgeCounter: updateBadgeCounter
};
