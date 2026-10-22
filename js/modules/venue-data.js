const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });
export const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd');

export function sortOptions(kind) {
  const options = [['name', 'Tên A–Z'], ['name_desc', 'Tên Z–A']];
  if (kind === 'journal') options.push(['citescore', 'CiteScore cao nhất'], ['sjr', 'SJR cao nhất'], ['h_index', 'H-index cao nhất']);
  if (kind === 'conference') options.push(['deadline', 'Hạn nộp bài gần nhất'], ['deadline_desc', 'Hạn nộp bài xa nhất']);
  return options;
}

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

export function selectVenues(rows, filters) {
  const terms = normalize(filters.query).trim().split(/\s+/).filter(Boolean);
  const sort = sortOptions(filters.kind).some(([value]) => value === filters.sort) ? filters.sort : 'name';
  const hasRankSelection = filters.quartiles.length > 0 || filters.core.length > 0;
  const filtered = rows.filter(row => {
    if (filters.kind !== 'all' && row.kind !== filters.kind) return false;
    if (!terms.every(term => row.searchText.includes(term))) return false;
    if (filters.subject && !(row.subject_area ?? []).includes(filters.subject)) return false;
    const ranks = row.kind === 'journal' ? filters.quartiles : filters.core;
    const rank = row.kind === 'journal' ? row.scopus_rank : row.core_rank ?? 'unranked';
    const filterRank = row.kind === 'conference' && !['A*', 'A', 'B', 'C', 'unranked'].includes(rank) ? 'other' : rank;
    if (filters.kind === 'all' && hasRankSelection) return ranks.includes(filterRank);
    return !ranks.length || ranks.includes(filterRank);
  });
  const now = Date.now();
  const deadlines = new Map();
  const upcoming = row => {
    if (!deadlines.has(row.id)) {
      const deadline = nearestDeadline(row, now);
      const floor = deadline?.dateOnly ? Date.parse(new Date(now).toISOString().slice(0, 10)) : now;
      deadlines.set(row.id, deadline && deadline.value >= floor ? deadline.value : Infinity);
    }
    return deadlines.get(row.id);
  };
  const metric = (row, field) => row.kind === 'journal' && Number.isFinite(row[field]) ? row[field] : -Infinity;
  return filtered.sort((a, b) => {
    let delta = 0;
    if (sort === 'deadline') delta = upcoming(a) - upcoming(b);
    if (sort === 'deadline_desc') {
      const first = upcoming(a);
      const second = upcoming(b);
      delta = first === Infinity ? (second === Infinity ? 0 : 1) : second === Infinity ? -1 : second - first;
    }
    if (['citescore', 'sjr', 'h_index'].includes(sort)) delta = metric(b, sort) - metric(a, sort);
    return (Number.isNaN(delta) ? 0 : delta) || collator.compare(a.name, b.name) * (sort === 'name_desc' ? -1 : 1);
  });
}
