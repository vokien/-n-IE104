/**
 * ==========================================================
 * SCOPUSVENUE - COUNTDOWN & TIMELINE MODULE 
 * ==========================================================
 */

(function () {
  "use strict";

  // Hằng số thời gian
  const MS_SECOND = 1000;
  const MS_MINUTE = 60 * MS_SECOND;
  const MS_HOUR = 60 * MS_MINUTE;
  const MS_DAY = 24 * MS_HOUR;

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
   * 2. Phân loại trạng thái deadline thông minh
   */
  function getSmartStatus(dateString) {
    const targetTime = parseAoEDate(dateString);
    const remaining = targetTime - Date.now();
    const diffDays = Math.ceil(remaining / MS_DAY);

    if (isNaN(targetTime) || remaining <= 0) {
      return {
        type: "ended",
        label: "Đã kết thúc",
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
        label: `Sắp đến hạn (${diffDays} ngày)`,
        className: "badge--warning",
        diffDays: diffDays,
        isEnded: false,
      };
    }

    return {
      type: "open",
      label: "Đang mở nhận bài",
      className: "badge--open",
      diffDays: diffDays,
      isEnded: false,
    };
  }

  /**
   * 3. Trích xuất đợt nộp bài (edition) phù hợp nhất của 1 hội nghị
   */
  function extractActiveEdition(venue) {
    if (!venue.submission_deadlines || !Array.isArray(venue.submission_deadlines) || venue.submission_deadlines.length === 0) {
      return null;
    }

    const now = Date.now();

    // 1. Ưu tiên đợt nộp bài còn hạn trong tương lai (gần nhất lên trước)
    const upcoming = venue.submission_deadlines
      .filter((e) => e && e.deadline && parseAoEDate(e.deadline) > now)
      .sort((a, b) => parseAoEDate(a.deadline) - parseAoEDate(b.deadline));

    if (upcoming.length > 0) {
      return upcoming[0];
    }

    // 2. Nếu không có đợt tương lai, lấy đợt nộp bài mới nhất trong quá khứ
    const validPast = venue.submission_deadlines
      .filter((e) => e && e.deadline && !isNaN(parseAoEDate(e.deadline)))
      .sort((a, b) => parseAoEDate(b.deadline) - parseAoEDate(a.deadline));

    return validPast[0] || null;
  }

  /**
   * 4. Chuẩn hóa dữ liệu hội nghị (Tương thích cả venues.json lẫn conf.json)
   */
  function normalizeConference(item) {
    let deadlineStr = item.deadline || item.cfp_deadline || item.submission_deadline || "";
    let abstractDeadline = item.abstract_deadline || null;
    let decisionDeadline = item.decision_deadline || null;
    let yearStr = item.year ? ` ${item.year}` : "";
    let shortName = item.acronym ? `${item.acronym}${yearStr}` : (item.name || item.title || "Hội nghị");
    let fullName = item.name || item.title || item.full_name || shortName;

    // Nếu dữ liệu có mảng editions (venues.json)
    if (item.submission_deadlines && Array.isArray(item.submission_deadlines) && item.submission_deadlines.length > 0) {
      const edition = extractActiveEdition(item);
      if (!edition) return null;
      deadlineStr = edition.deadline;
      abstractDeadline = edition.abstract_deadline || null;
      decisionDeadline = edition.decision_deadline || null;
      yearStr = edition.year ? ` ${edition.year}` : "";
      shortName = item.acronym ? `${item.acronym}${yearStr}` : item.name;
      fullName = item.name;
    }

    if (!deadlineStr) return null;
    const targetTimestamp = parseAoEDate(deadlineStr);
    if (isNaN(targetTimestamp)) return null;

    let rankLabel = "";
    if (item.core_rank) rankLabel = `CORE ${item.core_rank}`;
    else if (item.scopus_rank) rankLabel = `Scopus ${item.scopus_rank}`;
    else if (item.rank) rankLabel = item.rank;

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
   * 5. Khởi động đồng hồ đếm ngược nổi bật (Featured Banner)
   */
  function startFeaturedCountdown(conference) {
    if (!conference) return;

    const daysEl = document.getElementById("days");
    const hoursEl = document.getElementById("hours");
    const minutesEl = document.getElementById("minutes");
    const secondsEl = document.getElementById("seconds");
    const titleEl = document.getElementById("featured-countdown");
    const deadlineEl = document.querySelector(".countdown-featured-deadline");

    if (titleEl) {
      titleEl.textContent = `${conference.name} — Full Paper Submission`;
    }

    if (deadlineEl && conference.deadline) {
      const formatted = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Etc/GMT+12",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(new Date(conference.targetTime));

      deadlineEl.innerHTML = `Hạn nộp: <time datetime="${conference.deadline}">${formatted} (Múi giờ AoE - 23:59:59 UTC-12)</time>`;
    }

    if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

    if (bannerTimerInterval) {
      clearInterval(bannerTimerInterval);
      bannerTimerInterval = null;
    }

    function render(d, h, m, s) {
      daysEl.textContent = String(d).padStart(2, "0");
      hoursEl.textContent = String(h).padStart(2, "0");
      minutesEl.textContent = String(m).padStart(2, "0");
      secondsEl.textContent = String(s).padStart(2, "0");
    }

    function update() {
      const distance = conference.targetTime - Date.now();

      if (distance <= 0) {
        render(0, 0, 0, 0);
        if (bannerTimerInterval) {
          clearInterval(bannerTimerInterval);
          bannerTimerInterval = null;
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
      bannerTimerInterval = setInterval(update, 1000);
    }
  }

  /**
   * 6. Render danh sách hội nghị vào Dòng thời gian ziczac
   */
  function renderTimelineList(conferences) {
    const container = document.getElementById("timeline-events-container");
    if (!container) return;

    if (!conferences || conferences.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:var(--color-text-muted); padding:2rem;">Không tìm thấy hội nghị phù hợp.</p>`;
      return;
    }

    // Hiển thị danh sách hội nghị
    const itemsHtml = conferences
      .map((item) => {
        const status = getSmartStatus(item.deadline);
        const formattedDate = new Intl.DateTimeFormat("vi-VN", {
          timeZone: "Etc/GMT+12",
          day: "2-digit",
          month: "long",
          year: "numeric",
        }).format(new Date(item.targetTime));

        const rankBadge = item.rank ? `<span class="badge" style="background:#e0f2fe; color:#0369a1; margin-left:6px;">${item.rank}</span>` : "";

        return `
          <article class="timeline-item" data-status="${status.type}">
            <div class="timeline-dot" aria-hidden="true"></div>
            <div class="timeline-content">
              <div class="timeline-header">
                <time class="timeline-date" datetime="${item.deadline}">
                  ${CALENDAR_ICON_SVG}
                  <span>${formattedDate} (AoE)</span>
                </time>
                <div>
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
      })
      .join("");

    container.innerHTML = `
      <div class="timeline-wrapper">
        ${itemsHtml}
      </div>
    `;
  }

  /**
   * 7. Hàm chính: Tự động nạp dữ liệu (Ưu tiên conf.json, dự phòng venues.json)
   */
  async function loadTimelineData() {
    try {
           // Gọi trực tiếp venues.json (không bị dòng đỏ 404)
      const response = await fetch("./data/venues.json");

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Không tìm thấy file dữ liệu`);
      }

      const rawData = await response.json();
      const list = Array.isArray(rawData) ? rawData : (rawData.conferences || rawData.venues || rawData.data || []);

      // Chuẩn hóa và lọc hội nghị có deadline
      allConferences = list
        .map(normalizeConference)
        .filter((c) => c !== null);

      // Sắp xếp: Hội nghị còn hạn nộp (tương lai) lên trước, hội nghị đã qua hạn xếp sau
      const now = Date.now();
      allConferences.sort((a, b) => {
        const aUpcoming = a.targetTime > now;
        const bUpcoming = b.targetTime > now;
        if (aUpcoming && !bUpcoming) return -1;
        if (!aUpcoming && bUpcoming) return 1;
        return a.targetTime - b.targetTime;
      });

      console.log(`✅ [ScopusVenue] Đã nạp thành công ${allConferences.length} hội nghị có deadline!`);

      // Tự động tìm deadline gần nhất đưa lên Banner
      const upcomingConfs = allConferences.filter((c) => c.targetTime > now);
      const nearest = upcomingConfs.length > 0 ? upcomingConfs[0] : allConferences[0];

      if (nearest) {
        console.log(`🎯 [ScopusVenue] Hội nghị có deadline gần nhất: ${nearest.name} (${nearest.deadline})`);
        startFeaturedCountdown(nearest);
      }

      // Render danh sách hội nghị ra dòng thời gian
      renderTimelineList(allConferences);

    } catch (error) {
      console.error("❌ Lỗi khi tải dữ liệu hội nghị:", error);
    }
  }

  // Đóng gói dịch vụ dùng chung cho trang venues.html (Task 4.3)
  window.CountdownService = {
    parseAoEDate,
    getSmartStatus,
    loadTimelineData,
    getAllConferences: () => allConferences,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadTimelineData);
  } else {
    loadTimelineData();
  }
})();