import * as XLSX from 'xlsx';

function formatCellValue(val) {
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  return val;
}

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          reject(new Error('Excel file has no sheets'));
          return;
        }
        const ws = wb.Sheets[sheetName];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!raw.length) {
          reject(new Error('Excel file has no data rows'));
          return;
        }
        const rows = raw.map((row) => {
          const formatted = {};
          for (const [key, val] of Object.entries(row)) {
            formatted[key] = formatCellValue(val);
          }
          return formatted;
        });
        const headers = Object.keys(rows[0]);
        resolve({ headers, rows, sheetName });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function guessColumnMapping(headers, fields) {
  const mapping = {};
  const normalizedHeaders = headers.map((h) => ({
    original: h,
    norm: String(h).toLowerCase().replace(/[^a-z0-9]/g, ''),
  }));

  for (const field of fields) {
    const fieldNorm = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    const keyNorm = field.key.toLowerCase().replace(/[^a-z0-9]/g, '');

    const match = normalizedHeaders.find(
      (h) => h.norm === fieldNorm
        || h.norm === keyNorm
        || h.norm.includes(keyNorm)
        || keyNorm.includes(h.norm)
    );
    if (match) mapping[field.key] = match.original;
  }

  return mapping;
}
