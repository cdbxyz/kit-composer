'use strict';

const fs   = require('fs');
const Papa = require('papaparse');

async function parseRosterCSV(filePath) {
  let raw = fs.readFileSync(filePath, 'utf8');

  // Strip UTF-8 BOM if present (Excel-exported CSVs often include one)
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

  // ── Try with headers first ──────────────────────────────────────────
  const withHeader = Papa.parse(raw, {
    header:          true,
    skipEmptyLines:  true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const fields = withHeader.meta.fields || [];

  if (fields.includes('name') && fields.includes('number')) {
    return withHeader.data
      .map((row) => ({
        productId: String(row.productid || '').trim(),
        name:      String(row.name      || '').trim(),
        number:    String(row.number    || '').trim(),
      }))
      .filter((r) => r.name || r.number);
  }

  // ── No recognised headers — detect column layout by count ────────────
  // 3-column format: productId, name, number  (e.g. 000000001,PALMER,10)
  // 2-column format: name, number             (e.g. MAGUIRE,5)
  const noHeader = Papa.parse(raw, {
    header:         false,
    skipEmptyLines: true,
  });

  if (!noHeader.data.length) {
    throw new Error('CSV appears to be empty');
  }

  const firstRow = noHeader.data[0];
  if (!Array.isArray(firstRow) || firstRow.length < 2) {
    throw new Error('CSV must have at least two columns (name, number)');
  }

  const hasProductId = firstRow.length >= 3;

  return noHeader.data
    .map((row) => hasProductId
      ? {
          productId: String(row[0] || '').trim(),
          name:      String(row[1] || '').trim(),
          number:    String(row[2] || '').trim(),
        }
      : {
          productId: '',
          name:      String(row[0] || '').trim(),
          number:    String(row[1] || '').trim(),
        }
    )
    .filter((r) => r.name || r.number);
}

module.exports = { parseRosterCSV };
