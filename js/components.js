/**
 * =============================================================
 * JS/COMPONENTS.JS - Reusable Web Components (Custom Elements)
 * Đồ án IE104 - Internet và Công nghệ Web
 * Kiến trúc Web Components thuần (Light DOM) tái sử dụng Header & Footer
 * =============================================================
 */

(function () {
  // Đảm bảo kiểu hiển thị block cho Custom Elements nhằm triệt tiêu CLS (Zero Layout Shift)
  if (typeof document !== "undefined" && !document.getElementById("app-components-style")) {
    const style = document.createElement("style");
    style.id = "app-components-style";
    style.textContent = `
      app-header, app-footer { display: block; width: 100%; }
      app-header:not(:defined) { min-height: var(--header-height, 70px); }
      app-footer:not(:defined) { min-height: 380px; }
    `;
    document.head.appendChild(style);
  }
})();

// Lớp cơ sở tương thích môi trường Trình duyệt và Node.js kiểm thử
const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

/**
 * Custom Element: <app-header active="...">
 * Tái sử dụng Header mô hình bánh xe (Wheel Navigation Hub) trên toàn bộ trang
 */
class AppHeader extends BaseElement {
  static get observedAttributes() {
    return ["active"];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "active" && oldValue !== newValue && this.rendered) {
      this.updateActiveNav(newValue);
    }
  }

  updateActiveNav(active) {
    const normalized = (active || "").toLowerCase().trim();
    const navLinks = this.querySelectorAll(".wheel-nav a");
    navLinks.forEach((link) => {
      const pageKey = link.getAttribute("data-nav-key");
      const href = (link.getAttribute("href") || "").toLowerCase();
      const isActive =
        normalized &&
        (normalized === pageKey ||
          normalized === href ||
          (normalized === "home" && href === "index.html"));
      if (isActive) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      } else {
        link.classList.remove("active");
        link.removeAttribute("aria-current");
      }
    });
  }

  render() {
    if (this.rendered) return;
    this.rendered = true;

    const active = (this.getAttribute("active") || "").toLowerCase().trim();
    const navItems = [
      { key: "home", href: "index.html", text: "Trang Chủ" },
      { key: "about", href: "about.html", text: "Giới Thiệu" },
      { key: "venues", href: "venues.html", text: "Tra Cứu Hội Nghị &amp; Tạp Chí" },
      { key: "recommend", href: "recommend.html", text: "Gợi Ý Theo Bản Thảo" },
      { key: "timeline", href: "timeline.html", text: "Lịch Nộp Bài (CFP)" },
      { key: "contact", href: "contact.html", text: "Liên Hệ" }
    ];

    const navLinksHtml = navItems
      .map((item) => {
        const isActive =
          active === item.key ||
          active === item.href ||
          (active === "home" && item.href === "index.html");
        const activeAttrs = isActive ? ' class="active" aria-current="page"' : "";
        return `          <li><a href="${item.href}" data-nav-key="${item.key}"${activeAttrs}>${item.text}</a></li>`;
      })
      .join("\n");

    this.innerHTML = `
  <header class="site-header" role="banner">
    <div class="container">
      <a href="index.html" class="brand-logo" aria-label="Trang chủ Scopus &amp; CORE Venue Recommender">
        <svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
          <path d="M6 12v5c3 3 9 3 12 0v-5"/>
        </svg>
        <span>Scopus<span>Venue</span></span>
      </a>

      <!-- Thanh điều hướng mô hình bánh xe: Trang chủ làm trục tâm (Hub), kết nối nan hoa với các trang chức năng -->
      <nav class="wheel-nav" role="navigation" aria-label="Thanh điều hướng chính mô hình bánh xe">
        <ul>
${navLinksHtml}
        </ul>
      </nav>

      <!-- Các nút chức năng tiện ích trên Header -->
      <div class="header-actions">
        <!-- Nút Trung Tâm Thông Báo (Notification Center) -->
        <button type="button" class="btn-icon" id="notification-header-btn" title="Xem thông báo cập nhật &amp; biến động deadline" aria-label="Xem thông báo cập nhật">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <span class="notification-label">Thông Báo</span>
          <span id="notification-badge" class="notification-count badge" aria-label="Số thông báo chưa đọc">0</span>
        </button>

        <button type="button" class="btn-icon" id="bookmark-header-btn" title="Xem danh sách mục tiêu đã lưu (Watchlist)" aria-label="Xem danh sách mục tiêu đã lưu">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="bookmark-label">Mục Tiêu</span>
          <span class="bookmark-count badge" aria-label="Số lượng mục tiêu đã lưu">0</span>
        </button>

        <button type="button" class="btn-icon" id="theme-toggle-btn" title="Chuyển chế độ Giao diện Sáng / Tối" aria-label="Chuyển đổi giao diện sáng tối">
          <span class="theme-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          </span>
        </button>

        <button type="button" class="mobile-menu-btn" aria-label="Mở menu di động" aria-expanded="false">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  </header>`;
  }
}

