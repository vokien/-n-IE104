/**
 * =============================================================
 * STORAGE.JS - Client-side Storage Management (LocalStorage API)
 * Thành viên phụ trách: TV1 (Nhóm trưởng)
 * Đồ án IE104 - Internet và Công nghệ Web
 * =============================================================
 */

const AppStorage = {
  KEYS: {
    BOOKMARKS: "ie104_venue_bookmarks",
    SEARCH_HISTORY: "ie104_search_history",
    THEME: "ie104_theme_preference"
  },

  /**
   * Lấy toàn bộ danh sách venue đã đánh dấu
   * @returns {Array} Mảng các object venue đã lưu
   */
  getBookmarks() {
    try {
      const data = localStorage.getItem(this.KEYS.BOOKMARKS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("[Storage] Không thể đọc danh sách bookmarks từ localStorage:", e);
      return [];
    }
  },

  /**
   * Kiểm tra một venue đã được bookmark chưa
   * @param {string} venueId Mã định danh venue (VD: 'CONF-001')
   * @returns {boolean}
   */
  isBookmarked(venueId) {
    const list = this.getBookmarks();
    return list.some(item => item.id === venueId);
  },

  /**
   * Thêm hoặc xóa bookmark (Toggle)
   * @param {Object} venue Object thông tin venue
   * @returns {boolean} True nếu vừa thêm, False nếu vừa xóa
   */
  toggleBookmark(venue) {
    if (!venue || !venue.id) return false;
    let list = this.getBookmarks();
    const existingIndex = list.findIndex(item => item.id === venue.id);

    if (existingIndex > -1) {
      // Đã có -> Xóa khỏi danh sách
      list.splice(existingIndex, 1);
      this._saveBookmarks(list);
      this._dispatchBookmarkEvent("removed", venue);
      return false;
    } else {
      // Chưa có -> Thêm vào danh sách (kèm thời gian đánh dấu)
      list.push({
        id: venue.id,
        name: venue.name,
        acronym: venue.acronym,
        type: venue.type,
        scopus_rank: venue.scopus_rank,
        core_rank: venue.core_rank,
        saved_at: new Date().toISOString()
      });
      this._saveBookmarks(list);
      this._dispatchBookmarkEvent("added", venue);
      return true;
    }
  },

  /**
   * Xóa một bookmark theo ID
   * @param {string} venueId
   */
  removeBookmark(venueId) {
    let list = this.getBookmarks();
    list = list.filter(item => item.id !== venueId);
    this._saveBookmarks(list);
    this._dispatchBookmarkEvent("removed", { id: venueId });
  },

  /**
   * Lưu lịch sử tìm kiếm gần đây
   * @param {string} query Chuỗi tìm kiếm
   */
  saveSearchQuery(query) {
    if (!query || !query.trim()) return;
    try {
      let history = this.getSearchHistory();
      // Loại bỏ trùng lặp và đưa lên đầu
      history = history.filter(q => q.toLowerCase() !== query.trim().toLowerCase());
      history.unshift(query.trim());
      // Giới hạn 5 truy vấn gần nhất
      history = history.slice(0, 5);
      localStorage.setItem(this.KEYS.SEARCH_HISTORY, JSON.stringify(history));
    } catch (e) {
      console.warn("[Storage] Không thể lưu lịch sử tìm kiếm:", e);
    }
  },

  /**
   * Lấy lịch sử tìm kiếm
   * @returns {Array<string>}
   */
  getSearchHistory() {
    try {
      const data = localStorage.getItem(this.KEYS.SEARCH_HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  /* --- Các hàm nội bộ --- */
  _saveBookmarks(list) {
    try {
      localStorage.setItem(this.KEYS.BOOKMARKS, JSON.stringify(list));
      this._updateBadgeCounter();
    } catch (e) {
      console.error("[Storage] Không thể lưu bookmarks (vượt quá quota hoặc bị tắt):", e);
    }
  },

  _updateBadgeCounter() {
    const count = this.getBookmarks().length;
    const badgeElements = document.querySelectorAll(".bookmark-count");
    badgeElements.forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? "inline-block" : "none";
    });
  },

  _dispatchBookmarkEvent(action, venue) {
    const event = new CustomEvent("venueBookmarkChanged", {
      detail: { action, venue, total: this.getBookmarks().length }
    });
    window.dispatchEvent(event);
  }
};

// Khởi chạy cập nhật số lượng bookmark khi nạp trang
document.addEventListener("DOMContentLoaded", () => {
  AppStorage._updateBadgeCounter();
});
