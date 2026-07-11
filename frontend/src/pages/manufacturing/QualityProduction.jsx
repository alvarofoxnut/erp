import { useState, useEffect, useMemo, useCallback } from 'react';

import { useLocation } from 'react-router-dom';

import { Plus } from 'lucide-react';

import api from '../../services/api';

import { useDataTable } from '../../hooks/useDataTable';

import LoadingSpinner from '../../components/LoadingSpinner';

import { EntryActions } from '../../components/ConfirmDialog';

import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';

import { formatDate, formatNumber, formatCurrency } from '../../utils/helpers';

import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';



const QUALITY_ROWS = [

  { label: '6 No', qtyKey: 'quantity6No', rateKey: 'rate6No' },

  { label: '5 No', qtyKey: 'quantity5No', rateKey: 'rate5No' },

  { label: '4.5 No', qtyKey: 'quantity4_5No', rateKey: 'rate4_5No' },

  { label: '4 No', qtyKey: 'quantity4No', rateKey: 'rate4No' },

  { label: 'Others', qtyKey: 'quantityOthers', rateKey: 'rateOthers' },

];



function QualityQtyRateRow({ label, qtyKey, rateKey, defaultQty = 0, defaultRate = 0 }) {

  const [qty, setQty] = useState(defaultQty);

  const [rate, setRate] = useState(defaultRate);



  useEffect(() => {

    setQty(defaultQty);

    setRate(defaultRate);

  }, [defaultQty, defaultRate]);



  const lineTotal = useMemo(() => {

    const q = parseFloat(qty);

    const r = parseFloat(rate);

    if (Number.isNaN(q) || Number.isNaN(r) || q <= 0 || r < 0) return null;

    return q * r;

  }, [qty, rate]);



  return (

    <div className="border border-gray-100 dark:border-gray-700 rounded-lg p-3 space-y-2">

      <p className="text-sm font-medium">{label}</p>

      <div className="grid grid-cols-2 gap-3">

        <div>

          <label className="block text-xs mb-1">Qty (KG)</label>

          <input

            name={qtyKey}

            type="number"

            step="0.01"

            min="0"

            value={qty}

            onChange={(e) => setQty(e.target.value)}

            className="input-field"

          />

        </div>

        <div>

          <label className="block text-xs mb-1">Price (₹/KG)</label>

          <input

            name={rateKey}

            type="number"

            step="0.01"

            min="0"

            value={rate}

            onChange={(e) => setRate(e.target.value)}

            className="input-field"

          />

        </div>

      </div>

      {lineTotal != null && (

        <p className="text-xs text-gray-500">Line value: {formatCurrency(lineTotal)}</p>

      )}

    </div>

  );

}



function formatQtyRate(qty, rate) {

  if (!qty) return '—';

  const qtyText = formatNumber(qty);

  if (!rate) return `${qtyText} KG`;

  return `${qtyText} KG @ ${formatCurrency(rate)}`;

}



