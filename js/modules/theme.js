/**
 * =============================================================
 * MODULES/THEME.JS - Theme Management (Light / Dark Mode)
 * Quản lý giao diện sáng/tối theo chuẩn CSS Variables & LocalStorage
 * =============================================================
 */

import { STORAGE_KEYS } from "./storage.js";

/**
 * Lấy theme hiện tại
 * @returns {"light" | "dark"}
 */
export function getTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.THEME);
  if (saved === "light" || saved === "dark") {
    return saved;
  }
  // Mặc định kiểm tra tùy chọn hệ thống của người dùng
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/**
 * Thiết lập theme
 * @param {"light" | "dark"} theme
 */
export function setTheme(theme) {
  const validTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", validTheme);
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, validTheme);
  } catch (e) {
    console.warn("[Theme] Không thể lưu theme vào LocalStorage:", e);
  }
  updateThemeButton(validTheme);
}

/**
 * Cập nhật icon và nhãn aria trên nút bấm đổi theme
 * @param {"light" | "dark"} theme
 */
export function updateThemeButton(theme) {
  const toggleBtn = document.getElementById("theme-toggle-btn");
  if (!toggleBtn) return;

  const iconSpan = toggleBtn.querySelector(".theme-icon");
  const isDark = theme === "dark";

  if (iconSpan) {
    // Sử dụng SVG icon hoặc ký tự chuyển đổi rõ ràng
    iconSpan.innerHTML = isDark
      ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
      : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }

  toggleBtn.setAttribute("aria-label", isDark ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối");
  toggleBtn.setAttribute("title", isDark ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối");
}

/**
 * Khởi tạo theme khi trang được nạp
 */
export function initTheme() {
  const current = getTheme();
  setTheme(current);

  const toggleBtn = document.getElementById("theme-toggle-btn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const active = document.documentElement.getAttribute("data-theme") || "light";
      const next = active === "dark" ? "light" : "dark";
      setTheme(next);
    });
  }

  // Lắng nghe thay đổi theme từ hệ điều hành nếu người dùng chưa chọn thủ công
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!localStorage.getItem(STORAGE_KEYS.THEME)) {
        setTheme(e.matches ? "dark" : "light");
      }
    });
  }
}
