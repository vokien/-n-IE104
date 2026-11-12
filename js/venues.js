import { loadVenues, nearestDeadline, safeUrl } from './modules/venue-data.js?v=20261017-sort2';
import { selectVenues, sortOptions, paginateVenues } from './filter.js';
import { isBookmarked } from './modules/storage.js';
import { updateTriggerButtons } from './modules/bookmark-modal.js';

const PAGE_SIZE = 10;
const number = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });

function renderDualVenueDeadline(deadline) {
  const container = element('div', undefined, 'venue-deadline');
  container.append(element('small', 'Hạn nộp toàn văn (Full Paper)'));

  const dualBox = element('div', undefined, 'venue-deadline-dual');

  let userLocalTz = 'Asia/Ho_Chi_Minh';
  if (window.CountdownService && typeof window.CountdownService.getUserLocalTz === 'function') {
    userLocalTz = window.CountdownService.getUserLocalTz();
  } else {
    try {
      userLocalTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
    } catch (e) {}
  }

  let localOffset = '';
  if (window.CountdownService && typeof window.CountdownService.getLocalOffsetLabel === 'function') {
    localOffset = window.CountdownService.getLocalOffsetLabel(userLocalTz);
  } else {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: userLocalTz, timeZoneName: 'short' }).formatToParts(new Date());
      const p = parts.find((x) => x.type === 'timeZoneName');
      localOffset = p ? p.value : '';
    } catch (e) {}
    if (!localOffset) {
      const offsetMin = -new Date().getTimezoneOffset();
      const sign = offsetMin >= 0 ? '+' : '-';
      const hours = Math.floor(Math.abs(offsetMin) / 60);
      localOffset = `UTC${sign}${hours}`;
    }
  }

  const dtOpts = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };

  let localText = '';
  let aoeText = '';

  if (deadline.dateOnly) {
    const formattedDate = deadline.raw.split('-').reverse().join('/');
    localText = formattedDate;
    aoeText = `${formattedDate} (AoE)`;
  } else {
    try {
      const localFormatted = new Intl.DateTimeFormat('vi-VN', { ...dtOpts, timeZone: userLocalTz }).format(deadline.value);
      localText = `${localFormatted} (${localOffset})`;
    } catch (e) {
      const localFormatted = new Intl.DateTimeFormat('vi-VN', { ...dtOpts, timeZone: 'Asia/Ho_Chi_Minh' }).format(deadline.value);
      localText = `${localFormatted} (GMT+7)`;
    }

    try {
      const aoeFormatted = new Intl.DateTimeFormat('vi-VN', { ...dtOpts, timeZone: 'Etc/GMT+12' }).format(deadline.value);
      aoeText = `${aoeFormatted} (AoE)`;
    } catch (e) {
      const aoeFormatted = new Intl.DateTimeFormat('vi-VN', { ...dtOpts, timeZone: 'UTC' }).format(deadline.value);
      aoeText = `${aoeFormatted} (AoE)`;
    }
  }

  // Dòng 1: Múi giờ thiết bị
  const localRow = element('div', undefined, 'venue-deadline-item');
  const localTag = element('span', 'Giờ thiết bị:', 'venue-deadline-tz');
  const localTime = element('time', localText, 'venue-deadline-time');
  localTime.dateTime = deadline.raw;
  localRow.append(localTag, localTime);

  // Dòng 2: Múi giờ hội nghị (AoE)
  const aoeRow = element('div', undefined, 'venue-deadline-item');
  const aoeTag = element('span', 'Giờ hội nghị:', 'venue-deadline-tz');
  const aoeTime = element('time', aoeText, 'venue-deadline-time');
  aoeTime.dateTime = deadline.raw;
  aoeRow.append(aoeTag, aoeTime);

  dualBox.append(localRow, aoeRow);
  container.append(dualBox);
  return container;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function makeCard(row) {
  const card = element('article', undefined, 'venue-entry');
  card.dataset.venueId = row.id;
  const header = element('header', undefined, 'venue-entry-header');
  header.append(element('p', row.kind === 'journal' ? 'Tạp chí' : 'Hội nghị', 'venue-kind'));
  const rank = row.kind === 'journal' ? row.scopus_rank : row.core_rank;
  const rankText = rank == null ? 'No Rank' : `Rank: ${rank}`;
  const badge = element('p', rankText, 'venue-rank');
  badge.dataset.rank = rank ?? 'unranked';
  header.append(badge);
  card.append(header, element('h3', row.acronym ? `${row.acronym} - ${row.name}` : row.name));
  if (row.publisher) card.append(element('p', row.publisher, 'venue-publisher'));
  const subjects = element('p', undefined, 'venue-subjects');
  const subjectLabel = row.kind === 'journal' ? 'Lĩnh vực của tạp chí: ' : 'Lĩnh vực của hội nghị: ';
  subjects.append(element('strong', subjectLabel), document.createTextNode(row.subject_area?.length ? row.subject_area.join(' / ') : 'Chưa có thông tin'));
  card.append(subjects);
  if (row.scope_keywords?.length) {
    const details = element('details');
    details.append(element('summary', `Chủ đề nghiên cứu (${row.scope_keywords.length})`));
    const list = element('ul', undefined, 'venue-topics');
    list.append(...row.scope_keywords.map((topic) => element('li', topic)));
    details.append(list);
    card.append(details);
  }
  const footer = element('footer', undefined, 'venue-entry-footer');
  const saved = isBookmarked(row.id);
  const bookmark = element('button', saved ? 'Đã lưu' : 'Lưu', 'directory-button bookmark-trigger-btn');
  bookmark.type = 'button';
  bookmark.dataset.id = row.id;
  bookmark.dataset.name = row.name;
  bookmark.dataset.acronym = row.acronym ?? '';
  bookmark.dataset.rank = rank ?? '';
  bookmark.classList.toggle('bookmarked', saved);
  bookmark.setAttribute('aria-pressed', String(saved));
  bookmark.setAttribute('aria-label', `Lưu ${row.acronym || row.name}`);
  let homepage = safeUrl(row.homepage_url);

  if (row.kind === 'journal') {
    const metrics = element('dl', undefined, 'venue-metrics');
    for (const [field, title, year] of [['citescore', 'CiteScore', row.citescore_year], ['sjr', 'SJR', row.sjr_year], ['h_index', 'H-index', null]]) {
      const group = element('div');
      group.append(element('dt', year ? `${title} (${year})` : title), element('dd', row[field] == null ? 'Chưa có' : number.format(row[field])));
      metrics.append(group);
    }
    footer.append(metrics);
  } else {
    const deadline = nearestDeadline(row);
    const block = element('div', undefined, 'venue-deadline-block');

    if (deadline) {
      const deadlineInfo = renderDualVenueDeadline(deadline);
      block.append(deadlineInfo);

      // Thẻ countdown box tích hợp cho Task 4.3
      const countdownBox = element('div', undefined, 'countdown-box');
      countdownBox.dataset.deadline = deadline.raw;
      countdownBox.dataset.venueId = row.id;
      block.append(countdownBox);

      homepage = safeUrl(deadline.timeline?.link) ?? homepage;
    } else {
      const blockEmpty = element('p', undefined, 'venue-deadline');
      blockEmpty.append(element('small', 'Chưa có hạn nộp bài'));
      block.append(blockEmpty);
    }
    footer.append(block);
  }

  // Nút liên kết trực tiếp sang thẻ tương ứng tại trang Tiến trình CFP (timeline.html)
  if (row.kind !== 'journal') {
    const cfpLink = element('a', 'Tiến trình CFP \u2192', 'directory-button directory-button--cfp');
    cfpLink.href = `timeline.html?id=${encodeURIComponent(row.id)}#conf-${encodeURIComponent(row.id)}`;
    cfpLink.setAttribute('aria-label', `Xem tiến trình 3 mốc deadline CFP của hội nghị ${row.acronym || row.name}`);
    footer.append(cfpLink);
  }

  if (homepage) {
    const link = element('a', 'Website chính thức', 'directory-button');
    link.href = homepage;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `Website ${row.acronym || row.name} (mở tab mới)`);
    footer.append(link);
  }

  footer.append(bookmark);
  card.append(footer);
  return card;
}