export default function QualityProduction() {

  const location = useLocation();

  const {data, pagination, loading, params, setPage, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/manufacturing/quality-productions');
  const { onImport, importModalProps } = useExcelImport('quality-productions', fetchData);


  const [modalOpen, setModalOpen] = useState(false);

  const [editRow, setEditRow] = useState(null);

  const [wipLots, setWipLots] = useState([]);

  const [loadingWipLots, setLoadingWipLots] = useState(false);

  const [selectedLot, setSelectedLot] = useState('');



  const loadWipLots = useCallback(() => {

    setLoadingWipLots(true);

    api.get('/manufacturing/wip-lots')

      .then(({ data: res }) => setWipLots(res.data || []))

      .catch(() => setWipLots([]))

      .finally(() => setLoadingWipLots(false));

  }, []);



  useEffect(() => {

    loadWipLots();

  }, [loadWipLots]);



  useEffect(() => {

    if (modalOpen) loadWipLots();

  }, [modalOpen, loadWipLots]);



  const selectableLots = wipLots.filter((lot) => lot.lotNumber);

  const unassignedWip = wipLots.find((lot) => !lot.lotNumber);

  const lotOptions = useMemo(() => {
    const lots = [...selectableLots];
    if (editRow?.lotNumber && !lots.some((lot) => lot.lotNumber === editRow.lotNumber)) {
      lots.unshift({ lotNumber: editRow.lotNumber, availableQty: 0 });
    }
    return lots;
  }, [selectableLots, editRow]);



  const openCreate = () => {

    setEditRow(null);

    setSelectedLot('');

    setModalOpen(true);

  };



  const openEdit = (row) => {

    setEditRow(row);

    setSelectedLot(row.lotNumber || '');

    setModalOpen(true);

  };



  useEffect(() => {

    if (location.state?.editId && data.length) {

      const row = data.find((d) => d._id === location.state.editId);

      if (row) openEdit(row);

      window.history.replaceState({}, '');

    }

  }, [location.state, data]);



  const lotWip = selectableLots.find((lot) => lot.lotNumber === selectedLot)?.availableQty;

  const effectiveWip =

    editRow && editRow.lotNumber === selectedLot

      ? (lotWip ?? 0) + (editRow.totalOutput ?? 0)

      : lotWip;



  const handleSubmit = async (e) => {

    e.preventDefault();

    const fd = new FormData(e.target);

    const payload = {

      lotNumber: fd.get('lotNumber'),

      date: fd.get('date'),

      quantity6No: parseFloat(fd.get('quantity6No') || 0),

      quantity5No: parseFloat(fd.get('quantity5No') || 0),

      quantity4_5No: parseFloat(fd.get('quantity4_5No') || 0),

      quantity4No: parseFloat(fd.get('quantity4No') || 0),

      quantityOthers: parseFloat(fd.get('quantityOthers') || 0),

      rate6No: parseFloat(fd.get('rate6No') || 0),

      rate5No: parseFloat(fd.get('rate5No') || 0),

      rate4_5No: parseFloat(fd.get('rate4_5No') || 0),

      rate4No: parseFloat(fd.get('rate4No') || 0),

      rateOthers: parseFloat(fd.get('rateOthers') || 0),

    };

    const ok = editRow

      ? await updateItem(editRow._id, payload)

      : await createItem(payload, '/manufacturing/quality-productions');

    if (ok) {

      setModalOpen(false);

      setEditRow(null);

      setSelectedLot('');

      loadWipLots();

    }

  };



  const defaultDate = editRow?.date

    ? new Date(editRow.date).toISOString().split('T')[0]

    : new Date().toISOString().split('T')[0];



  const handleExport = () =>

    exportFilteredList(

      '/manufacturing/quality-productions',

      params,

      (r) => ({

        Date: formatDate(r.date),

        'Lot Number': r.lotNumber || '',

        '6 No Qty': r.quantity6No,

        '6 No Price': r.rate6No,

        '5 No Qty': r.quantity5No,

        '5 No Price': r.rate5No,

        '4.5 No Qty': r.quantity4_5No,

        '4.5 No Price': r.rate4_5No,

        '4 No Qty': r.quantity4No,

        '4 No Price': r.rate4No,

        'Others Qty': r.quantityOthers,

        'Others Price': r.rateOthers,

        Total: r.totalOutput,

      }),

      'quality-production'

    );



  return (

    <div>

      <PageHeader

        title="Quality Production Output"

        subtitle="Record quality-wise output from WIP stock by lot number"

        action={

          <button onClick={openCreate} className="btn-primary flex items-center gap-2">

            <Plus className="h-4 w-4" /> Add Output

          </button>

        }

      />



      {loadingWipLots ? (

        <LoadingSpinner className="py-6" />

      ) : (

        <div className="card mb-6">

          <h3 className="font-semibold mb-3">WIP Stock by Lot</h3>

          {selectableLots.length === 0 && !unassignedWip ? (

            <p className="text-sm text-gray-500">

              No WIP stock available. Send raw material to machine first.

            </p>

          ) : (

            <div className="table-container">

              <table className="data-table text-sm">

                <thead>

                  <tr>

                    <th>Lot Number</th>

                    <th className="text-right">WIP (KG)</th>

                  </tr>

                </thead>

                <tbody>

                  {selectableLots.map((lot) => (

                    <tr key={lot.lotNumber}>

                      <td className="font-mono">{lot.lotNumber}</td>

                      <td className="text-right font-medium">{formatNumber(lot.availableQty)}</td>

                    </tr>

                  ))}

                  {unassignedWip && (

                    <tr className="text-amber-700 dark:text-amber-400">

                      <td>{unassignedWip.label || 'Unassigned WIP'}</td>

                      <td className="text-right">{formatNumber(unassignedWip.availableQty)}</td>

                    </tr>

                  )}

                </tbody>

              </table>

            </div>

          )}

        </div>

      )}



      <ListPageToolbar

        showSearch={false}

        startDate={params.startDate || ''}

        endDate={params.endDate || ''}

        onStartChange={(v) => updateParams({ startDate: v, page: 1 })}

        onEndChange={(v) => updateParams({ endDate: v, page: 1 })}

        onExport={handleExport}
        onImport={onImport}

      />



      {loading ? (

        <LoadingSpinner className="py-12" />

      ) : (

        <>

          <div className="table-container">

            <table className="data-table">

              <thead>

                <tr>

                  <th>Date</th>

                  <th>Lot</th>

                  <th>6 No</th>

                  <th>5 No</th>

                  <th>4.5 No</th>

                  <th>4 No</th>

                  <th>Others</th>

                  <th>Total</th>

                  <th>Actions</th>

                </tr>

              </thead>

              <tbody>

                {data.length === 0 ? (

                  <tr>

                    <td colSpan={9}>

                      <EmptyState />

                    </td>

                  </tr>

                ) : (

                  data.map((r) => (

                    <tr key={r._id}>

                      <td>{formatDate(r.date)}</td>

                      <td className="font-mono">{r.lotNumber || '—'}</td>

                      <td className="text-sm">{formatQtyRate(r.quantity6No, r.rate6No)}</td>

                      <td className="text-sm">{formatQtyRate(r.quantity5No, r.rate5No)}</td>

                      <td className="text-sm">{formatQtyRate(r.quantity4_5No, r.rate4_5No)}</td>

                      <td className="text-sm">{formatQtyRate(r.quantity4No, r.rate4No)}</td>

                      <td className="text-sm">{formatQtyRate(r.quantityOthers, r.rateOthers)}</td>

                      <td className="font-semibold">{formatNumber(r.totalOutput)}</td>

                      <td>

                        <EntryActions

                          onEdit={() => openEdit(r)}

                          onDelete={(reason) => deleteItem(r._id, reason)}

                          deleteTitle="Delete quality output"

                          editTitle="Edit quality output"

                        />

                      </td>

                    </tr>

                  ))

                )}

              </tbody>

            </table>

          </div>

          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />

        </>

      )}



      <Modal

        isOpen={modalOpen}

        onClose={() => {

          setModalOpen(false);

          setEditRow(null);

          setSelectedLot('');

        }}

        title={editRow ? 'Edit Quality Output' : 'Quality Production Output'}

      >

        <form onSubmit={handleSubmit} className="space-y-4" key={editRow?._id || 'new'}>

          <div>

            <FieldLabel required>Lot Number</FieldLabel>

            <select

              name="lotNumber"

              required

              className="input-field"

              value={selectedLot}

              onChange={(e) => setSelectedLot(e.target.value)}

            >

              <option value="">Select lot with WIP stock</option>

              {lotOptions.map((lot) => (

                <option key={lot.lotNumber} value={lot.lotNumber}>

                  {lot.lotNumber} — {formatNumber(lot.availableQty)} KG WIP

                </option>

              ))}

            </select>

          </div>



          {selectedLot && effectiveWip != null && (

            <div className="rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 p-3 text-sm">

              <strong>WIP for lot {selectedLot}:</strong> {formatNumber(effectiveWip)} KG

              <p className="text-gray-500 mt-1">Total output cannot exceed this lot&apos;s WIP stock.</p>

            </div>

          )}



          <div>

            <FieldLabel required>Date</FieldLabel>

            <input name="date" type="date" required defaultValue={defaultDate} className="input-field" />

          </div>



          <div className="space-y-3">

            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">

              Quality output (quantity &amp; price per KG)

            </p>

            {QUALITY_ROWS.map((row) => (

              <QualityQtyRateRow

                key={row.qtyKey}

                label={row.label}

                qtyKey={row.qtyKey}

                rateKey={row.rateKey}

                defaultQty={editRow?.[row.qtyKey] ?? 0}

                defaultRate={editRow?.[row.rateKey] ?? 0}

              />

            ))}

          </div>



          <button type="submit" className="btn-primary w-full" disabled={!selectedLot}>

            {editRow ? 'Update' : 'Save'} Output

          </button>

        </form>

      </Modal>

      <ExcelImportModal {...importModalProps} />

    </div>

  );

}


