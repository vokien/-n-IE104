/**
 * ScopusVenue - Countdown & Timeline (Task T4.2 - Enhanced Logic)
 * Thành viên 4: Trần Hồng Lĩnh
 */

document.addEventListener("DOMContentLoaded", () => {
  initCountdown();
  loadTimelineEvents();
});

/* ==========================================================
   1. ĐỒNG HỒ ĐẾM NGƯỢC REALTIME (Countdown Banner)
   ================================================---------- */
function initCountdown() {
  const targetDate = new Date("2026-11-17T23:59:59-12:00").getTime();

  const daysEl = document.getElementById("days");
  const hoursEl = document.getElementById("hours");
  const minutesEl = document.getElementById("minutes");
  const secondsEl = document.getElementById("seconds");

  if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

  function updateTimer() {
    const now = new Date().getTime();
    const distance = targetDate - now;

    if (distance < 0) {
      daysEl.textContent = "00";
      hoursEl.textContent = "00";
      minutesEl.textContent = "00";
      secondsEl.textContent = "00";
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    daysEl.textContent = String(days).padStart(2, "0");
    hoursEl.textContent = String(hours).padStart(2, "0");
    minutesEl.textContent = String(minutes).padStart(2, "0");
    secondsEl.textContent = String(seconds).padStart(2, "0");
  }

  updateTimer();
  setInterval(updateTimer, 1000);
}

/* ==========================================================
   2. HỆ THỐNG TỰ ĐỘNG TÍNH TOÁN VÀ PHÂN LOẠI TRẠNG THÁI DEADLINE
   ================================================---------- */
function getSmartStatus(dateString) {
  const targetTime = new Date(dateString).getTime();
  const now = new Date().getTime();
  const diffDays = Math.ceil((targetTime - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: "ĐÃ KẾT THÚC", bg: "rgba(128, 128, 128, 0.15)", color: "#718096" };
  } else if (diffDays <= 7) {
    return { label: `KHẨN CẤP (${diffDays} NGÀY)`, bg: "rgba(235, 87, 87, 0.15)", color: "#eb5757" }; // Màu đỏ cảnh báo
  } else if (diffDays <= 30) {
    return { label: `SẮP ĐẾN HẠN (${diffDays} NGÀY)`, bg: "rgba(242, 153, 74, 0.15)", color: "#f2994a" }; // Màu cam
  } else {
    return { label: "ĐANG MỞ", bg: "rgba(39, 174, 96, 0.15)", color: "#27ae60" }; // Màu xanh an toàn
  }
}

/* ==========================================================
   3. RENDER DÒNG THỜI GIAN CFP (Timeline Events thông minh)
   ================================================---------- */
function loadTimelineEvents() {
  const container = document.getElementById("timeline-events-container");
  if (!container) return;

  // Danh sách mẫu (sau này có thể thay thế bằng dữ liệu fetch từ venues.json)
  const events = [
    {
      date: "2026-10-25T23:59:59",
      title: "ICLR 2027 — Abstract Deadline",
      description: "Hạn chót đăng ký tiêu đề và tóm tắt bài báo lên hệ thống OpenReview."
    },
    {
      date: "2026-11-17T23:59:59",
      title: "CVPR 2027 — Full Paper Submission",
      description: "Hạn chót nộp toàn bộ bản thảo nghiên cứu hoàn chỉnh (Double-blind review)."
    },
    {
      date: "2026-12-05T23:59:59",
      title: "NeurIPS 2027 — Supplementary Material",
      description: "Hạn nộp mã nguồn phần mềm, video minh họa và tài liệu bổ sung."
    }
  ];

  let html = `<div class="timeline-wrapper">`;
  
  events.forEach((item) => {
    // Tự động phân tích ngày tháng và trạng thái
    const status = getSmartStatus(item.date);
    const formattedDate = new Date(item.date).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });

    html += `
      <div class="timeline-item">
        <div class="timeline-dot" style="border-color: ${status.color};"></div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-date">📅 ${formattedDate}</span>
            <span class="badge" style="background-color: ${status.bg}; color: ${status.color}; font-size: 0.75rem; font-weight: 700;">${status.label}</span>
          </div>
          <h3 class="timeline-title">${item.title}</h3>
          <p class="timeline-desc">${item.description}</p>
        </div>
      </div>
    `;
  });
  
  html += `</div>`;
  container.innerHTML = html;
}