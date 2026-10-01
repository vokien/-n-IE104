/**
 * =============================================================
 * APP.JS - Main Application Entrypoint & Global Interactions
 * Đồ án IE104 - Internet và Công nghệ Web
 * =============================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Quản lý Dark / Light Theme
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const currentTheme = localStorage.getItem("ie104_theme_preference") || "light";

  // Áp dụng theme lưu trữ
  document.documentElement.setAttribute("data-theme", currentTheme);
  updateThemeButtonIcon(currentTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const activeTheme = document.documentElement.getAttribute("data-theme");
      const newTheme = activeTheme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem("ie104_theme_preference", newTheme);
      updateThemeButtonIcon(newTheme);
    });
  }

  function updateThemeButtonIcon(theme) {
    if (!themeToggleBtn) return;
    const iconSpan = themeToggleBtn.querySelector(".theme-icon");
    if (iconSpan) {
      iconSpan.textContent = theme === "dark" ? "☀️" : "🌙";
    }
  }

  // 2. Quản lý Mobile Navigation Drawer
  const mobileMenuBtn = document.querySelector(".mobile-menu-btn");
  const wheelNav = document.querySelector(".wheel-nav");

  if (mobileMenuBtn && wheelNav) {
    mobileMenuBtn.addEventListener("click", () => {
      wheelNav.classList.toggle("open");
      const isExpanded = wheelNav.classList.contains("open");
      mobileMenuBtn.setAttribute("aria-expanded", isExpanded);
    });
  }

  // 3. Highlight liên kết đang hoạt động (Active Link)
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  const navLinks = document.querySelectorAll(".wheel-nav a");
  navLinks.forEach(link => {
    const href = link.getAttribute("href");
    if (href === currentPath || (currentPath === "" && href === "index.html")) {
      link.classList.add("active");
    }
  });

  console.log("🌐 [IE104] Hệ thống Khuyến nghị Hội nghị/Tạp chí Scopus đã sẵn sàng.");
});
