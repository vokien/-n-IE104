/**
 * ==========================================================
 * SCOPUSVENUE - COUNTDOWN & TIMELINE MODULE (Thành viên 4)
 * Xử lý: Nạp dữ liệu hội nghị từ conf.json,
 * tự động kích hoạt đồng hồ đếm ngược cho deadline gần nhất.
 * Múi giờ: Giờ Việt Nam (ICT / UTC+7)
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

  const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

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
  let activeFeaturedConference = null;

  const TZ_STORAGE_KEY = "cfp_timezone_pref";

  /**
   * Lấy múi giờ IANA của máy tính người dùng
   */
  function getUserLocalTz() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";
    } catch (e) {
      return "Asia/Ho_Chi_Minh";
    }
  }

  /**
   * Lấy độ lệch giờ GMT/UTC định dạng ngắn (ví dụ: GMT+7, GMT-5)
   */
  function getLocalOffsetLabel(tz) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date());
      const p = parts.find((x) => x.type === "timeZoneName");
      if (p) return p.value;
    } catch (e) {}
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const hours = Math.floor(Math.abs(offsetMin) / 60);
    return `UTC${sign}${hours}`;
  }

  /**
   * Trích xuất cấu hình múi giờ đang hoạt động dựa theo tùy chọn người dùng
   */
  function getActiveTimezoneConfig() {
    let pref = "local";
    try {
      pref = localStorage.getItem(TZ_STORAGE_KEY) || "local";
    } catch (e) {}

    const userLocalTz = getUserLocalTz();
    const localOffset = getLocalOffsetLabel(userLocalTz);
    const shortTzName = userLocalTz.split("/").pop().replace(/_/g, " ");

    if (pref === "vn") {
      return {
        key: "vn",
        iana: "Asia/Ho_Chi_Minh",
        bannerLabel: "Giờ Việt Nam - ICT / UTC+7",
        stepperLabel: "Giờ VN",
        itemLabel: "Giờ VN",
      };
    }
    if (pref === "aoe") {
      return {
        key: "aoe",
        iana: "Etc/GMT+12",
        bannerLabel: "Giờ gốc hội nghị - AoE / UTC-12",
        stepperLabel: "AoE",
        itemLabel: "AoE",
      };
    }
    // Mặc định: local (tự động theo máy tính người dùng)
    return {
      key: "local",
      iana: userLocalTz,
      bannerLabel: `Giờ thiết bị: ${shortTzName} (${localOffset})`,
      stepperLabel: `Giờ thiết bị (${localOffset})`,
      itemLabel: `Giờ thiết bị (${localOffset})`,
    };
  }

  // Quản lý đếm ngược thời gian thực trên danh sách venues (venues.html)
  const venueCountdownRegistry = new Map();
  let venueGlobalInterval = null;

  /**
   * 1. Tiện ích chuẩn hóa chuỗi thời gian về múi giờ Việt Nam (ICT / UTC+7)
   * Tự động chuyển đổi khoảng trắng thành "T" để tránh lỗi NaN khi parse
   */
  function parseVietnamDate(dateString) {
    if (!dateString) return NaN;
    let normalized = String(dateString).trim().replace(" ", "T");
    if (!normalized.includes("T")) {
      normalized = `${normalized}T23:59:59+07:00`;
    } else if (!normalized.match(/([+-]\d{2}:\d{2}|Z)$/)) {
      normalized = `${normalized}+07:00`;
    }
    return new Date(normalized).getTime();
  }

  // Tương thích ngược với các lệnh gọi parseAoEDate cũ
  const parseAoEDate = parseVietnamDate;

  /**
   * 2. Phân loại trạng thái deadline thông minh
   */
  function getSmartStatus(dateString) {
    const targetTime = parseVietnamDate(dateString);
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
   * CHỈ lấy đợt còn hạn nộp bài (loại bỏ hoàn toàn các đợt đã hết hạn)
   */
  function extractActiveEdition(venue) {
    if (!venue.submission_deadlines || !Array.isArray(venue.submission_deadlines) || venue.submission_deadlines.length === 0) {
      return null;
    }
    const now = Date.now();

    const upcoming = venue.submission_deadlines
      .filter((e) => e && e.deadline && parseVietnamDate(e.deadline) > now)
      .sort((a, b) => parseVietnamDate(a.deadline) - parseVietnamDate(b.deadline));

    return upcoming.length > 0 ? upcoming[0] : null;
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
    const targetTimestamp = parseVietnamDate(deadlineStr);
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
   * Cập nhật chuỗi thông báo hạn nộp bài trên Featured Banner theo múi giờ đang chọn
   */
  function updateFeaturedDeadlineText(conference) {
    if (!conference) return;
    const deadlineEl = document.querySelector(".countdown-featured-deadline");
    if (!deadlineEl || !conference.deadline) return;

    const tzConfig = getActiveTimezoneConfig();
    const formatted = new Intl.DateTimeFormat("vi-VN", {
      timeZone: tzConfig.iana,
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(conference.targetTime));

    deadlineEl.innerHTML = `Hạn nộp: <time datetime="${conference.deadline}">${formatted} (${tzConfig.bannerLabel})</time>`;
  }

  /**
   * 5. Khởi động đồng hồ đếm ngược nổi bật (Featured Banner - timeline.html)
   */
  function startFeaturedCountdown(conference) {
    if (!conference) return;
    activeFeaturedConference = conference;

    const daysEl    = document.getElementById("days");
    const hoursEl   = document.getElementById("hours");
    const minutesEl = document.getElementById("minutes");
    const secondsEl = document.getElementById("seconds");
    const titleEl   = document.getElementById("featured-countdown");

    if (titleEl) {
      titleEl.textContent = `${conference.name} - Full Paper Submission`;
    }

    updateFeaturedDeadlineText(conference);

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
   * 5b. Cập nhật động 3 bước CFP Stepper theo hội nghị đang xem và múi giờ được chọn
   */
  function renderCFPStepper(conference) {
    const tzConfig = getActiveTimezoneConfig();
    const formatDate = (dateStr) => {
      if (!dateStr) return "Chưa công bố";
      const ts = parseVietnamDate(dateStr);
      if (isNaN(ts)) return dateStr;
      return new Intl.DateTimeFormat("vi-VN", {
        timeZone: tzConfig.iana,
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
            <p class="cfp-flow-date">${formatDate(st.date)} (${tzConfig.stepperLabel})</p>
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
        if (dateEl)  { dateEl.textContent = `${formatDate(st.date)} (${tzConfig.stepperLabel})`; if (dateEl.tagName === "TIME") dateEl.setAttribute("datetime", st.date || ""); }
        if (titleEl) titleEl.textContent = st.title;
        if (nodeEl)  { nodeEl.classList.toggle("cfp-flow-node--done", st.status.isEnded); nodeEl.classList.toggle("cfp-flow-node--active", !st.status.isEnded); }
      });
    }
  }

  /**
   * 6. Render danh sách hội nghị vào Dòng thời gian ziczac
   * CHỈ hiển thị các hội nghị còn hạn nộp bài, định dạng theo múi giờ đang chọn
   */
  function renderTimelineList(conferences) {
    const container = document.getElementById("timeline-events-container");
    if (!container) return;

    if (!conferences || conferences.length === 0) {
      container.innerHTML = `<p class="timeline-empty-message">Hiện không có hội nghị nào đang mở nhận bài.</p>`;
      return;
    }

    const tzConfig = getActiveTimezoneConfig();

    container.innerHTML = `<div class="timeline-wrapper">${conferences.map((item) => {
      const status = getSmartStatus(item.deadline);
      const formattedDate = new Intl.DateTimeFormat("vi-VN", {
        timeZone: tzConfig.iana, day: "2-digit", month: "long", year: "numeric",
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
                <span>${formattedDate} (${tzConfig.itemLabel})</span>
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
   * Khởi tạo bộ lắng nghe sự kiện chuyển đổi múi giờ (Timezone Selector)
   */
  function setupTimezoneSelector() {
    const selectEl = document.getElementById("timezone-selector");
    if (!selectEl) return;

    let currentPref = "local";
    try {
      currentPref = localStorage.getItem(TZ_STORAGE_KEY) || "local";
    } catch (e) {}

    selectEl.value = currentPref;

    // Cập nhật nhãn option local hiển thị đúng tên múi giờ và offset máy tính
    const localOption = selectEl.querySelector('option[value="local"]');
    if (localOption) {
      const userLocalTz = getUserLocalTz();
      const localOffset = getLocalOffsetLabel(userLocalTz);
      const shortTzName = userLocalTz.split("/").pop().replace(/_/g, " ");
      localOption.textContent = `Giờ thiết bị: ${shortTzName} (${localOffset}) - Tự động`;
    }

    selectEl.addEventListener("change", (e) => {
      const newPref = e.target.value;
      try {
        localStorage.setItem(TZ_STORAGE_KEY, newPref);
      } catch (err) {}

      if (activeFeaturedConference) {
        updateFeaturedDeadlineText(activeFeaturedConference);
        renderCFPStepper(activeFeaturedConference);
      }
      renderTimelineList(allConferences);
    });
  }

  /**
   * 7. Hàm chính: Tự động nạp dữ liệu hội nghị từ conf.json
   * Lọc bỏ hoàn toàn các hội nghị đã quá hạn nộp bài
   */
  async function loadTimelineData() {
    try {
      const response = await fetch("./data/conf.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}: Không tìm thấy file dữ liệu conf.json`);

      const rawData = await response.json();
      const list = Array.isArray(rawData) ? rawData : (rawData.conferences || rawData.venues || rawData.data || []);

      const now = Date.now();

      // Chuẩn hóa và LOẠI BỎ TOÀN BỘ hội nghị đã quá hạn nộp bài
      allConferences = list
        .map(normalizeConference)
        .filter((c) => c !== null && c.targetTime > now);

      // Sắp xếp theo thứ tự hạn nộp bài gần nhất trước
      allConferences.sort((a, b) => a.targetTime - b.targetTime);

      console.log(`✅ [ScopusVenue] Đã nạp ${allConferences.length} hội nghị đang mở nhận bài!`);

      const targetId = new URLSearchParams(window.location.search).get("id");
      let featured = null;

      if (targetId) {
        featured = allConferences.find((c) => String(c.id) === String(targetId));
        if (featured) console.log(`🎯 [ScopusVenue] Hiển thị: ${featured.name}`);
        else          console.warn(`⚠️ [ScopusVenue] Hội nghị id="${targetId}" không tồn tại hoặc đã hết hạn nộp bài.`);
      }

      if (!featured && allConferences.length > 0) {
        featured = allConferences[0];
      }

      if (featured) {
        startFeaturedCountdown(featured);
        renderCFPStepper(featured);
      } else {
        const titleEl = document.getElementById("featured-countdown");
        if (titleEl) titleEl.textContent = "Hiện không có hội nghị nào đang mở nhận bài";
        const deadlineEl = document.querySelector(".countdown-featured-deadline");
        if (deadlineEl) deadlineEl.textContent = "Tất cả các đợt nộp bài trong năm đã kết thúc.";
      }

      renderTimelineList(allConferences);
      setupTimezoneSelector();

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
    parseVietnamDate,
    parseAoEDate,
    getSmartStatus,
    loadTimelineData,
    attachCountdown,
    initVenueCountdowns,
    getAllConferences: () => allConferences,
    getActiveTimezoneConfig,
    setupTimezoneSelector,
  };

  // Kích hoạt an toàn khi DOM hoàn tất
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInitialize);
  } else {
    autoInitialize();
  }
})();