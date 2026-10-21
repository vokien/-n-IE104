/**
 * ==========================================================
 * SCOPUSVENUE - COUNTDOWN & TIMELINE MODULE (Thành viên 4 - T4.1, T4.2)
 * Múi giờ: Anywhere on Earth (AoE / UTC-12)
 * Chuẩn: 100% Vanilla JS, Không CSS Inline, An toàn bộ nhớ
 * ==========================================================
 */

(function () {
  "use strict";

  // Hằng số thời gian
  const MS_SECOND = 1000;
  const MS_MINUTE = 60 * MS_SECOND;
  const MS_HOUR = 60 * MS_MINUTE;
  const MS_DAY = 24 * MS_HOUR;

  // Icon SVG Calendar (Đã bỏ sạch inline style, dùng class .timeline-date-icon từ timeline.css)
  const CALENDAR_ICON_SVG = `
    <svg class="timeline-date-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  `;

  /**
   * 1. Tiện ích chuẩn hóa chuỗi thời gian về chuẩn AoE (UTC-12)
   */
  function parseAoEDate(dateString) {
    if (!dateString) return NaN;
    let normalized = String(dateString).trim();
    if (!normalized.includes("T")) {
      normalized = `${normalized}T23:59:59-12:00`;
    } else if (!normalized.match(/([+-]\d{2}:\d{2}|Z)$/)) {
      normalized = `${normalized}-12:00`;
    }
    return new Date(normalized).getTime();
  }

  /**
   * 2. Phân loại trạng thái deadline thông minh (Trả về CSS class)
   */
  function getSmartStatus(dateString) {
    const targetTime = parseAoEDate(dateString);
    const remaining = targetTime - Date.now();
    const diffDays = Math.ceil(remaining / MS_DAY);

    if (isNaN(targetTime) || remaining <= 0) {
      return {
        type: "ended",
        label: "Đã kết thúc",
        className: "status-badge--ended",
        diffDays: 0,
        isEnded: true,
      };
    }

    if (diffDays <= 7) {
      return {
        type: "urgent",
        label: `Khẩn cấp (còn ${diffDays} ngày)`,
        className: "status-badge--urgent",
        diffDays: diffDays,
        isEnded: false,
      };
    }

    if (diffDays <= 30) {
      return {
        type: "warning",
        label: `Sắp đến hạn (${diffDays} ngày)`,
        className: "status-badge--warning",
        diffDays: diffDays,
        isEnded: false,
      };
    }

    return {
      type: "open",
      label: "Đang mở nhận bài",
      className: "status-badge--open",
      diffDays: diffDays,
      isEnded: false,
    };
  }

  /**
   * 3. Tạo chuỗi đếm ngược rút gọn cho thẻ Venue (Task 4.3)
   */
  function createCountdownBadge(targetDateStr) {
    const targetTime = parseAoEDate(targetDateStr);
    const distance = targetTime - Date.now();

    if (isNaN(targetTime) || distance <= 0) {
      return "Đã kết thúc";
    }

    const days = Math.floor(distance / MS_DAY);
    const hours = Math.floor((distance % MS_DAY) / MS_HOUR);

    if (days === 0) {
      const minutes = Math.floor((distance % MS_HOUR) / MS_MINUTE);
      return `Còn ${hours}h ${String(minutes).padStart(2, "0")}m`;
    }

    return `Còn ${days} ngày ${String(hours).padStart(2, "0")} giờ`;
  }

  /**
   * 4. Khởi tạo đồng hồ đếm ngược nổi bật (Banner Countdown)
   * Đếm theo deadline gần nhất thực tế (ICLR 2027: 25/10/2026 AoE)
   */
  function initCountdown() {
    const daysEl = document.getElementById("days");
    const hoursEl = document.getElementById("hours");
    const minutesEl = document.getElementById("minutes");
    const secondsEl = document.getElementById("seconds");

    if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

    const targetTime = parseAoEDate("2026-10-25T23:59:59-12:00");
    let timerInterval = null;

    function render(d, h, m, s) {
      daysEl.textContent = String(d).padStart(2, "0");
      hoursEl.textContent = String(h).padStart(2, "0");
      minutesEl.textContent = String(m).padStart(2, "0");
      secondsEl.textContent = String(s).padStart(2, "0");
    }

    function update() {
      const distance = targetTime - Date.now();

      if (distance <= 0) {
        render(0, 0, 0, 0);
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        return false;
      }

      const d = Math.floor(distance / MS_DAY);
      const h = Math.floor((distance % MS_DAY) / MS_HOUR);
      const m = Math.floor((distance % MS_HOUR) / MS_MINUTE);
      const s = Math.floor((distance % MS_MINUTE) / MS_SECOND);

      render(d, h, m, s);
      return true;
    }

    if (update()) {
      timerInterval = setInterval(update, 1000);
    }
  }

  /**
   * 5. Tải và render mốc thời gian CFP ra giao diện ziczac
   */
  function loadTimelineEvents() {
    const container = document.getElementById("timeline-events-container");
    if (!container) return;

    const events = [
      {
        date: "2026-10-25T23:59:59-12:00",
        title: "ICLR 2027 — Abstract Deadline",
        description: "Hạn chót đăng ký tiêu đề và tóm tắt bài báo lên hệ thống OpenReview.",
      },
      {
        date: "2026-11-17T23:59:59-12:00",
        title: "CVPR 2027 — Full Paper Submission",
        description: "Hạn chót nộp toàn bộ bản thảo nghiên cứu hoàn chỉnh (Double-blind review).",
      },
      {
        date: "2026-12-05T23:59:59-12:00",
        title: "NeurIPS 2027 — Supplementary Material",
        description: "Hạn nộp mã nguồn phần mềm, video minh họa và tài liệu bổ sung.",
      },
    ];

    container.innerHTML = `
      <div class="timeline-wrapper">
        ${events
          .map((item) => {
            const status = getSmartStatus(item.date);
            const formattedDate = new Intl.DateTimeFormat("vi-VN", {
              timeZone: "Etc/GMT+12",
              day: "2-digit",
              month: "long",
              year: "numeric",
            }).format(new Date(parseAoEDate(item.date)));

            return `
              <article class="timeline-item" data-status="${status.type}">
                <div class="timeline-dot" aria-hidden="true"></div>
                <div class="timeline-content">
                  <div class="timeline-header">
                    <time class="timeline-date" datetime="${item.date}">
                      ${CALENDAR_ICON_SVG}
                      <span>${formattedDate} (AoE)</span>
                    </time>
                    <span class="status-badge ${status.className}">
                      <span class="status-dot" aria-hidden="true"></span>
                      ${status.label}
                    </span>
                  </div>
                  <h3 class="timeline-title">${item.title}</h3>
                  <p class="timeline-desc">${item.description}</p>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  // Đóng gói dịch vụ cho trang venues.html (Task 4.3)
  window.CountdownService = {
    parseAoEDate,
    getSmartStatus,
    createCountdownBadge,
    initCountdown,
    loadTimelineEvents,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initCountdown();
      loadTimelineEvents();
    });
  } else {
    initCountdown();
    loadTimelineEvents();
  }
})();