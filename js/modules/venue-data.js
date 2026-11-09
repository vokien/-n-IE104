export const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd');

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function deadlineValue(timeline) {
  const timestamp = timeline.deadline;
  if (timestamp && /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) {
    const value = Date.parse(timestamp);
    if (Number.isFinite(value)) return { value, raw: timestamp, dateOnly: false, timeline };
  }
  const day = timeline.deadline_dates?.deadline;
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { value: Date.parse(`${day}T23:59:59+07:00`), raw: day, dateOnly: true, timeline };
  }
  return null;
}

export function nearestDeadline(row, now = Date.now()) {
  const dates = (row.submission_deadlines ?? []).map(deadlineValue).filter(Boolean).sort((a, b) => a.value - b.value);
  const utcToday = Date.parse(new Date(now).toISOString().slice(0, 10));
  return dates.find(day => day.value >= (day.dateOnly ? utcToday : now)) ?? dates.at(-1) ?? null;
}

let memoryCache = null;

async function fetchJsonWithRetry(url, retries = 2, delayMs = 800) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 25000) : null;
      const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
      if (timeoutId) clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * Math.pow(1.5, attempt)));
    }
  }
}

export async function loadVenues(onProgress = null) {
  if (memoryCache && Array.isArray(memoryCache) && memoryCache.length) {
    if (typeof onProgress === 'function') onProgress(memoryCache, { isComplete: true, stage: 'cache' });
    return memoryCache;
  }

  // Chia tách tải dữ liệu theo 2 giai đoạn (Staged Loading):
  // Giai đoạn 1: conf.json nhẹ (~230KB) tải siêu tốc trong ~100ms để hiển thị ngay lập tức trên di động.
  // Giai đoạn 2: jour.json nặng (~8.8MB) tải song song ngầm và cập nhật liền mạch.
  const confUrl = new URL('../../data/conf.json', import.meta.url);
  const jourUrl = new URL('../../data/jour.json', import.meta.url);

  let confRows = [];
  try {
    const rawConf = await fetchJsonWithRetry(confUrl, 2, 600);
    if (Array.isArray(rawConf)) {
      confRows = rawConf.map(row => ({
        ...row,
        kind: 'conference',
        searchText: normalize([row.id, row.name, row.acronym, row.publisher, ...(row.subject_area ?? []), ...(row.scope_keywords ?? [])].join(' '))
      }));
      if (typeof onProgress === 'function' && confRows.length > 0) {
        onProgress(confRows, { isComplete: false, stage: 'conferences' });
      }
    }
  } catch (err) {
    console.warn('[venue-data] Không tải được conf.json ở giai đoạn 1, thử tiếp tục...', err);
  }

  let jourRows = [];
  try {
    const rawJour = await fetchJsonWithRetry(jourUrl, 2, 1000);
    if (Array.isArray(rawJour)) {
      jourRows = rawJour.map(row => ({
        ...row,
        kind: 'journal',
        searchText: normalize([row.id, row.name, row.acronym, row.publisher, ...(row.subject_area ?? []), ...(row.scope_keywords ?? [])].join(' '))
      }));
    }
  } catch (err) {
    console.warn('[venue-data] Lỗi tải jour.json...', err);
  }

  const combined = [...confRows, ...jourRows];
  if (!combined.length) {
    throw new Error('Không thể tải dữ liệu danh mục (conf.json hoặc jour.json).');
  }

  memoryCache = combined;
  if (typeof window !== 'undefined') {
    window.__IE104_VENUES_CACHE__ = combined;
  }

  if (typeof onProgress === 'function') {
    onProgress(combined, { isComplete: true, stage: 'all' });
  }

  return combined;
}
