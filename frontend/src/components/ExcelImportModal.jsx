import { useState, useEffect, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import { Modal } from './common';
import { parseExcelFile, guessColumnMapping } from '../utils/importExcel';
import { exportBlankTemplate } from '../utils/listExport';
import { getErrorMessage } from '../utils/helpers';
import { notifyStockUpdated } from '../utils/stockEvents';

export default function ExcelImportModal({
  isOpen,
  onClose,
  entityType,
  onSuccess,
  title,
}) {
  const [schema, setSchema] = useState(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [step, setStep] = useState('upload');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [autoCreateInvoice, setAutoCreateInvoice] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const reset = useCallback(() => {
    setStep('upload');
    setHeaders([]);
    setRows([]);
    setColumnMapping({});
    setAutoCreateInvoice(true);
    setResult(null);
  }, []);

  useEffect(() => {
    if (!isOpen || !entityType) return;
    reset();
    setLoadingSchema(true);
    api.get(`/import/schemas/${entityType}`)
      .then(({ data }) => {
        setSchema(data.data);
        setAutoCreateInvoice(!!data.data?.autoInvoice);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoadingSchema(false));
  }, [isOpen, entityType, reset]);

  const downloadTemplate = () => {
    if (!schema?.fields?.length) return;
    const columns = schema.fields.map((f) => f.label);
    exportBlankTemplate(columns, `${entityType}-import-template`);
    toast.success('Template downloaded');
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseExcelFile(file);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      if (schema?.fields) {
        setColumnMapping(guessColumnMapping(parsed.headers, schema.fields));
      }
      setStep('mapping');
    } catch (err) {
      toast.error(err.message || 'Failed to parse Excel file');
    }
    e.target.value = '';
  };

  const requiredMapped = schema?.fields
    ?.filter((f) => f.required)
    .every((f) => columnMapping[f.key]);

  const handleImport = async () => {
    if (!requiredMapped) {
      toast.error('Map all required fields before importing');
      return;
    }
    setImporting(true);
    try {
      const { data } = await api.post(`/import/${entityType}`, {
        rows,
        columnMapping,
        autoCreateInvoice: schema?.autoInvoice ? autoCreateInvoice : false,
      });
      setResult(data.data);
      setStep('result');
      if (data.data?.imported > 0) {
        notifyStockUpdated();
        onSuccess?.();
      }
      if (data.data?.failed === 0) {
        toast.success(`Imported ${data.data.imported} row(s) successfully`);
      } else {
        toast.error(`Imported ${data.data.imported}, ${data.data.failed} failed`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  const previewRows = rows.slice(0, 5);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); reset(); }}
      title={title || `Import ${schema?.label || 'Data'} from Excel`}
      wide
    >
      {loadingSchema ? (
        <LoadingSpinner className="py-8" />
      ) : (
        <div className="space-y-4">
          {step === 'upload' && (
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
              <FileSpreadsheet className="h-12 w-12 mx-auto text-primary-500 mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Upload an Excel file (.xlsx, .xls). The first sheet will be used.
                You can map columns to fields in the next step.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <label className="btn-primary inline-flex items-center gap-2 cursor-pointer">
                  <Upload className="h-4 w-4" />
                  Choose Excel File
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
                </label>
                {schema?.fields?.length > 0 && (
                  <button type="button" onClick={downloadTemplate} className="btn-secondary inline-flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Download Template
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'mapping' && schema && (
            <>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-sm">
                <strong>{rows.length}</strong> row(s) found.
                {schema.autoInvoice && (
                  <p className="text-gray-500 mt-1">
                    Sales and purchases will update stock/ledgers automatically.
                    Invoices can be created for each imported row.
                  </p>
                )}
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto">
                <p className="text-sm font-medium">Column mapping</p>
                {schema.fields.map((field) => (
                  <div key={field.key} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                    <span className="text-sm">
                      {field.label}
                      {field.required && <span className="text-red-500"> *</span>}
                    </span>
                    <select
                      value={columnMapping[field.key] || ''}
                      onChange={(e) => setColumnMapping((m) => ({
                        ...m,
                        [field.key]: e.target.value || undefined,
                      }))}
                      className="input-field text-sm"
                    >
                      <option value="">— Skip —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {schema.autoInvoice && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCreateInvoice}
                    onChange={(e) => setAutoCreateInvoice(e.target.checked)}
                  />
                  Auto-create invoices for imported sales/purchases
                </label>
              )}

              {previewRows.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Preview (first {previewRows.length} rows)</p>
                  <div className="table-container max-h-40 overflow-auto">
                    <table className="data-table text-xs">
                      <thead>
                        <tr>
                          {headers.map((h) => <th key={h}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i}>
                            {headers.map((h) => <td key={h}>{String(row[h] ?? '')}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setStep('upload')} className="btn-secondary flex-1">
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || !requiredMapped}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {importing ? 'Importing...' : `Import ${rows.length} Row(s)`}
                </button>
              </div>
            </>
          )}

          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg bg-green-50 dark:bg-green-900/20 p-4">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p><strong>{result.imported}</strong> row(s) imported successfully.</p>
                  {result.invoicesCreated > 0 && (
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      {result.invoicesCreated} invoice(s) created automatically.
                    </p>
                  )}
                </div>
              </div>

              {result.errors?.length > 0 && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <p className="text-sm font-medium">{result.failed} row(s) failed</p>
                  </div>
                  <ul className="text-xs space-y-1 max-h-40 overflow-y-auto text-red-700 dark:text-red-300">
                    {result.errors.map((err, i) => (
                      <li key={i}>Row {err.row}: {err.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button type="button" onClick={() => { onClose(); reset(); }} className="btn-primary w-full">
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