function getPaginationMode() {
  const w = window.innerWidth;
  if (w <= 540) return 'mobile';
  if (w <= 900) return 'tablet';
  return 'desktop';
}

function getPaginationItems(current, total, mode = 'desktop') {
  if (total <= 1) return [1];

  if (mode === 'mobile') {
    if (total <= 5) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 3) {
      const count = total >= 6 ? 3 : 2;
      return [...Array.from({ length: count }, (_, i) => i + 1), '...', total];
    }
    if (current >= total - 2) {
      const count = total >= 6 ? 3 : 2;
      const start = total - count + 1;
      return [1, '...', ...Array.from({ length: count }, (_, i) => start + i)];
    }
    return [1, '...', current, '...', total];
  }

  if (mode === 'tablet') {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 4) {
      return [...Array.from({ length: 4 }, (_, i) => i + 1), '...', total];
    }
    if (current >= total - 3) {
      return [1, '...', ...Array.from({ length: 4 }, (_, i) => total - 3 + i)];
    }
    return [1, '...', current - 1, current, current + 1, '...', total];
  }

  // Desktop mode:
  if (total <= 10) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 5) {
    const count = Math.min(total - 3, 10);
    const items = Array.from({ length: count }, (_, i) => i + 1);
    items.push('...');
    items.push(total - 1, total);
    return items;
  }
  if (current >= total - 4) {
    const count = Math.min(total - 3, 10);
    const items = [1, 2, '...'];
    for (let p = total - count + 3; p <= total; p++) {
      items.push(p);
    }
    return items;
  }
  return [1, 2, '...', current - 2, current - 1, current, current + 1, current + 2, '...', total - 1, total];
}