/**
 * Custom Element: <app-footer>
 * Tái sử dụng Footer đa cột học thuật và các Modals hệ thống
 */
class AppFooter extends BaseElement {
  connectedCallback() {
    if (this.rendered) return;
    this.rendered = true;

    const footerHtml = `
  <footer class="site-footer" role="contentinfo">
    <div class="container">
      <div class="footer-grid">
        <!-- Cột 1: Thông tin Đề tài & Trường Viện -->
        <div class="footer-col">
          <a href="index.html" class="brand-logo footer-brand-logo" aria-label="Về trang chủ ScopusVenue">
            <svg class="brand-icon brand-icon-box--footer" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
              <path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            <span>Scopus<span>Venue</span></span>
          </a>
          <p class="footer-about-text">
            Hệ thống tra cứu và khuyến nghị nơi công bố khoa học (Hội nghị CORE &amp; Tạp chí Scopus SJR) dành cho giảng viên, nghiên cứu sinh và sinh viên.
          </p>
          <div style="margin-top: var(--spacing-sm);">
            <span class="footer-uit-badge">ĐHQG-HCM · TRƯỜNG ĐH CÔNG NGHỆ THÔNG TIN</span>
          </div>
        </div>

        <!-- Cột 2: Đơn vị phụ trách & Giảng viên hướng dẫn -->
        <div class="footer-col">
          <h4>Đơn Vị &amp; Học Phần</h4>
          <ul class="footer-links-list">
            <li><strong>Môn học:</strong> IE104 - Internet &amp; Công nghệ Web</li>
            <li><strong>Khoa:</strong> Khoa học và Kỹ thuật Thông tin (ISE - UIT)</li>
            <li><strong>GVHD:</strong> ThS. Võ Tấn Khoa</li>
            <li><strong>Email:</strong> <a href="mailto:khoavt@uit.edu.vn">khoavt@uit.edu.vn</a></li>
            <li><strong>Địa chỉ:</strong> KP.6, P. Linh Trung, TP. Thủ Đức, TP.HCM</li>
          </ul>
        </div>

        <!-- Cột 3: Đội ngũ sinh viên thực hiện -->
        <div class="footer-col">
          <h4>Nhóm Sinh Viên Thực Hiện</h4>
          <ul class="footer-links-list">
            <li>Võ Đình Kiên (TV1 - Trưởng nhóm)</li>
            <li>Trần Duy Khánh (TV2)</li>
            <li>Huỳnh Văn Lên (TV3)</li>
            <li>Trần Hồng Lĩnh (TV4)</li>
            <li>Ngô Bảo Lâm (TV5)</li>
          </ul>
        </div>

        <!-- Cột 4: Tiêu chuẩn kỹ thuật & Học thuật -->
        <div class="footer-col">
          <h4>Tiêu Chuẩn &amp; Học Thuật</h4>
          <ul class="footer-links-list">
            <li><strong>Dữ liệu:</strong> Scopus SJR &amp; CORE 2026 (<span data-stat="total-venues">8.430</span> hội nghị &amp; tạp chí)</li>
            <li><strong>Thuật toán:</strong> Okapi BM25 thuần Vanilla JS</li>
            <li><strong>Múi giờ CFP:</strong> Múi giờ chuẩn (AoE) &amp; Múi giờ thiết bị</li>
            <li><strong>Kiến trúc:</strong> 100% Vanilla HTML5 / CSS3 / ESM</li>
            <li><strong>Lưu trữ:</strong> Web Storage API (Client-side)</li>
          </ul>
        </div>
      </div>

      <!-- Dòng đáy chân trang (Bản quyền & Định danh học thuật) -->
      <div class="footer-bottom">
        <p>&copy; 2026 ScopusVenue. Đồ án môn học IE104 - Internet và Công nghệ Web | Trường Đại học Công nghệ Thông tin - ĐHQG-HCM.</p>
        <div>
          <span class="footer-uit-badge">UIT · VNU-HCM · 2026</span>
        </div>
      </div>
    </div>
  </footer>`;

    const modalsHtml = `
  <!-- ============================================================
       MODAL TRUNG TÂM THÔNG BÁO (NOTIFICATION CENTER MODAL)
       ============================================================ -->
  <div class="notification-modal-backdrop" id="notification-modal-backdrop" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="notification-modal-title">
    <div class="notification-modal">
      <div class="modal-header">
        <h3 id="notification-modal-title" class="notification-modal-title">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <span>Thông Báo</span>
        </h3>
        <div class="modal-header-actions">
          <button type="button" class="btn-icon" id="notification-modal-close-btn" aria-label="Đóng thông báo">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="notification-tabs" role="tablist">
        <button type="button" class="notification-tab active" data-filter="all" role="tab" aria-selected="true">Tất cả (<span id="notif-tab-all-count">0</span>)</button>
        <button type="button" class="notification-tab" data-filter="watchlist" role="tab" aria-selected="false">Mục tiêu của tôi (<span id="notif-tab-watchlist-count">0</span>)</button>
        <button type="button" class="notification-tab" data-filter="new_venues" role="tab" aria-selected="false">Hội nghị / Tạp chí mới (<span id="notif-tab-new-count">0</span>)</button>
      </div>
      <div class="modal-body" id="notification-modal-body">
        <!-- Danh sách thông báo được render tự động qua ESM module js/modules/notification-manager.js -->
      </div>
      <div class="modal-footer notification-modal-footer">
        <div class="notif-footer-actions-box">
          <button type="button" class="btn-icon notif-footer-btn notif-footer-btn--primary" id="notification-mark-all-read-btn">
            Đã đọc tất cả
          </button>
          <button type="button" class="btn-icon notif-footer-btn notif-footer-btn--danger" id="notification-clear-btn">
            Xóa tất cả thông báo
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ============================================================
       MODAL XEM NHANH DANH SÁCH MỤC TIÊU (WATCHLIST MODAL)
       ============================================================ -->
  <div class="bookmark-modal-backdrop" id="bookmark-modal-backdrop" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="bookmark-modal-title">
    <div class="bookmark-modal">
      <div class="modal-header">
        <h3 id="bookmark-modal-title" style="margin: 0; display: flex; align-items: center; gap: var(--spacing-xs);">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="color: var(--color-accent);" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Danh Sách Mục Tiêu</span>
        </h3>
        <button type="button" class="btn-icon" id="bookmark-modal-close-btn" aria-label="Đóng cửa sổ">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal-body" id="bookmark-modal-body">
        <!-- Danh sách được render tự động qua ESM module js/modules/bookmark-modal.js -->
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-icon" id="bookmark-modal-clear-btn" style="color: var(--color-danger); border-color: var(--color-danger);">
          Xóa tất cả
        </button>
        <a href="venues.html" class="btn-primary" style="font-size: var(--font-size-sm); padding: 6px 14px;">
          <span>Tra cứu hội nghị &amp; tạp chí</span>
        </a>
      </div>
    </div>
  </div>`;

    const hasModals =
      typeof document !== "undefined" &&
      Boolean(document.getElementById("notification-modal-backdrop"));
    this.innerHTML = footerHtml + (hasModals ? "" : modalsHtml);
  }
}

// Đăng ký Custom Elements với trình duyệt
if (typeof customElements !== "undefined") {
  if (!customElements.get("app-header")) {
    customElements.define("app-header", AppHeader);
  }
  if (!customElements.get("app-footer")) {
    customElements.define("app-footer", AppFooter);
  }
}

// Hỗ trợ xuất module cho môi trường kiểm thử Node.js / JSDOM
if (typeof module !== "undefined" && module.exports) {
  module.exports = { AppHeader, AppFooter };
}
