/**
 * =============================================================
 * MODULES/NAVIGATION.JS - Wheel Navigation & Mobile Menu (ESM)
 * Quản lý thanh điều hướng Hub-and-Spoke mô hình bánh xe
 * =============================================================
 */

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
      if (e.key === "Escape" && wheelNav.classList.contains("open")) {
        wheelNav.classList.remove("open");
        mobileMenuBtn.setAttribute("aria-expanded", "false");
        mobileMenuBtn.classList.remove("active");
        mobileMenuBtn.focus();
      }
    });

    // Đóng drawer khi click ra ngoài
    document.addEventListener("click", (e) => {
      if (
        wheelNav.classList.contains("open") &&
        !wheelNav.contains(e.target) &&
        !mobileMenuBtn.contains(e.target)
      ) {
        wheelNav.classList.remove("open");
        mobileMenuBtn.setAttribute("aria-expanded", "false");
        mobileMenuBtn.classList.remove("active");
      }
    });
  }

  // Tự động highlight trang hiện tại (Active Nav Link)
  highlightActiveLink();
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