async function initDirectory() {
  const container = document.getElementById('venues-list-container');
  if (!container) return;
  const filterForm = document.getElementById('filter-form');
  const searchForm = document.getElementById('directory-search');
  const search = document.getElementById('search-input');
  const sort = document.getElementById('sort-select');
  const subject = document.getElementById('subject-filter');
  const count = document.getElementById('result-count');
  const status = document.getElementById('directory-status');
  const results = document.querySelector('.directory-results');
  const pagination = document.getElementById('directory-pagination');
  const paginationPages = document.getElementById('pagination-pages');
  const previous = document.getElementById('previous-page');
  const next = document.getElementById('next-page');
  let rows = [];
  let page = 1;
  let pages = 1;

  function renderPaginationButtons() {
    if (!paginationPages) return;
    paginationPages.replaceChildren();
    const mode = getPaginationMode();
    const items = getPaginationItems(page, pages, mode);
    for (const item of items) {
      if (item === '...') {
        const dots = element('span', '...', 'pagination-ellipsis');
        dots.setAttribute('aria-hidden', 'true');
        paginationPages.append(dots);
      } else {
        const btn = element('button', String(item), 'pagination-btn');
        btn.type = 'button';
        btn.setAttribute('aria-label', `Trang ${item}`);
        if (item === page) {
          btn.classList.add('active');
          btn.setAttribute('aria-current', 'page');
        } else {
          btn.addEventListener('click', () => {
            page = item;
            render(true);
          });
        }
        paginationPages.append(btn);
      }
    }
  }
  const compact = window.matchMedia('(max-width: 768px)');
  const panel = document.querySelector('.filter-panel');
  panel.open = !compact.matches;
  compact.addEventListener('change', (event) => { panel.open = !event.matches; });
  search.value = new URLSearchParams(location.search).get('q') ?? '';

  function render(moveFocus = false) {
    const data = new FormData(filterForm);
    const kind = data.get('kind');
    const options = sortOptions(kind);
    const selectedSort = options.some(([value]) => value === sort.value) ? sort.value : 'name';
    sort.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
    sort.value = selectedSort;
    document.getElementById('quartile-filter').hidden = kind === 'conference';
    document.getElementById('core-filter').hidden = kind === 'journal';

    const selected = selectVenues(rows, {
      query: search.value,
      kind,
      subject: subject.value,
      quartiles: data.getAll('quartile'),
      core: data.getAll('core'),
      sort: sort.value,
    });

    // Nếu có tham số ?id=... và tìm thấy trong kết quả, đưa venue mục tiêu lên đầu trang 1
    const currentTargetId = new URLSearchParams(location.search).get('id');
    if (currentTargetId && selected.length > 0) {
      const targetIdx = selected.findIndex(r => r.id === currentTargetId || (r.acronym && r.acronym.toLowerCase() === currentTargetId.toLowerCase()));
      if (targetIdx > 0) {
        const [targetItem] = selected.splice(targetIdx, 1);
        selected.unshift(targetItem);
      }
    }

    // DÙNG HÀM paginateVenues CỦA BẠN LÊN
    const paged = paginateVenues(selected, page, PAGE_SIZE);
    page = paged.page ?? page;
    pages = paged.totalPages ?? Math.max(1, Math.ceil(selected.length / PAGE_SIZE));
    const items = paged.items ?? selected.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const start = (page - 1) * PAGE_SIZE;

    container.replaceChildren(...items.map(makeCard));
    updateTriggerButtons();

    // Kích hoạt đồng hồ đếm ngược Task 4.3 cho các thẻ vừa render
    if (window.CountdownService && typeof window.CountdownService.initVenueCountdowns === 'function') {
      window.CountdownService.initVenueCountdowns('.countdown-box');
    }

    count.textContent = selected.length
      ? `${number.format(selected.length)} kết quả · Hiển thị ${number.format(start + 1)}-${number.format(Math.min(start + PAGE_SIZE, selected.length))}`
      : '0 kết quả';
    status.hidden = selected.length > 0;
    if (!selected.length) {
      status.replaceChildren(element('h3', 'Không tìm thấy kết quả'), element('p', 'Thử từ khóa khác hoặc bỏ bớt điều kiện lọc.'));
      const reset = element('button', 'Xóa bộ lọc', 'directory-button');
      reset.type = 'button';
      reset.addEventListener('click', () => filterForm.reset());
      status.append(reset);
    }
    pagination.hidden = selected.length === 0;
    previous.disabled = page === 1;
    next.disabled = page === pages;
    const pageLabel = document.getElementById('page-label');
    if (pageLabel) {
      pageLabel.textContent = `Trang ${number.format(page)} / ${number.format(pages)}`;
    }
    renderPaginationButtons();
    if (moveFocus) {
      const heading = document.getElementById('results-heading');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'center' });
    }
  }

  const update = () => { page = 1; render(); };
  searchForm.addEventListener('submit', (event) => { event.preventDefault(); update(); });
  filterForm.addEventListener('submit', (event) => event.preventDefault());
  filterForm.addEventListener('change', update);
  filterForm.addEventListener('reset', (event) => {
    event.preventDefault();
    filterForm.querySelectorAll('input').forEach((input) => { input.checked = input.defaultChecked; });
    subject.value = '';
    search.value = '';
    sort.value = 'name';
    update();
  });
  sort.addEventListener('change', update);

  // GÕ LÀ TỰ LỌC TỨC THÌ (THEO ĐÚNG Ý BẠN LÊN)
  search.addEventListener('input', update);
  search.addEventListener('search', update);

  previous.addEventListener('click', () => { page--; render(true); });
  next.addEventListener('click', () => { page++; render(true); });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (pagination && !pagination.hidden) {
        renderPaginationButtons();
      }
    }, 150);
  });

  async function load() {
    const controls = [...document.querySelectorAll('#filter-form input, #filter-form select, #filter-form button, #directory-search input, #directory-search button, #sort-select')];
    controls.forEach((control) => { control.disabled = true; });
    results.setAttribute('aria-busy', 'true');
    status.hidden = false;
    status.replaceChildren(element('p', 'Đang tải hội nghị và tạp chí khoa học…'));
    try {
      rows = await loadVenues((progressiveRows, meta) => {
        rows = progressiveRows;
        const currentSub = subject.value;
        const subjects = [...new Set(rows.flatMap((row) => row.subject_area ?? []))].sort((a, b) => a.localeCompare(b));
        subject.replaceChildren(new Option('Tất cả lĩnh vực', ''), ...subjects.map((value) => new Option(value, value)));
        if (subjects.includes(currentSub)) subject.value = currentSub;
        controls.forEach((control) => { control.disabled = false; });
        render();
        if (meta && !meta.isComplete) {
          status.hidden = false;
          status.replaceChildren(element('p', 'Đã tải 106 hội nghị · Đang đồng bộ danh mục tạp chí Scopus…'));
        }
      });
      const currentSub = subject.value;
      const subjects = [...new Set(rows.flatMap((row) => row.subject_area ?? []))].sort((a, b) => a.localeCompare(b));
      subject.replaceChildren(new Option('Tất cả lĩnh vực', ''), ...subjects.map((value) => new Option(value, value)));
      if (subjects.includes(currentSub)) subject.value = currentSub;
      controls.forEach((control) => { control.disabled = false; });
      render();
    } catch (error) {
      count.textContent = 'Chưa tải được dữ liệu hội nghị & tạp chí';
      status.replaceChildren(element('h3', 'Không tải được dữ liệu'), element('p', 'Kiểm tra kết nối rồi thử lại. Nếu đang mở file trực tiếp, hãy mở website qua máy chủ HTTP.'));
      const retry = element('button', 'Thử lại', 'directory-button primary');
      retry.type = 'button';
      retry.addEventListener('click', load);
      status.append(retry);
      console.error('[Directory]', error);
    } finally {
      results.setAttribute('aria-busy', 'false');
    }
  }

  function focusVenueById(targetId) {
    if (!targetId || !rows.length) return false;
    const cleanId = String(targetId).trim();
    const target = rows.find(r => r.id === cleanId || (r.acronym && r.acronym.toLowerCase() === cleanId.toLowerCase()));
    if (!target) return false;

    // Reset bộ lọc rank & subject
    filterForm.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    subject.value = '';

    // Chuyển loại hình tương ứng
    const kindRadio = filterForm.querySelector(`input[name="kind"][value="${target.kind}"]`);
    if (kindRadio) {
      kindRadio.checked = true;
    }

    // Đặt từ khóa tìm kiếm
    search.value = target.acronym || target.name;
    page = 1;
    render();

    // Cuộn mượt và highlight card
    requestAnimationFrame(() => {
      const card = container.querySelector(`[data-venue-id="${target.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('highlight-target');
        setTimeout(() => card.classList.remove('highlight-target'), 3500);
      }
    });

    return true;
  }

  // Đăng ký toàn cục để bookmark-modal có thể điều hướng trực tiếp khi ở venues.html
  window.focusVenueById = focusVenueById;

  await load();

  // Tự động cuộn đến venue mục tiêu nếu có tham số ?id= trên URL
  const initialTargetId = new URLSearchParams(location.search).get('id');
  if (initialTargetId) {
    focusVenueById(initialTargetId);
  }
}

initDirectory();