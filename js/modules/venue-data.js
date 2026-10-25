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
    return { value: Date.parse(`${day}T00:00:00Z`), raw: day, dateOnly: true, timeline };
  }
  return null;
}

export function nearestDeadline(row, now = Date.now()) {
  const dates = (row.submission_deadlines ?? []).map(deadlineValue).filter(Boolean).sort((a, b) => a.value - b.value);
  const utcToday = Date.parse(new Date(now).toISOString().slice(0, 10));
  return dates.find(day => day.value >= (day.dateOnly ? utcToday : now)) ?? dates.at(-1) ?? null;
}

export async function loadVenues() {
  const sources = [['jour.json', 'journal'], ['conf.json', 'conference']];
  const groups = await Promise.all(sources.map(async ([file, kind]) => {
    const response = await fetch(new URL(`../../data/${file}`, import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${file}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.some(row => !row.id || !row.name)) throw new Error(`Invalid directory: ${file}`);
    return rows.map(row => ({ ...row, kind,
      searchText: normalize([row.name, row.acronym, row.publisher, ...(row.subject_area ?? []), ...(row.scope_keywords ?? [])].join(' ')) }));
  }));
  return groups.flat();
}
