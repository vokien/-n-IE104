/**
 * ==========================================================
 * SCOPUSVENUE - COUNTDOWN & TIMELINE MODULE (Thành viên 4)
 * Xử lý: Nạp dữ liệu hội nghị từ conf.json (dự phòng venues.json),
 * tự động kích hoạt đồng hồ đếm ngược cho deadline gần nhất.
 * Múi giờ: Anywhere on Earth (AoE / UTC-12)
 * Chuẩn: 100% Vanilla JS, 0% Inline CSS, Memory Safe.
 * ==========================================================
 */

(function () {
  "use strict";

  // Hằng số thời gian (milliseconds)
  const MS_SECOND = 1000;
  const MS_MINUTE = 60 * MS_SECOND;
  const MS_HOUR   = 60 * MS_MINUTE;
  const MS_DAY    = 24 * MS_HOUR;

  // Icon SVG Calendar chuẩn pixel
  const CALENDAR_ICON_SVG = `
    <svg class="timeline-date-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  `;

  let allConferences = [];
  let bannerTimerInterval = null;

  // Quản lý đếm ngược thời gian thực trên danh sách venues (venues.html)
  const venueCountdownRegistry = new Map();
  let venueGlobalInterval = null;

  /**
   * 1. Tiện ích chuẩn hóa chuỗi thời gian về chuẩn AoE (UTC-12)
   * Tự động chuyển đổi khoảng trắng thành "T" để tránh lỗi NaN khi parse
   */
  function parseAoEDate(dateString) {
    if (!dateString) return NaN;
    let normalized = String(dateString).trim().replace(" ", "T");
    if (!normalized.includes("T")) {
      normalized = `${normalized}T23:59:59-12:00`;
    } else if (!normalized.match(/([+-]\d{2}:\d{2}|Z)$/)) {
      normalized = `${normalized}-12:00`;
    }
    return new Date(normalized).getTime();
  }

  /**
   * 2. Phân loại trạng thái deadline thông minh
   */
  function getSmartStatus(dateString) {
    const targetTime = parseAoEDate(dateString);
    const remaining  = targetTime - Date.now();
    const diffDays   = Math.ceil(remaining / MS_DAY);

    if (isNaN(targetTime) || remaining <= 0) {
      return { type: "ended",   label: "Đã kết thúc",                   className: "badge--ended",   diffDays: 0,        isEnded: true  };
    }
    if (diffDays <= 7) {
      return { type: "urgent",  label: `Khẩn cấp (còn ${diffDays} ngày)`,  className: "badge--urgent",  diffDays: diffDays, isEnded: false };
    }
    if (diffDays <= 30) {
      return { type: "warning", label: `Sắp đến hạn (${diffDays} ngày)`,   className: "badge--warning", diffDays: diffDays, isEnded: false };
    }
    return   { type: "open",    label: "Đang mở nhận bài",                  className: "badge--open",    diffDays: diffDays, isEnded: false };
  }

  /**
   * 3. Trích xuất đợt nộp bài phù hợp nhất của 1 hội nghị
   */
  function extractActiveEdition(venue) {
    if (!venue.submission_deadlines || !Array.isArray(venue.submission_deadlines) || venue.submission_deadlines.length === 0) {
      return null;
    }
    const now = Date.now();

    const upcoming = venue.submission_deadlines
      .filter((e) => e && e.deadline && parseAoEDate(e.deadline) > now)
      .sort((a, b) => parseAoEDate(a.deadline) - parseAoEDate(b.deadline));
    if (upcoming.length > 0) return upcoming[0];

    const validPast = venue.submission_deadlines
      .filter((e) => e && e.deadline && !isNaN(parseAoEDate(e.deadline)))
      .sort((a, b) => parseAoEDate(b.deadline) - parseAoEDate(a.deadline));
    return validPast[0] || null;
  }

  /**
   * 4. Chuẩn hóa dữ liệu hội nghị (Tương thích cả venues.json lẫn conf.json)
   */
  function normalizeConference(item) {
    let deadlineStr      = item.deadline || item.cfp_deadline || item.submission_deadline || "";
    let abstractDeadline = item.abstract_deadline || null;
    let decisionDeadline = item.decision_deadline || null;
    let yearStr  = item.year ? ` ${item.year}` : "";
    let shortName = item.acronym ? `${item.acronym}${yearStr}` : (item.name || item.title || "Hội nghị");
    let fullName  = item.name || item.title || item.full_name || shortName;

    if (item.submission_deadlines && Array.isArray(item.submission_deadlines) && item.submission_deadlines.length > 0) {
      const edition = extractActiveEdition(item);
      if (!edition) return null;
      deadlineStr      = edition.deadline;
      abstractDeadline = edition.abstract_deadline || null;
      decisionDeadline = edition.decision_deadline || null;
      yearStr   = edition.year ? ` ${edition.year}` : "";
      shortName = item.acronym ? `${item.acronym}${yearStr}` : item.name;
      fullName  = item.name;
    }

    if (!deadlineStr) return null;
    const targetTimestamp = parseAoEDate(deadlineStr);
    if (isNaN(targetTimestamp)) return null;

    let rankLabel = "";
    if (item.core_rank)   rankLabel = `CORE ${item.core_rank}`;
    else if (item.scopus_rank) rankLabel = `Scopus ${item.scopus_rank}`;
    else if (item.rank)   rankLabel = item.rank;

    return {
      id: item.id || Math.random().toString(36).substring(2, 9),
      name: shortName,
      fullName: fullName,
      deadline: deadlineStr,
      abstractDeadline: abstractDeadline,
      decisionDeadline: decisionDeadline,
      rank: rankLabel,
      comment: item.comment || "",
      targetTime: targetTimestamp,
      homepage: item.homepage_url || item.link || "#",
    };
  }

  /**
   * 5. Khởi động đồng hồ đếm ngược nổi bật (Featured Banner - timeline.html)
   */
  function startFeaturedCountdown(conference) {
    if (!conference) return;

    const daysEl    = document.getElementById("days");
    const hoursEl   = document.getElementById("hours");
    const minutesEl = document.getElementById("minutes");
    const secondsEl = document.getElementById("seconds");
    const titleEl   = document.getElementById("featured-countdown");
    const deadlineEl = document.querySelector(".countdown-featured-deadline");

    if (titleEl) {
      titleEl.textContent = `${conference.name} — Full Paper Submission`;
    }

    if (deadlineEl && conference.deadline) {
      const formatted = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Etc/GMT+12",
        day: "2-digit", month: "long", year: "numeric",
      }).format(new Date(conference.targetTime));
      deadlineEl.innerHTML = `Hạn nộp: <time datetime="${conference.deadline}">${formatted} (Múi giờ AoE - 23:59:59 UTC-12)</time>`;
    }

    if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

    if (bannerTimerInterval) {
      clearInterval(bannerTimerInterval);
      bannerTimerInterval = null;
    }

    function render(d, h, m, s) {
      daysEl.textContent    = String(d).padStart(2, "0");
      hoursEl.textContent   = String(h).padStart(2, "0");
      minutesEl.textContent = String(m).padStart(2, "0");
      secondsEl.textContent = String(s).padStart(2, "0");
    }

    render(0, 0, 0, 0);

    function update() {
      const distance = conference.targetTime - Date.now();
      if (distance <= 0) {
        render(0, 0, 0, 0);
        if (bannerTimerInterval) { clearInterval(bannerTimerInterval); bannerTimerInterval = null; }
        return false;
      }
      render(
        Math.floor(distance / MS_DAY),
        Math.floor((distance % MS_DAY)  / MS_HOUR),
        Math.floor((distance % MS_HOUR) / MS_MINUTE),
        Math.floor((distance % MS_MINUTE) / MS_SECOND)
      );
      return true;
    }

    if (update()) {
      bannerTimerInterval = setInterval(update, MS_SECOND);
    }
  }

  /**
   * 5b. Cập nhật động 3 bước CFP Stepper theo hội nghị đang xem
   */
  function renderCFPStepper(conference) {
    const formatDate = (dateStr) => {
      if (!dateStr) return "Chưa công bố";
      const ts = parseAoEDate(dateStr);
      if (isNaN(ts)) return dateStr;
      return new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Etc/GMT+12",
        day: "2-digit", month: "2-digit", year: "numeric",
      }).format(new Date(ts));
    };

    const stages = [
      {
        title: "Abstract Submission",
        date:  conference.abstractDeadline || null,
        desc:  "Đăng ký tiêu đề, danh sách tác giả và tóm tắt bài báo lên hệ thống phản biện.",
        status: conference.abstractDeadline
          ? getSmartStatus(conference.abstractDeadline)
          : { className: "badge--ended", label: "Chưa công bố", isEnded: true },
      },
      {
        title: "Full Paper Submission",
        date:  conference.deadline || null,
        desc:  "Nộp toàn văn bản thảo nghiên cứu hoàn chỉnh (Double-blind review).",
        status: conference.deadline
          ? getSmartStatus(conference.deadline)
          : { className: "badge--ended", label: "Chưa công bố", isEnded: true },
      },
      {
        title: "Notification",
        date:  conference.decisionDeadline || null,
        desc:  "Hội đồng khoa học công bố kết quả chấp nhận bài báo và gửi phản biện.",
        status: conference.decisionDeadline
          ? getSmartStatus(conference.decisionDeadline)
          : { className: "badge--ended", label: "Chưa công bố", isEnded: true },
      },
    ];

    const container = (
      document.getElementById("timeline-flow-container") ||
      document.getElementById("cfp-stepper-container") ||
      document.getElementById("cfp-flow-container") ||
      document.querySelector(".cfp-flow-stepper")?.closest("section, div[id], div[class*='container']")
    );

    if (container) {
      container.innerHTML = `<div class="cfp-flow-stepper">${stages.map((st, idx) => `
        <div class="cfp-flow-step">
          <div class="cfp-flow-node ${st.status.isEnded ? "cfp-flow-node--done" : "cfp-flow-node--active"}" aria-hidden="true">
            <span>${idx + 1}</span>
          </div>
          <div class="cfp-flow-body">
            <p class="cfp-flow-badge">MỐC ${idx + 1}</p>
            <h3 class="cfp-flow-name">${st.title}</h3>
            <p class="cfp-flow-date">${formatDate(st.date)} (AoE)</p>
            <p class="cfp-flow-desc">${st.desc}</p>
          </div>
        </div>
      `).join("")}</div>`;
      return;
    }

    const stepCards = document.querySelectorAll(".cfp-flow-step, .cfp-step-item");
    if (stepCards.length > 0) {
      stages.forEach((st, idx) => {
        const card = stepCards[idx];
        if (!card) return;
        const dateEl  = card.querySelector(".cfp-flow-date, .cfp-step-date, time");
        const titleEl = card.querySelector(".cfp-flow-name, .cfp-step-title, h3, h4");
        const nodeEl  = card.querySelector(".cfp-flow-node, .cfp-step-marker");
        if (dateEl)  { dateEl.textContent = `${formatDate(st.date)} (AoE)`; if (dateEl.tagName === "TIME") dateEl.setAttribute("datetime", st.date || ""); }
        if (titleEl) titleEl.textContent = st.title;
        if (nodeEl)  { nodeEl.classList.toggle("cfp-flow-node--done", st.status.isEnded); nodeEl.classList.toggle("cfp-flow-node--active", !st.status.isEnded); }
      });
    }
  }

  /**
   * 6. Render danh sách hội nghị vào Dòng thời gian ziczac
   */
  function renderTimelineList(conferences) {
    const container = document.getElementById("timeline-events-container");
    if (!container) return;

    if (!conferences || conferences.length === 0) {
      container.innerHTML = `<p class="timeline-empty-message">Không tìm thấy hội nghị phù hợp.</p>`;
      return;
    }

    container.innerHTML = `<div class="timeline-wrapper">${conferences.map((item) => {
      const status = getSmartStatus(item.deadline);
      const formattedDate = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Etc/GMT+12", day: "2-digit", month: "long", year: "numeric",
      }).format(new Date(item.targetTime));
      
      const rankBadge = item.rank
        ? `<span class="badge badge--rank">${item.rank}</span>`
        : "";

      return `
        <article class="timeline-item" data-status="${status.type}">
          <div class="timeline-dot" aria-hidden="true"></div>
          <div class="timeline-content">
            <div class="timeline-header">
              <time class="timeline-date" datetime="${item.deadline}">
                ${CALENDAR_ICON_SVG}
                <span>${formattedDate} (AoE)</span>
              </time>
              <div class="timeline-badges">
                ${rankBadge}
                <span class="badge ${status.className}">
                  <span class="status-dot" aria-hidden="true"></span>
                  ${status.label}
                </span>
              </div>
            </div>
            <h3 class="timeline-title">${item.name}</h3>
            <p class="timeline-desc">${item.fullName}</p>
          </div>
        </article>
      `;
    }).join("")}</div>`;
  }

  /**
   * 7. Hàm chính: Tự động nạp dữ liệu (Ưu tiên conf.json, dự phòng venues.json)
   */
  async function loadTimelineData() {
    try {
      let response = await fetch("./data/conf.json");
      if (!response.ok) response = await fetch("./data/venues.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}: Không tìm thấy file dữ liệu`);

      const rawData = await response.json();
      const list = Array.isArray(rawData) ? rawData : (rawData.conferences || rawData.venues || rawData.data || []);

      allConferences = list.map(normalizeConference).filter((c) => c !== null);

      const now = Date.now();
      allConferences.sort((a, b) => {
        const aUp = a.targetTime > now, bUp = b.targetTime > now;
        if (aUp && !bUp) return -1;
        if (!aUp && bUp) return   1;
        return a.targetTime - b.targetTime;
      });

      console.log(`✅ [ScopusVenue] Đã nạp ${allConferences.length} hội nghị có deadline!`);

      const targetId = new URLSearchParams(window.location.search).get("id");
      let featured = null;

      if (targetId) {
        featured = allConferences.find((c) => String(c.id) === String(targetId));
        if (featured) console.log(`🎯 [ScopusVenue] Hiển thị: ${featured.name}`);
        else          console.warn(`⚠️ [ScopusVenue] Không tìm thấy id="${targetId}", dùng gần nhất.`);
      }

      if (!featured) {
        const upcoming = allConferences.filter((c) => c.targetTime > now);
        featured = upcoming.length > 0 ? upcoming[0] : allConferences[0];
      }

      if (featured) {
        startFeaturedCountdown(featured);
        renderCFPStepper(featured);
      }

      renderTimelineList(allConferences);

    } catch (error) {
      console.error("❌ Lỗi khi tải dữ liệu hội nghị:", error);
    }
  }

  /* ==========================================================
   * TASK 4.3 - ĐẾM NGƯỢC TỪNG GIÂY TRÊN VENUES.HTML
   * ========================================================== */

  function updateSingleVenueCountdown(element, targetTime) {
    const remaining = targetTime - Date.now();

    if (remaining <= 0) {
      element.innerHTML = `<span class="badge badge--ended">ĐÃ KẾT THÚC</span>`;
      return false;
    }

    const days    = Math.floor(remaining / MS_DAY);
    const hours   = Math.floor((remaining % MS_DAY)    / MS_HOUR);
    const minutes = Math.floor((remaining % MS_HOUR)   / MS_MINUTE);
    const seconds = Math.floor((remaining % MS_MINUTE) / MS_SECOND);
    const pad     = (n) => String(n).padStart(2, "0");

    let badgeClass = "badge--open";
    if (days <= 7)  badgeClass = "badge--urgent";
    else if (days <= 30) badgeClass = "badge--warning";

    element.innerHTML = `
      <span class="badge ${badgeClass} countdown-text">
        CÒN ${days}D ${pad(hours)}H ${pad(minutes)}M ${pad(seconds)}S
      </span>
    `;

    return true;
  }

  function attachCountdown(container, deadlineDate) {
    const el = typeof container === "string" ? document.getElementById(container) : container;
    if (!el || !deadlineDate) return;

    const targetTime = typeof deadlineDate === "number" ? deadlineDate : parseAoEDate(deadlineDate);
    if (isNaN(targetTime)) return;

    venueCountdownRegistry.set(el, targetTime);
    updateSingleVenueCountdown(el, targetTime);

    if (!venueGlobalInterval) {
      venueGlobalInterval = setInterval(() => {
        let activeCount = 0;
        venueCountdownRegistry.forEach((time, element) => {
          if (document.body.contains(element)) {
            if (updateSingleVenueCountdown(element, time)) activeCount++;
          } else {
            venueCountdownRegistry.delete(element);
          }
        });
        if (activeCount === 0 && venueCountdownRegistry.size === 0) {
          clearInterval(venueGlobalInterval);
          venueGlobalInterval = null;
        }
      }, MS_SECOND);
    }
  }

  function initVenueCountdowns(selector = ".countdown-box") {
    document.querySelectorAll(selector).forEach((box) => {
      const deadline = box.dataset.deadline || box.getAttribute("data-deadline");
      if (deadline) attachCountdown(box, deadline);
    });
  }

  /**
   * Tự động nhận diện và khởi tạo tùy vào trang hiện tại đang mở
   */
  function autoInitialize() {
    if (document.getElementById("timeline-events-container") || document.getElementById("days")) {
      loadTimelineData();
    }
    if (document.querySelector(".countdown-box")) {
      initVenueCountdowns();
    }
  }

  // Xuất API dùng chung cho cả timeline.html và venues.html
  window.CountdownService = {
    parseAoEDate,
    getSmartStatus,
    loadTimelineData,
    attachCountdown,
    initVenueCountdowns,
    getAllConferences: () => allConferences,
  };

  // Kích hoạt an toàn khi DOM hoàn tất
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInitialize);
  } else {
    autoInitialize();
  }
})();