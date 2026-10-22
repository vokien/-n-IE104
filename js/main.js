/**
 * =============================================================
 * MAIN.JS - Primary Application ESM Entrypoint
 * Đồ án IE104 - Internet và Công nghệ Web
 * Tích hợp kiến trúc Module Vanilla JS theo chuẩn SRP
 * =============================================================
 */

import { initTheme } from "./modules/theme.js";
import { initNavigation } from "./modules/navigation.js";
import { initBookmarkModal } from "./modules/bookmark-modal.js";
import { saveSearchQuery, AppStorage } from "./modules/storage.js";

// Đảm bảo tương thích toàn cục cho console DevTools và kiểm thử
if (typeof window !== "undefined") {
  window.AppStorage = AppStorage;
}

document.addEventListener("DOMContentLoaded", () => {
  // 1. Khởi tạo hệ thống Theme Sáng / Tối
  initTheme();

  // 2. Khởi tạo thanh điều hướng Hub-and-Spoke mô hình bánh xe
  initNavigation();

  // 3. Khởi tạo Hộp thoại Bookmark & Danh sách mục tiêu
  initBookmarkModal();

  // 4. Lắng nghe form tìm kiếm nhanh trên Hero Banner
  const heroSearchForm = document.querySelector(".hero-search-form");
  const heroSearchInput = document.getElementById("hero-search-input");

  if (heroSearchForm && heroSearchInput) {
    heroSearchForm.addEventListener("submit", () => {
      const query = heroSearchInput.value.trim();
      if (query) {
        saveSearchQuery(query);
      }
    });
  }

  console.log("🌐 [IE104] Kiến trúc Mô hình Bánh xe (Wheel Model Hub) đã sẵn sàng - 100% Vanilla JS ESM.");
});
