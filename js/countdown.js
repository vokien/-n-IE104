/**
 * ==========================================================
 * SCOPUSVENUE - COUNTDOWN & TIMELINE MODULE (Thành viên 4)
 * Xử lý: Nạp dữ liệu hội nghị từ conf.json,
 * tự động kích hoạt đồng hồ đếm ngược cho deadline gần nhất.
 * Múi giờ: Múi giờ chuẩn hội nghị (AoE - UTC-12) & Múi giờ theo thiết bị
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

    if (pref === "aoe") {
      return {
        key: "aoe",
        iana: "Etc/GMT+12",
        bannerLabel: "Múi giờ theo hội nghị - AoE / UTC-12",
        stepperLabel: "Giờ hội nghị (AoE)",
        itemLabel: "Múi giờ hội nghị (AoE)",
      };
    }
    // Mặc định: local (tự động theo máy tính / thiết bị người dùng)
    return {
      key: "local",
      iana: userLocalTz,
      bannerLabel: `Múi giờ thiết bị: ${shortTzName} (${localOffset})`,
      stepperLabel: `Giờ thiết bị (${localOffset})`,
      itemLabel: `Múi giờ thiết bị (${localOffset})`,
    };
  }

  // Quản lý đếm ngược thời gian thực trên danh sách venues (venues.html)
  const venueCountdownRegistry = new Map();
  let venueGlobalInterval = null;

  /**
   * 1. Tiện ích chuẩn hóa chuỗi thời gian (fallback +07:00 khi chuỗi không có múi giờ)
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
   * 2a. Phân loại trạng thái chuyên biệt cho Mốc 3 - Notification (Ngày thông báo kết quả)
   * TUYỆT ĐỐI KHÔNG dùng các từ ngữ gây hiểu lầm như "Đang mở nhận bài", "Khẩn cấp", "Sắp đến hạn"
   * Sử dụng chuẩn ngữ nghĩa học thuật:
   * - "Chờ công bố kết quả" (khi còn > 30 ngày)
   * - "Đang phản biện (còn X ngày)" (khi còn <= 30 ngày)
   * - "Sắp công bố kết quả (còn X ngày)" (khi còn <= 7 ngày)
   * - "Đã công bố kết quả" (khi đã đến hoặc qua ngày)
   * - "Chưa công bố" (khi ban tổ chức chưa ấn định ngày)
   */
  function getNotificationStatus(dateString) {
    if (!dateString) {
      return {
        type: "unannounced",
        label: "Chưa công bố",
        className: "badge--ended",
        isEnded: true,
      };
    }

    const targetTime = parseVietnamDate(dateString);
    const remaining  = targetTime - Date.now();
    const diffDays   = Math.ceil(remaining / MS_DAY);

    if (isNaN(targetTime) || remaining <= 0) {
      return {
        type: "announced",
        label: "Đã công bố kết quả",
        className: "badge--ended",
        diffDays: 0,
        isEnded: true,
      };
    }

    if (diffDays <= 7) {
      return {
        type: "announcing-soon",
        label: `Sắp công bố kết quả (còn ${diffDays} ngày)`,
        className: "badge--warning",
        diffDays: diffDays,
        isEnded: false,
      };
    }

    if (diffDays <= 30) {
      return {
        type: "in-review",
        label: `Đang phản biện (còn ${diffDays} ngày)`,
        className: "badge--review",
        diffDays: diffDays,
        isEnded: false,
      };
    }

    return {
      type: "pending",
      label: "Chờ công bố kết quả",
      className: "badge--review",
      diffDays: diffDays,
      isEnded: false,
    };
  }

  /**
   * 2b. Phân loại trạng thái deadline thông minh cho việc nộp bài (Abstract, Full Paper)
   */
  function getSmartStatus(dateString, milestoneType = "paper") {
    if (milestoneType === "notification") {
      return getNotificationStatus(dateString);
    }

    const targetTime = parseVietnamDate(dateString);
    const remaining  = targetTime - Date.now();
    const diffDays   = Math.ceil(remaining / MS_DAY);
    const isAbstract = milestoneType === "abstract";

    if (isNaN(targetTime) || remaining <= 0) {
      return {
        type: "ended",
        label: isAbstract ? "Đã đóng nhận abstract" : "Đã kết thúc nhận bài",
        className: "badge--ended",
        diffDays: 0,
        isEnded: true,
      };
    }
    if (diffDays <= 7) {
      return {
        type: "urgent",
        label: `Khẩn cấp (còn ${diffDays} ngày)`,
        className: "badge--urgent",
        diffDays: diffDays,
        isEnded: false,
      };
    }
    if (diffDays <= 30) {
      return {
        type: "warning",
        label: isAbstract ? `Sắp hết hạn abstract (${diffDays} ngày)` : `Sắp đến hạn (${diffDays} ngày)`,
        className: "badge--warning",
        diffDays: diffDays,
        isEnded: false,
      };
    }
    return {
      type: "open",
      label: isAbstract ? "Đang mở nhận abstract" : "Đang mở nhận bài",
      className: "badge--open",
      diffDays: diffDays,
      isEnded: false,
    };
  }

  /**
   * 3a. Tính toán mốc deadline hiệu lực gần nhất của hội nghị
   * Xét cả 3 mốc: Abstract Submission, Full Paper Submission, Notification
   * Lấy mốc còn hạn gần nhất (> now) để đếm ngược và sắp xếp thứ tự
   */
  function computeNearestMilestone(abstractStr, paperStr, decisionStr) {
    const now = Date.now();
    const abstractTs = abstractStr ? parseVietnamDate(abstractStr) : NaN;
    const paperTs    = paperStr ? parseVietnamDate(paperStr) : NaN;
    const decisionTs = decisionStr ? parseVietnamDate(decisionStr) : NaN;

    const candidates = [];

    if (!isNaN(abstractTs) && abstractTs > now) {
      candidates.push({
        type: "abstract",
        label: "Abstract Submission",
        badge: "Abstract",
        timestamp: abstractTs,
        dateStr: abstractStr,
        isSubmission: true,
      });
    }

    if (!isNaN(paperTs) && paperTs > now) {
      candidates.push({
        type: "fullpaper",
        label: "Full Paper Submission",
        badge: "Full Paper",
        timestamp: paperTs,
        dateStr: paperStr,
        isSubmission: true,
      });
    }

    if (!isNaN(decisionTs) && decisionTs > now) {
      candidates.push({
        type: "notification",
        label: "Notification",
        badge: "Notification",
        timestamp: decisionTs,
        dateStr: decisionStr,
        isSubmission: false,
      });
    }

    if (candidates.length === 0) {
      const fallbackTs = !isNaN(paperTs) ? paperTs : (!isNaN(abstractTs) ? abstractTs : decisionTs);
      return {
        type: "ended",
        label: "Đã kết thúc",
        badge: "Đã đóng",
        timestamp: fallbackTs || 0,
        dateStr: paperStr || abstractStr || decisionStr || "",
        isSubmission: false,
        isEnded: true,
      };
    }

    candidates.sort((a, b) => a.timestamp - b.timestamp);
    const nearest = candidates[0];
    nearest.isEnded = false;
    return nearest;
  }

  /**
   * 3b. Trích xuất đợt nộp bài phù hợp nhất của 1 hội nghị
   * CHỈ lấy đợt còn ít nhất 1 mốc hợp lệ (> now)
   */
  function extractActiveEdition(venue) {
    if (!venue.submission_deadlines || !Array.isArray(venue.submission_deadlines) || venue.submission_deadlines.length === 0) {
      return null;
    }

    const upcoming = venue.submission_deadlines
      .map((e) => {
        if (!e) return null;
        const nearest = computeNearestMilestone(e.abstract_deadline, e.deadline, e.decision_deadline);
        if (!nearest || nearest.isEnded) return null;
        return { edition: e, nearest };
      })
      .filter(Boolean)
      .sort((a, b) => a.nearest.timestamp - b.nearest.timestamp);

    return upcoming.length > 0 ? upcoming[0].edition : null;
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
      deadlineStr      = edition.deadline || "";
      abstractDeadline = edition.abstract_deadline || null;
      decisionDeadline = edition.decision_deadline || null;
      yearStr   = edition.year ? ` ${edition.year}` : "";
      shortName = item.acronym ? `${item.acronym}${yearStr}` : item.name;
      fullName  = item.name;
    }

    if (!deadlineStr && !abstractDeadline) return null;

    const nearest = computeNearestMilestone(abstractDeadline, deadlineStr, decisionDeadline);
    if (!nearest || nearest.isEnded) return null;

    let rankLabel = "";
    if (item.core_rank)        rankLabel = `CORE ${item.core_rank}`;
    else if (item.scopus_rank) rankLabel = `Scopus ${item.scopus_rank}`;
    else if (item.rank)        rankLabel = item.rank;

    return {
      id: item.id || Math.random().toString(36).substring(2, 9),
      name: shortName,
      fullName: fullName,
      deadline: deadlineStr,
      abstractDeadline: abstractDeadline,
      decisionDeadline: decisionDeadline,
      rank: rankLabel,
      comment: item.comment || "",
      nearestMilestone: nearest,
      targetTime: nearest.timestamp,
      homepage: item.homepage_url || item.link || "#",
    };
  }

  /**
   * Cập nhật chuỗi thông báo hạn nộp bài trên Featured Banner theo múi giờ đang chọn
   */
  function updateFeaturedDeadlineText(conference) {
    if (!conference || !conference.nearestMilestone) return;
    const deadlineEl = document.querySelector(".countdown-featured-deadline");
    if (!deadlineEl) return;

    const tzConfig = getActiveTimezoneConfig();
    const formatted = new Intl.DateTimeFormat("vi-VN", {
      timeZone: tzConfig.iana,
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(conference.targetTime));

    const isNotif = conference.nearestMilestone.type === "notification";
    const prefix = isNotif ? "Thời gian công bố kết quả" : "Hạn nộp";

    deadlineEl.innerHTML = `${prefix} (${conference.nearestMilestone.label}): <time datetime="${conference.nearestMilestone.dateStr}">${formatted} (${tzConfig.bannerLabel})</time>`;
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
    const milestoneBadgeEl = document.getElementById("countdown-featured-milestone-badge");

    if (titleEl) {
      titleEl.textContent = `${conference.name} - ${conference.nearestMilestone.label}`;
    }

    if (milestoneBadgeEl) {
      milestoneBadgeEl.textContent = conference.nearestMilestone.label;
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
    if (!conference) return;
    const tzConfig = getActiveTimezoneConfig();

    // Làm rõ quan hệ: Gắn trực tiếp tên hội nghị vào tiêu đề phần CFP Stepper
    const confNameEl = document.getElementById("cfp-flow-conf-name");
    if (confNameEl) {
      confNameEl.textContent = conference.name;
    }
    const confDescEl = document.getElementById("cfp-flow-conf-desc");
    if (confDescEl) {
      confDescEl.textContent = `Chi tiết quy trình 3 mốc nộp bài và thông báo kết quả của hội nghị "${conference.name}" (${conference.fullName}) đang được theo dõi ở trên.`;
    }

    const formatStageDate = (st, idx) => {
      if (!st.date) {
        return idx === 0 ? "Không có vòng nộp abstract" : "Chưa công bố";
      }
      const ts = parseVietnamDate(st.date);
      if (isNaN(ts)) return `${st.date} (${tzConfig.stepperLabel})`;
      const formatted = new Intl.DateTimeFormat("vi-VN", {
        timeZone: tzConfig.iana,
        day: "2-digit", month: "2-digit", year: "numeric",
      }).format(new Date(ts));
      return `${formatted} (${tzConfig.stepperLabel})`;
    };

    const stages = [
      {
        title: "Abstract Submission",
        date:  conference.abstractDeadline || null,
        desc:  conference.abstractDeadline
          ? "Đăng ký tiêu đề, danh sách tác giả và tóm tắt bài báo lên hệ thống phản biện."
          : "Hội nghị không có vòng nộp abstract; tác giả nộp trực tiếp toàn văn bản thảo (Full Paper) tại Mốc 2.",
        status: conference.abstractDeadline
          ? getSmartStatus(conference.abstractDeadline, "abstract")
          : { className: "badge--neutral", label: "Không có vòng nộp abstract", isEnded: true },
      },
      {
        title: "Full Paper Submission",
        date:  conference.deadline || null,
        desc:  "Nộp toàn văn bản thảo nghiên cứu hoàn chỉnh (Double-blind review).",
        status: conference.deadline
          ? getSmartStatus(conference.deadline, "paper")
          : { className: "badge--ended", label: "Chưa công bố", isEnded: true },
      },
      {
        title: "Notification",
        date:  conference.decisionDeadline || null,
        desc:  conference.decisionDeadline
          ? "Hội đồng khoa học công bố kết quả chấp nhận bài báo và gửi phản biện."
          : "Hội đồng khoa học chưa công bố ngày thông báo kết quả chấp nhận bài báo.",
        status: conference.decisionDeadline
          ? getNotificationStatus(conference.decisionDeadline)
          : { className: "badge--ended", label: "Chưa công bố", isEnded: true },
      },
    ];

    const container = (
      document.getElementById("cfp-flow-container") ||
      document.getElementById("timeline-flow-container") ||
      document.getElementById("cfp-stepper-container")
    );

    if (container) {
      container.innerHTML = `<ol class="cfp-flow-stepper">${stages.map((st, idx) => `
        <li class="cfp-flow-step ${st.status.isEnded ? "" : "cfp-flow-step--active"}">
          <div class="cfp-flow-node ${st.status.isEnded ? "cfp-flow-node--done" : "cfp-flow-node--active"}" aria-hidden="true">
            <span>${idx + 1}</span>
          </div>
          <div class="cfp-flow-body">
            <div class="cfp-flow-header-row">
              <p class="cfp-flow-badge">MỐC ${idx + 1}</p>
              <span class="badge ${st.status.className}">${st.status.label}</span>
            </div>
            <h3 class="cfp-flow-name">${st.title}</h3>
            <p class="cfp-flow-date">${formatStageDate(st, idx)}</p>
            <p class="cfp-flow-desc">${st.desc}</p>
          </div>
        </li>
      `).join("")}</ol>`;
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
        if (dateEl)  { dateEl.textContent = formatStageDate(st, idx); if (dateEl.tagName === "TIME") dateEl.setAttribute("datetime", st.date || ""); }
        if (titleEl) titleEl.textContent = st.title;
        if (nodeEl)  { nodeEl.classList.toggle("cfp-flow-node--done", st.status.isEnded); nodeEl.classList.toggle("cfp-flow-node--active", !st.status.isEnded); }
      });
    }
  }

  /**
   * Định dạng chuỗi ngày giờ theo múi giờ đang kích hoạt (AoE hoặc Thiết bị)
   */
  function formatDateWithTz(dateStr, tzConfig, fallbackText = "Chưa công bố") {
    if (!dateStr) return fallbackText;
    const ts = parseVietnamDate(dateStr);
    if (isNaN(ts)) return `${dateStr} (${tzConfig.stepperLabel})`;
    try {
      const formatted = new Intl.DateTimeFormat("vi-VN", {
        timeZone: tzConfig.iana,
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }).format(new Date(ts));
      return `${formatted} (${tzConfig.stepperLabel})`;
    } catch (e) {
      return `${dateStr} (${tzConfig.stepperLabel})`;
    }
  }

  /**
   * 6. Render danh sách hội nghị vào Dòng thời gian ziczac
   * CHỈ hiển thị các hội nghị còn hạn nộp bài, định dạng theo múi giờ đang chọn
   * Sắp xếp chính xác theo mốc deadline gần nhất của từng hội nghị
   * Hỗ trợ MỞ RỘNG (Expand/Collapse) xem trọn vẹn 3 mốc deadline CFP của riêng từng hội nghị
   */
  function renderTimelineList(conferences, expandedIds = new Set()) {
    const container = document.getElementById("timeline-events-container");
    if (!container) return;

    if (!conferences || conferences.length === 0) {
      container.innerHTML = `<p class="timeline-empty-message">Hiện không có hội nghị nào đang mở nhận bài.</p>`;
      return;
    }

    const tzConfig = getActiveTimezoneConfig();

    container.innerHTML = `<div class="timeline-wrapper">${conferences.map((item) => {
      const milestone = item.nearestMilestone || { label: "Hạn nộp", dateStr: item.deadline };
      const isNotifMilestone = milestone.type === "notification";
      const status = isNotifMilestone
        ? getNotificationStatus(milestone.dateStr)
        : getSmartStatus(milestone.dateStr, milestone.type);
      const milestonePrefix = isNotifMilestone ? "Ngày công bố kết quả" : "Hạn chót";

      const formattedDate = new Intl.DateTimeFormat("vi-VN", {
        timeZone: tzConfig.iana, day: "2-digit", month: "long", year: "numeric",
      }).format(new Date(item.targetTime));
      
      const rankBadge = item.rank
        ? `<span class="badge badge--rank">${item.rank}</span>`
        : "";

      const milestoneBadge = `<span class="badge badge--milestone">${milestone.label}</span>`;
      const isExpanded = expandedIds.has(String(item.id));

      // Trạng thái và ngày tháng 3 mốc deadline chi tiết (Phân biệt chuẩn ngữ nghĩa học thuật)
      const m1Date = item.abstractDeadline ? formatDateWithTz(item.abstractDeadline, tzConfig) : "Không có vòng nộp abstract";
      const m1Status = item.abstractDeadline ? getSmartStatus(item.abstractDeadline, "abstract") : { className: "badge--neutral", label: "Không có", isEnded: true };

      const m2Date = item.deadline ? formatDateWithTz(item.deadline, tzConfig) : "Chưa công bố";
      const m2Status = item.deadline ? getSmartStatus(item.deadline, "paper") : { className: "badge--ended", label: "Chưa công bố", isEnded: true };

      const m3Date = item.decisionDeadline ? formatDateWithTz(item.decisionDeadline, tzConfig) : "Chưa công bố";
      const m3Status = item.decisionDeadline ? getNotificationStatus(item.decisionDeadline) : { className: "badge--ended", label: "Chưa công bố", isEnded: true };

      return `
        <article class="timeline-item ${isExpanded ? "is-expanded" : ""}" id="conf-${item.id}" data-conf-id="${item.id}" data-status="${status.type}">
          <div class="timeline-dot" aria-hidden="true"></div>
          <div class="timeline-content">
            <div class="timeline-header">
              <time class="timeline-date" datetime="${milestone.dateStr}">
                ${CALENDAR_ICON_SVG}
                <span>${milestonePrefix} [${milestone.label}]: ${formattedDate} (${tzConfig.itemLabel})</span>
              </time>
              <div class="timeline-badges">
                ${rankBadge}
                ${milestoneBadge}
                <span class="badge ${status.className}">
                  <span class="status-dot" aria-hidden="true"></span>
                  ${status.label}
                </span>
              </div>
            </div>
            <h3 class="timeline-title">${item.name}</h3>
            <p class="timeline-desc">${item.fullName}</p>
            
            <div class="timeline-item-actions">
              <button type="button" class="timeline-expand-btn" data-conf-id="${item.id}" aria-expanded="${isExpanded}" aria-controls="drawer-${item.id}">
                <svg class="timeline-expand-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
                <span class="timeline-expand-label">${isExpanded ? "Thu gọn 3 mốc CFP &uarr;" : "Xem chi tiết 3 mốc CFP &darr;"}</span>
              </button>
            </div>

            <!-- Vùng mở rộng xem chi tiết 3 mốc deadline CFP của riêng hội nghị này -->
            <div class="timeline-milestones-drawer" id="drawer-${item.id}">
              <div class="timeline-milestones-grid">
                <div class="timeline-milestone-item ${m1Status.isEnded ? 'timeline-milestone--ended' : 'timeline-milestone--active'}">
                  <div class="timeline-milestone-head">
                    <span class="timeline-milestone-number">1</span>
                    <span class="timeline-milestone-name">Abstract Submission</span>
                    <span class="badge ${m1Status.className}">${m1Status.label}</span>
                  </div>
                  <div class="timeline-milestone-date">${m1Date}</div>
                  <p class="timeline-milestone-desc">${item.abstractDeadline ? 'Đăng ký tiêu đề, danh sách tác giả và tóm tắt bản thảo.' : 'Hội nghị không có vòng nộp abstract; nộp thẳng bản thảo toàn văn (Full Paper).'}</p>
                </div>

                <div class="timeline-milestone-item ${m2Status.isEnded ? 'timeline-milestone--ended' : 'timeline-milestone--active'}">
                  <div class="timeline-milestone-head">
                    <span class="timeline-milestone-number">2</span>
                    <span class="timeline-milestone-name">Full Paper Submission</span>
                    <span class="badge ${m2Status.className}">${m2Status.label}</span>
                  </div>
                  <div class="timeline-milestone-date">${m2Date}</div>
                  <p class="timeline-milestone-desc">Nộp toàn văn bản thảo nghiên cứu hoàn chỉnh (Double-blind review).</p>
                </div>

                <div class="timeline-milestone-item ${m3Status.isEnded ? 'timeline-milestone--ended' : 'timeline-milestone--active'}">
                  <div class="timeline-milestone-head">
                    <span class="timeline-milestone-number">3</span>
                    <span class="timeline-milestone-name">Notification</span>
                    <span class="badge ${m3Status.className}">${m3Status.label}</span>
                  </div>
                  <div class="timeline-milestone-date">${m3Date}</div>
                  <p class="timeline-milestone-desc">${item.decisionDeadline ? 'Hội đồng khoa học công bố kết quả chấp nhận bài báo và gửi phản biện.' : 'Hội đồng khoa học chưa công bố ngày thông báo kết quả.'}</p>
                </div>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join("")}</div>`;

    // Gán sự kiện click: Mở rộng / Thu gọn 3 mốc CFP ngay tại thẻ hội nghị đó
    container.onclick = (e) => {
      const expandBtn = e.target.closest(".timeline-expand-btn");
      const titleClick = e.target.closest(".timeline-title");
      if (!expandBtn && !titleClick) return;

      const article = (expandBtn || titleClick).closest(".timeline-item");
      if (!article) return;

      const isExpanded = article.classList.contains("is-expanded");
      article.classList.toggle("is-expanded", !isExpanded);

      const btn = article.querySelector(".timeline-expand-btn");
      if (btn) {
        btn.setAttribute("aria-expanded", String(!isExpanded));
        const labelEl = btn.querySelector(".timeline-expand-label");
        if (labelEl) {
          labelEl.textContent = !isExpanded ? "Thu gọn 3 mốc CFP \u2191" : "Xem chi tiết 3 mốc CFP \u2193";
        }
      }
    };
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
      if (currentPref !== "local" && currentPref !== "aoe") {
        currentPref = "local";
      }
    } catch (e) {}

    selectEl.value = currentPref;

    // Cập nhật nhãn option local hiển thị đúng tên múi giờ và offset máy tính
    const localOption = selectEl.querySelector('option[value="local"]');
    if (localOption) {
      const userLocalTz = getUserLocalTz();
      const localOffset = getLocalOffsetLabel(userLocalTz);
      const shortTzName = userLocalTz.split("/").pop().replace(/_/g, " ");
      localOption.textContent = `Múi giờ của thiết bị: ${shortTzName} (${localOffset}) - Tự động`;
    }

    selectEl.addEventListener("change", (e) => {
      const newPref = e.target.value;
      try {
        localStorage.setItem(TZ_STORAGE_KEY, newPref);
      } catch (err) {}

      // Banner & Stepper luôn luôn là hội nghị có deadline gần nhất toàn hệ thống
      if (activeFeaturedConference) {
        updateFeaturedDeadlineText(activeFeaturedConference);
        renderCFPStepper(activeFeaturedConference);
      }

      // Lưu lại danh sách các thẻ đang mở rộng để bảo toàn sau khi render lại
      const currentlyExpanded = new Set();
      document.querySelectorAll(".timeline-item.is-expanded").forEach((el) => {
        const id = el.getAttribute("data-conf-id");
        if (id) currentlyExpanded.add(id);
      });

      renderTimelineList(allConferences, currentlyExpanded);
    });
  }

  /**
   * Cuộn mượt và highlight thẻ hội nghị tương ứng khi điều hướng từ trang tra cứu (venues.html)
   */
  function highlightTargetConference(targetId) {
    if (!targetId) return;

    setTimeout(() => {
      const targetElement = (
        document.getElementById(`conf-${targetId}`) ||
        document.querySelector(`.timeline-item[data-conf-id="${targetId}"]`)
      );

      if (targetElement) {
        // Tự động mở rộng 3 mốc deadline của hội nghị mục tiêu
        targetElement.classList.add("is-expanded");
        const btn = targetElement.querySelector(".timeline-expand-btn");
        if (btn) {
          btn.setAttribute("aria-expanded", "true");
          const labelEl = btn.querySelector(".timeline-expand-label");
          if (labelEl) labelEl.textContent = "Thu gọn 3 mốc CFP \u2191";
        }

        // Cuộn mượt tới vị trí giữa màn hình
        targetElement.scrollIntoView({ behavior: "smooth", block: "center" });

        // Kích hoạt hiệu ứng nổi bật (pulse viền sáng)
        targetElement.classList.add("timeline-item--highlight");
        setTimeout(() => {
          targetElement.classList.remove("timeline-item--highlight");
        }, 3500);
      }
    }, 250);
  }

  /**
   * 7. Hàm chính: Tự động nạp dữ liệu hội nghị từ conf.json
   * - Banner đếm ngược và Stepper 3 mốc LUÔN LUÔN LÀ hội nghị có deadline gần nhất
   * - Từng thẻ hội nghị trong CFP có thể mở rộng xem 3 mốc
   * - Hỗ trợ liên kết trực tiếp từ trang Tra cứu sang thẻ tương ứng
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

      // BANNER & STEPPER TRÊN CÙNG: LUÔN LUÔN LÀ HỘI NGHỊ CÓ DEADLINE GẦN NHẤT
      if (allConferences.length > 0) {
        const nearestConference = allConferences[0];
        startFeaturedCountdown(nearestConference);
        renderCFPStepper(nearestConference);
      } else {
        const titleEl = document.getElementById("featured-countdown");
        if (titleEl) titleEl.textContent = "Hiện không có hội nghị nào đang mở nhận bài";
        const deadlineEl = document.querySelector(".countdown-featured-deadline");
        if (deadlineEl) deadlineEl.textContent = "Tất cả các đợt nộp bài trong năm đã kết thúc.";
      }

      renderTimelineList(allConferences);
      setupTimezoneSelector();

      // Kiểm tra xem có yêu cầu liên kết từ trang tra cứu (venues.html) sang không
      const urlParams = new URLSearchParams(window.location.search);
      let targetConfId = urlParams.get("id") || urlParams.get("conf");
      if (!targetConfId && window.location.hash) {
        targetConfId = window.location.hash.replace("#conf-", "").replace("#", "");
      }

      if (targetConfId) {
        highlightTargetConference(targetConfId);
      }

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
    getNotificationStatus,
    loadTimelineData,
    attachCountdown,
    initVenueCountdowns,
    getAllConferences: () => allConferences,
    getActiveTimezoneConfig,
    setupTimezoneSelector,
    getUserLocalTz,
    getLocalOffsetLabel,
  };

  // Kích hoạt an toàn khi DOM hoàn tất
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInitialize);
  } else {
    autoInitialize();
  }
})();