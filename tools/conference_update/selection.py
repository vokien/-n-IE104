from cleaning import missing

def filter_required(rows, required_fields=()):
    fields = list(dict.fromkeys(required_fields or ()))
    if not rows or any(field not in rows[0] for field in fields):
        raise ValueError('Unknown required field or empty input')
    retained, dropped = [], []
    for row in rows:
        absent = [field for field in fields if (
            not any(t.get('deadline') or t.get('deadline_dates', {}).get('deadline')
                    for t in (row[field] or []))
            if field == 'submission_deadlines' else missing(row[field]))]
        if absent:
            dropped.append({'id': row['id'], 'missing_fields': absent})
        else:
            retained.append(row)
    if not retained:
        raise ValueError('No venue remains after filtering; refuse to replace output')
    return retained, dropped

