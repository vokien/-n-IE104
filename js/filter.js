import { normalize, nearestDeadline } from './modules/venue-data.js';

const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });
export const PAGE_SIZE = 10;

export function sortOptions(kind) {
  const options = [['name', 'Tên A–Z'], ['name_desc', 'Tên Z–A']];
  if (kind === 'journal') options.push(['citescore', 'CiteScore cao nhất'], ['sjr', 'SJR cao nhất'], ['h_index', 'H-index cao nhất']);
  if (kind === 'conference') options.push(['deadline', 'Hạn nộp bài gần nhất'], ['deadline_desc', 'Hạn nộp bài xa nhất']);
  return options;
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

export function paginateVenues(rows, requestedPage = 1) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.trunc(Number(requestedPage)) || 1));
  const start = (page - 1) * PAGE_SIZE;
  return { items: rows.slice(start, start + PAGE_SIZE), page, pages, start, total: rows.length };
}
