import { loadVenues, selectVenues, nearestDeadline, safeUrl, sortOptions } from './modules/venue-data.js?v=20261017-sort2';

const PAGE_SIZE = 10;
const number = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });
const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });

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
  card.append(header, element('h3', row.acronym ? `${row.acronym} — ${row.name}` : row.name));
  if (row.publisher) card.append(element('p', row.publisher, 'venue-publisher'));
  const subjects = element('p', undefined, 'venue-subjects');
  const subjectLabel = row.kind === 'journal' ? 'Lĩnh vực của tạp chí: ' : 'Lĩnh vực của hội nghị: ';
  subjects.append(element('strong', subjectLabel), document.createTextNode(row.subject_area?.length ? row.subject_area.join(' / ') : 'Chưa có thông tin'));
  card.append(subjects);
  if (row.scope_keywords?.length) {
    const details = element('details');
    details.append(element('summary', `Chủ đề nghiên cứu (${row.scope_keywords.length})`));
    const list = element('ul', undefined, 'venue-topics');
    list.append(...row.scope_keywords.map(topic => element('li', topic)));
    details.append(list);
    card.append(details);
  }
  const footer = element('footer', undefined, 'venue-entry-footer');
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
    const block = element('p', undefined, 'venue-deadline');
    if (deadline) {
      const time = element('time', deadline.dateOnly ? deadline.raw.split('-').reverse().join('/') : `${dateFormat.format(deadline.value)} UTC`);
      time.dateTime = deadline.raw;
      block.append(element('small', 'Hạn nộp bài gần nhất'), time);
      if (deadline.dateOnly) block.append(element('small', 'Nguồn chỉ công bố ngày; chưa có giờ và múi giờ'));
      block.append(element('small', `${row.submission_deadlines.length} vòng có trong dữ liệu`));
      homepage = safeUrl(deadline.timeline.link) ?? homepage;
    } else block.append(element('small', 'Chưa có hạn nộp bài'));
    footer.append(block);
  }
  if (homepage) {
    const link = element('a', 'Website chính thức', 'directory-button');
    link.href = homepage;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `Website ${row.acronym || row.name} (mở tab mới)`);
    footer.append(link);
  }
  card.append(footer);
  return card;
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
  const previous = document.getElementById('previous-page');
  const next = document.getElementById('next-page');
  let rows = [];
  let page = 1;
  const compact = window.matchMedia('(max-width: 768px)');
  const panel = document.querySelector('.filter-panel');
  panel.open = !compact.matches;
  compact.addEventListener('change', event => { panel.open = !event.matches; });
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
    const selected = selectVenues(rows, { query: search.value, kind, subject: subject.value,
      quartiles: data.getAll('quartile'), core: data.getAll('core'), sort: sort.value });
    const pages = Math.max(1, Math.ceil(selected.length / PAGE_SIZE));
    page = Math.min(page, pages);
    const start = (page - 1) * PAGE_SIZE;
    container.replaceChildren(...selected.slice(start, start + PAGE_SIZE).map(makeCard));
    count.textContent = selected.length ? `${number.format(selected.length)} kết quả · Hiển thị ${number.format(start + 1)}–${number.format(Math.min(start + PAGE_SIZE, selected.length))}` : '0 kết quả';
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
    document.getElementById('page-label').textContent = `Trang ${number.format(page)} / ${number.format(pages)}`;
    if (moveFocus) {
      const heading = document.getElementById('results-heading');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'center' });
    }
  }
  const update = () => { page = 1; render(); };
  searchForm.addEventListener('submit', event => { event.preventDefault(); update(); });
  filterForm.addEventListener('submit', event => event.preventDefault());
  filterForm.addEventListener('change', update);
  filterForm.addEventListener('reset', event => {
    event.preventDefault();
    filterForm.querySelectorAll('input').forEach(input => { input.checked = input.defaultChecked; });
    subject.value = '';
    search.value = '';
    sort.value = 'name';
    update();
  });
  sort.addEventListener('change', update);
  search.addEventListener('search', update);
  previous.addEventListener('click', () => { page--; render(true); });
  next.addEventListener('click', () => { page++; render(true); });

  async function load() {
    const controls = [...document.querySelectorAll('#filter-form input, #filter-form select, #filter-form button, #directory-search input, #directory-search button, #sort-select')];
    controls.forEach(control => { control.disabled = true; });
    results.setAttribute('aria-busy', 'true');
    status.hidden = false;
    status.replaceChildren(element('p', 'Đang tải tạp chí và hội nghị…'));
    try {
      rows = await loadVenues();
      const subjects = [...new Set(rows.flatMap(row => row.subject_area ?? []))].sort((a, b) => a.localeCompare(b));
      subject.replaceChildren(new Option('Tất cả lĩnh vực', ''), ...subjects.map(value => new Option(value, value)));
      controls.forEach(control => { control.disabled = false; });
      render();
    } catch (error) {
      count.textContent = 'Chưa tải được danh bạ';
      status.replaceChildren(element('h3', 'Không tải được dữ liệu'), element('p', 'Kiểm tra kết nối rồi thử lại. Nếu đang mở file trực tiếp, hãy mở website qua máy chủ HTTP.'));
      const retry = element('button', 'Thử lại', 'directory-button primary');
      retry.type = 'button';
      retry.addEventListener('click', load);
      status.append(retry);
      console.error('[Directory]', error);
    } finally { results.setAttribute('aria-busy', 'false'); }
  }
  await load();
}

initDirectory();
