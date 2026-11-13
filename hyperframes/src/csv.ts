// RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  while (i < body.length) {
    const c = body[i]!;
    if (quoted) {
      if (c === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += c;
      }
      i += 1;
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (c === '\r' && body[i + 1] === '\n') i += 1;
    } else {
      field += c;
    }
    i += 1;
  }
  if (quoted) throw new Error('CSV: aspas sem fechamento');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Rows as records keyed by the header; a row with a different field count is an error. */
export function csvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  return rows
    .filter((r) => !(r.length === 1 && r[0] === ''))
    .map((r, n) => {
      if (r.length !== header.length) {
        throw new Error(`CSV: linha ${n + 2} tem ${r.length} campos, cabeçalho tem ${header.length}`);
      }
      return Object.fromEntries(header.map((h, k) => [h, r[k]!]));
    });
}
