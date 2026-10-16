
document.addEventListener("DOMContentLoaded", () => {
  initCountdown();
  loadTimelineEvents();
});

function initCountdown() {
  const targetTime = new Date("2026-11-17T23:59:59-12:00").getTime();
  const units = ["days", "hours", "minutes", "seconds"].map((id) =>
    document.getElementById(id)
  );

  if (units.some((element) => !element)) return;

  let timerInterval = null;

  const render = (values) => {
    values.forEach((value, index) => {
      units[index].textContent = String(value).padStart(2, "0");
    });
  };

  function updateTimer() {
    const distance = targetTime - Date.now();

    if (distance <= 0) {
      render([0, 0, 0, 0]);

      if (timerInterval !== null) {
        clearInterval(timerInterval);
        timerInterval = null;
      }

      return false;
    }

    render([
      Math.floor(distance / 86_400_000),
      Math.floor((distance % 86_400_000) / 3_600_000),
      Math.floor((distance % 3_600_000) / 60_000),
      Math.floor((distance % 60_000) / 1_000),
    ]);

    return true;
  }

  if (updateTimer()) {
    timerInterval = setInterval(updateTimer, 1_000);
  }
}

function getSmartStatus(dateString) {
  const remaining = new Date(dateString).getTime() - Date.now();
  const diffDays = Math.ceil(remaining / 86_400_000);

  if (remaining <= 0) {
    return {
      label: "ĐÃ KẾT THÚC",
      bg: "rgba(128, 128, 128, 0.15)",
      color: "#718096",
    };
  }

  if (diffDays <= 7) {
    return {
      label: `KHẨN CẤP (${diffDays} NGÀY)`,
      bg: "rgba(235, 87, 87, 0.15)",
      color: "#eb5757",
    };
  }

  if (diffDays <= 30) {
    return {
      label: `SẮP ĐẾN HẠN (${diffDays} NGÀY)`,
      bg: "rgba(242, 153, 74, 0.15)",
      color: "#f2994a",
    };
  }

  return {
    label: "ĐANG MỞ",
    bg: "rgba(39, 174, 96, 0.15)",
    color: "#27ae60",
  };
}

function createCountdownBadge(targetDateStr) {
  const distance = new Date(targetDateStr).getTime() - Date.now();

  if (distance <= 0) return "Đã kết thúc";

  const days = Math.floor(distance / 86_400_000);
  const hours = Math.floor((distance % 86_400_000) / 3_600_000);

  return `Còn ${days} ngày ${String(hours).padStart(2, "0")} giờ`;
}

function loadTimelineEvents() {
  const container = document.getElementById("timeline-events-container");
  if (!container) return;

  const events = [
    {
      date: "2026-10-25T23:59:59-12:00",
      title: "ICLR 2027 — Abstract Deadline",
      description:
        "Hạn chót đăng ký tiêu đề và tóm tắt bài báo lên hệ thống OpenReview.",
    },
    {
      date: "2026-11-17T23:59:59-12:00",
      title: "CVPR 2027 — Full Paper Submission",
      description:
        "Hạn chót nộp toàn bộ bản thảo nghiên cứu hoàn chỉnh (Double-blind review).",
    },
    {
      date: "2026-12-05T23:59:59-12:00",
      title: "NeurIPS 2027 — Supplementary Material",
      description:
        "Hạn nộp mã nguồn phần mềm, video minh họa và tài liệu bổ sung.",
    },
  ];

  container.innerHTML = `
    <div class="timeline-wrapper">
      ${events
        .map((item) => {
          const status = getSmartStatus(item.date);
          const date = new Intl.DateTimeFormat("vi-VN", {
            timeZone: "Etc/GMT+12",
            day: "2-digit",
            month: "long",
            year: "numeric",
          }).format(new Date(item.date));

          return `
            <article class="timeline-item">
              <div class="timeline-dot" style="border-color: ${status.color};"></div>

              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-date">📅 ${date} (AoE)</span>
                  <span
                    class="badge"
                    style="background: ${status.bg}; color: ${status.color};"
                  >
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

window.createCountdownBadge = createCountdownBadge;