/**
 * =============================================================
 * MODULES/NAVIGATION.JS - Wheel Navigation & Mobile Menu (ESM)
 * Quản lý thanh điều hướng Hub-and-Spoke mô hình bánh xe
 * =============================================================
 */

/**
 * Đóng menu điều hướng trên thiết bị di động nếu đang mở
 * @param {HTMLElement|null} wheelNav
 * @param {HTMLElement|null} mobileMenuBtn
 * @param {boolean} [restoreFocus=false]
 */
function closeMobileMenu(wheelNav, mobileMenuBtn, restoreFocus = false) {
  if (!wheelNav || !mobileMenuBtn || !wheelNav.classList.contains("open")) {
    return;
  }
  wheelNav.classList.remove("open");
  mobileMenuBtn.setAttribute("aria-expanded", "false");
  mobileMenuBtn.classList.remove("active");
  if (restoreFocus) {
    mobileMenuBtn.focus();
  }
}

/**
 * Chuẩn hóa pathname để đồng nhất URL gốc thư mục (/) và index.html
 * @param {string} pathname
 * @returns {string}
 */
function normalizePathname(pathname) {
  const decoded = decodeURIComponent(pathname || "");
  if (!decoded || decoded.endsWith("/")) {
    return `${decoded}index.html`;
  }
  return decoded;
}

/**
 * Kiểm tra liên kết có trỏ tới đúng trang hiện tại hay không (bỏ qua liên kết #hash nội trang)
 * @param {HTMLAnchorElement} link
 * @returns {boolean}
 */
function isSamePageLink(link) {
  const rawHref = link.getAttribute("href");
  if (!rawHref || rawHref.startsWith("#")) return false;

  try {
    const currentUrl = new URL(window.location.href);
    const targetUrl = new URL(rawHref, window.location.href);
    if (targetUrl.origin !== currentUrl.origin) return false;
    if (targetUrl.hash) return false;
    return normalizePathname(targetUrl.pathname) === normalizePathname(currentUrl.pathname);
  } catch {
    return false;
  }
}

/**
 * Cuộn mượt lên đầu trang, tôn trọng cài đặt giảm chuyển động của hệ thống
 */
function scrollToPageTop() {
  const prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: prefersReducedMotion ? "instant" : "smooth"
  });
}

/**
 * Khi đang ở trong một trang mà bấm lại mục tương ứng trên menu, cuộn mượt lên đầu trang thay vì tải lại
 * @param {HTMLElement|null} wheelNav
 * @param {HTMLElement|null} mobileMenuBtn
 */
function bindSamePageSmoothScroll(wheelNav, mobileMenuBtn) {
  const menuLinks = document.querySelectorAll(".wheel-nav a, .brand-logo, .footer-nav a");

  menuLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }
      if (!isSamePageLink(link)) return;

      e.preventDefault();
      closeMobileMenu(wheelNav, mobileMenuBtn);

      if (window.location.hash && window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }

      scrollToPageTop();
    });
  });
}

/**
 * Khởi tạo điều hướng mô hình bánh xe
 */
export function initNavigation() {
  const mobileMenuBtn = document.querySelector(".mobile-menu-btn");
  const wheelNav = document.querySelector(".wheel-nav");

  if (mobileMenuBtn && wheelNav) {
    mobileMenuBtn.addEventListener("click", () => {
      const isOpen = wheelNav.classList.toggle("open");
      mobileMenuBtn.setAttribute("aria-expanded", String(isOpen));
      mobileMenuBtn.classList.toggle("active", isOpen);
    });

    // Đóng drawer khi người dùng nhấn phím Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeMobileMenu(wheelNav, mobileMenuBtn, true);
      }
    });

    // Đóng drawer khi click ra ngoài
    document.addEventListener("click", (e) => {
      if (
        wheelNav.classList.contains("open") &&
        !wheelNav.contains(e.target) &&
        !mobileMenuBtn.contains(e.target)
      ) {
        closeMobileMenu(wheelNav, mobileMenuBtn);
      }
    });
  }

  // Tự động highlight trang hiện tại (Active Nav Link)
  highlightActiveLink();

  // Cuộn mượt lên đầu trang nếu bấm vào mục của trang hiện tại trên menu
  bindSamePageSmoothScroll(wheelNav, mobileMenuBtn);
}

/**
 * Đánh dấu link active tương ứng với trang đang duyệt
 */
export function highlightActiveLink() {
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  const navLinks = document.querySelectorAll(".wheel-nav a, .footer-nav a");

  navLinks.forEach(link => {
    const href = link.getAttribute("href");
    if (!href) return;
    
    // Loại bỏ query params hoặc hash để so khớp chính xác tên file
    const cleanHref = href.split("?")[0].split("#")[0];
    const isCurrent = cleanHref === currentPath || (currentPath === "" && cleanHref === "index.html");

    if (isCurrent) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    } else {
      link.classList.remove("active");
      link.removeAttribute("aria-current");
    }
  });
}
