import toast from 'react-hot-toast';
import api from '../services/api';
import { exportToExcel } from './export';
import { getExportColumns } from './exportColumns';
import { getErrorMessage } from './helpers';

function stripEmptyParams(params = {}) {
  const cleaned = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === 'page' || key === 'limit') continue;
    if (value === '' || value === null || value === undefined) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

async function fetchAllRecords(endpoint, params) {
  const cleaned = stripEmptyParams(params);
  const records = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const { data: res } = await api.get(endpoint, {
      params: { ...cleaned, page, limit: 100 },
    });
    records.push(...(res.data || []));
    totalPages = res.pagination?.totalPages || 1;
    page += 1;
  }

  return records;
}

export function exportBlankTemplate(columns, filename) {
  if (!columns?.length) return false;
  const row = Object.fromEntries(columns.map((col) => [col, '']));
  exportToExcel([row], filename);
  return true;
}

export async function exportFilteredList(endpoint, params, mapRow, filename, { columns } = {}) {
  try {
    const records = await fetchAllRecords(endpoint, params);
    const rows = records.map(mapRow);
    const templateColumns = columns || getExportColumns(endpoint);

    if (!rows.length) {
      if (templateColumns && exportBlankTemplate(templateColumns, `${filename}-template`)) {
        toast.success('No records found — downloaded a blank Excel template instead');
        return;
      }
      toast.error('No records found for the current filters. Add data or use Import Excel.');
      return;
    }

    exportToExcel(rows, filename);
    toast.success(`Exported ${rows.length} row(s) to Excel`);
  } catch (err) {
    toast.error(getErrorMessage(err));
  }
}
