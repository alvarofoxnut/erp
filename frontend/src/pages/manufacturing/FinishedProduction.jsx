import { useState, useEffect, useMemo, useCallback } from 'react';

import { useLocation } from 'react-router-dom';

import { Plus } from 'lucide-react';

import { useDataTable } from '../../hooks/useDataTable';

import LoadingSpinner from '../../components/LoadingSpinner';

import { EntryActions } from '../../components/ConfirmDialog';

import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';

import { formatDate, formatNumber, formatCurrency } from '../../utils/helpers';

import { exportFilteredList } from '../../utils/listExport';
import ExcelImportModal from '../../components/ExcelImportModal';
import { useExcelImport } from '../../hooks/useExcelImport';
import BrandedPackagingTab from './BrandedPackagingTab';

import api from '../../services/api';

import {

  calculateProportionateConsumption,

  calculateFinishedGoodsPrice,

  getEffectiveLotStock,

} from '../../utils/finishedProduction';



export default function FinishedProduction() {

  const location = useLocation();

  const {data, pagination, loading, params, setPage, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/manufacturing/finished-productions');
  const { onImport, importModalProps } = useExcelImport('finished-productions', fetchData);

  const [activeTab, setActiveTab] = useState('loose');

  const [modalOpen, setModalOpen] = useState(false);

  const [editRow, setEditRow] = useState(null);

  const [mode, setMode] = useState('proportionate');

  const [lotsQualityStock, setLotsQualityStock] = useState([]);

  const [loadingLots, setLoadingLots] = useState(false);

  const [selectedLot, setSelectedLot] = useState('');

  const [finishedQty, setFinishedQty] = useState('');

  const [manualConsumed, setManualConsumed] = useState({

    consumed6No: '',

    consumed5No: '',

    consumed4_5No: '',

    consumed4No: '',

    consumedOthers: '',

  });



  const loadLotsQualityStock = useCallback(() => {

    setLoadingLots(true);

    api.get('/manufacturing/lots-quality-stock')

      .then(({ data: res }) => setLotsQualityStock(res.data || []))

      .catch(() => setLotsQualityStock([]))

      .finally(() => setLoadingLots(false));

  }, []);



  useEffect(() => {

    loadLotsQualityStock();

  }, [loadLotsQualityStock]);



  useEffect(() => {

    if (modalOpen) loadLotsQualityStock();

  }, [modalOpen, loadLotsQualityStock]);



  const openCreate = () => {

    setEditRow(null);

    setMode('proportionate');

    setSelectedLot('');

    setFinishedQty('');

    setManualConsumed({ consumed6No: '', consumed5No: '', consumed4_5No: '', consumed4No: '', consumedOthers: '' });

    setModalOpen(true);

  };



  const openEdit = (row) => {

    setEditRow(row);

    setMode(row.productionMode);

    setSelectedLot(row.lotNumber || '');

    setFinishedQty(String(row.finishedQuantity ?? ''));

    setManualConsumed({

      consumed6No: row.consumed6No ?? '',

      consumed5No: row.consumed5No ?? '',

      consumed4_5No: row.consumed4_5No ?? '',

      consumed4No: row.consumed4No ?? '',

      consumedOthers: row.consumedOthers ?? '',

    });

    setModalOpen(true);

  };



  useEffect(() => {

    if (location.state?.editId && data.length) {

      const row = data.find((d) => d._id === location.state.editId);

      if (row) openEdit(row);

      window.history.replaceState({}, '');

    }

  }, [location.state, data]);



  const lotOptions = useMemo(() => {
    const lots = [...lotsQualityStock];
    if (editRow?.lotNumber && !lots.some((lot) => lot.lotNumber === editRow.lotNumber)) {
      lots.unshift({
        lotNumber: editRow.lotNumber,
        stock6No: 0,
        stock5No: 0,
        stock4_5No: 0,
        stock4No: 0,
        stockOthers: 0,
        rate6No: 0,
        rate5No: 0,
        rate4_5No: 0,
        rate4No: 0,
        rateOthers: 0,
        totalStock: 0,
      });
    }
    return lots;
  }, [lotsQualityStock, editRow]);

  const baseLotStock = lotOptions.find((lot) => lot.lotNumber === selectedLot);

  const effectiveLotStock = getEffectiveLotStock(baseLotStock, editRow);



  const resolvedConsumption = useMemo(() => {

    const qty = parseFloat(finishedQty);

    if (!effectiveLotStock || Number.isNaN(qty) || qty <= 0) {

      return { consumed6No: 0, consumed5No: 0, consumed4_5No: 0, consumed4No: 0, consumedOthers: 0 };

    }



    if (mode === 'proportionate') {

      return calculateProportionateConsumption(qty, effectiveLotStock);

    }



    return {

      consumed6No: parseFloat(manualConsumed.consumed6No) || 0,

      consumed5No: parseFloat(manualConsumed.consumed5No) || 0,

      consumed4_5No: parseFloat(manualConsumed.consumed4_5No) || 0,

      consumed4No: parseFloat(manualConsumed.consumed4No) || 0,

      consumedOthers: parseFloat(manualConsumed.consumedOthers) || 0,

    };

  }, [effectiveLotStock, finishedQty, mode, manualConsumed]);



  const pricePreview = useMemo(() => {

    const qty = parseFloat(finishedQty);

    if (!effectiveLotStock || Number.isNaN(qty) || qty <= 0) {

      return { finishedRate: 0, finishedValue: 0 };

    }

    return calculateFinishedGoodsPrice(resolvedConsumption, effectiveLotStock, qty);

  }, [effectiveLotStock, finishedQty, resolvedConsumption]);



  const handleSubmit = async (e) => {

    e.preventDefault();

    const fd = new FormData(e.target);

    const payload = {

      lotNumber: fd.get('lotNumber'),

      date: fd.get('date'),

      finishedQuantity: parseFloat(fd.get('finishedQuantity')),

      productionMode: fd.get('productionMode'),

    };

    if (payload.productionMode === 'manual') {

      payload.consumed6No = parseFloat(fd.get('consumed6No') || 0);

      payload.consumed5No = parseFloat(fd.get('consumed5No') || 0);

      payload.consumed4_5No = parseFloat(fd.get('consumed4_5No') || 0);

      payload.consumed4No = parseFloat(fd.get('consumed4No') || 0);

      payload.consumedOthers = parseFloat(fd.get('consumedOthers') || 0);

    }

    const ok = editRow

      ? await updateItem(editRow._id, payload)

      : await createItem(payload, '/manufacturing/finished-productions');

    if (ok) {

      setModalOpen(false);

      setEditRow(null);

      loadLotsQualityStock();

    }

  };



  const defaultDate = editRow?.date

    ? new Date(editRow.date).toISOString().split('T')[0]

    : new Date().toISOString().split('T')[0];



  const handleExport = () =>

    exportFilteredList(

      '/manufacturing/finished-productions',

      params,

      (r) => ({

        Date: formatDate(r.date),

        'Lot Number': r.lotNumber || '',

        'Finished Qty': r.finishedQuantity,

        Mode: r.productionMode,

        '6 No Used': r.consumed6No,

        '5 No Used': r.consumed5No,

        '4.5 No Used': r.consumed4_5No,

        '4 No Used': r.consumed4No,

        'Others Used': r.consumedOthers,

        'Finished Rate': r.finishedRate,

        'Finished Value': r.finishedValue,

      }),

      'finished-production'

    );



  return (

    <div>

      <PageHeader

        title="Finished Makhana Production"

        subtitle="Loose finished goods or branded packaging from lot-wise quality stock"

        action={activeTab === 'loose' ? (

          <button onClick={openCreate} className="btn-primary flex items-center gap-2">

            <Plus className="h-4 w-4" /> Add Production

          </button>

        ) : null}

      />

      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('loose')}
          className={activeTab === 'loose' ? 'btn-primary' : 'btn-secondary'}
        >
          Loose FG
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('branded')}
          className={activeTab === 'branded' ? 'btn-primary' : 'btn-secondary'}
        >
          Branded Packaging
        </button>
      </div>

      {activeTab === 'branded' ? (
        <BrandedPackagingTab lotsQualityStock={lotsQualityStock} onRefreshLots={loadLotsQualityStock} />
      ) : (
      <>

      {loadingLots ? (

        <LoadingSpinner className="py-6" />

      ) : (

        <div className="card mb-6">

          <h3 className="font-semibold mb-3">Quality Stock by Lot</h3>

          {lotsQualityStock.length === 0 ? (

            <p className="text-sm text-gray-500">

              No lot-wise quality stock available. Record quality production output first.

            </p>

          ) : (

            <div className="table-container">

              <table className="data-table text-sm">

                <thead>

                  <tr>

                    <th>Lot</th>

                    <th className="text-right">6 No (KG)</th>

                    <th className="text-right">6 No ₹/KG</th>

                    <th className="text-right">5 No (KG)</th>

                    <th className="text-right">5 No ₹/KG</th>

                    <th className="text-right">4.5 No (KG)</th>

                    <th className="text-right">4.5 No ₹/KG</th>

                    <th className="text-right">4 No (KG)</th>

                    <th className="text-right">4 No ₹/KG</th>

                    <th className="text-right">Others (KG)</th>

                    <th className="text-right">Others ₹/KG</th>

                    <th className="text-right">Total (KG)</th>

                  </tr>

                </thead>

                <tbody>

                  {lotsQualityStock.map((lot) => (

                    <tr key={lot.lotNumber}>

                      <td className="font-mono">{lot.lotNumber}</td>

                      <td className="text-right">{formatNumber(lot.stock6No)}</td>

                      <td className="text-right">{formatCurrency(lot.rate6No)}</td>

                      <td className="text-right">{formatNumber(lot.stock5No)}</td>

                      <td className="text-right">{formatCurrency(lot.rate5No)}</td>

                      <td className="text-right">{formatNumber(lot.stock4_5No)}</td>

                      <td className="text-right">{formatCurrency(lot.rate4_5No)}</td>

                      <td className="text-right">{formatNumber(lot.stock4No)}</td>

                      <td className="text-right">{formatCurrency(lot.rate4No)}</td>

                      <td className="text-right">{formatNumber(lot.stockOthers)}</td>

                      <td className="text-right">{formatCurrency(lot.rateOthers)}</td>

                      <td className="text-right font-medium">{formatNumber(lot.totalStock)}</td>

                    </tr>

                  ))}

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

                  <th>Batch</th>

                  <th>Lot</th>

                  <th>Finished Qty</th>

                  <th>Mode</th>

                  <th>6 No Used</th>

                  <th>5 No Used</th>

                  <th>4.5 No Used</th>

                  <th>4 No Used</th>

                  <th>Others Used</th>

                  <th>Price (₹/KG)</th>

                  <th>Total Value</th>

                  <th>Actions</th>

                </tr>

              </thead>

              <tbody>

                {data.length === 0 ? (

                  <tr>

                    <td colSpan={13}>

                      <EmptyState />

                    </td>

                  </tr>

                ) : (

                  data.map((r) => (

                    <tr key={r._id}>

                      <td>{formatDate(r.date)}</td>

                      <td className="font-mono text-xs">{r.batchNumber || '—'}</td>

                      <td className="font-mono">{r.lotNumber || '—'}</td>

                      <td>{formatNumber(r.finishedQuantity)}</td>

                      <td className="capitalize">{r.productionMode}</td>

                      <td>{formatNumber(r.consumed6No)}</td>

                      <td>{formatNumber(r.consumed5No)}</td>

                      <td>{formatNumber(r.consumed4_5No)}</td>

                      <td>{formatNumber(r.consumed4No)}</td>

                      <td>{formatNumber(r.consumedOthers)}</td>

                      <td>{formatCurrency(r.finishedRate)}</td>

                      <td>{formatCurrency(r.finishedValue)}</td>

                      <td>

                        <EntryActions

                          onEdit={() => openEdit(r)}

                          onDelete={(reason) => deleteItem(r._id, reason)}

                          deleteTitle="Delete finished production"

                          editTitle="Edit finished production"

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

        }}

        title={editRow ? 'Edit Finished Production' : 'Finished Production'}

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

              <option value="">Select lot with quality stock</option>

              {lotOptions.map((lot) => (

                <option key={lot.lotNumber} value={lot.lotNumber}>

                  {lot.lotNumber} — {formatNumber(lot.totalStock)} KG available

                </option>

              ))}

            </select>

          </div>



          {effectiveLotStock && (

            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 text-sm space-y-2">

              <p className="font-medium">Available quality stock for lot {selectedLot}</p>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">

                <div>

                  <span className="text-gray-500">6 No:</span>{' '}

                  <strong>{formatNumber(effectiveLotStock.stock6No)} KG</strong>

                  <br />

                  <span className="text-gray-500">@ {formatCurrency(effectiveLotStock.rate6No)}/KG</span>

                </div>

                <div>

                  <span className="text-gray-500">5 No:</span>{' '}

                  <strong>{formatNumber(effectiveLotStock.stock5No)} KG</strong>

                  <br />

                  <span className="text-gray-500">@ {formatCurrency(effectiveLotStock.rate5No)}/KG</span>

                </div>

                <div>

                  <span className="text-gray-500">4.5 No:</span>{' '}

                  <strong>{formatNumber(effectiveLotStock.stock4_5No)} KG</strong>

                  <br />

                  <span className="text-gray-500">@ {formatCurrency(effectiveLotStock.rate4_5No)}/KG</span>

                </div>

                <div>

                  <span className="text-gray-500">4 No:</span>{' '}

                  <strong>{formatNumber(effectiveLotStock.stock4No)} KG</strong>

                  <br />

                  <span className="text-gray-500">@ {formatCurrency(effectiveLotStock.rate4No)}/KG</span>

                </div>

                <div>

                  <span className="text-gray-500">Others:</span>{' '}

                  <strong>{formatNumber(effectiveLotStock.stockOthers)} KG</strong>

                  <br />

                  <span className="text-gray-500">@ {formatCurrency(effectiveLotStock.rateOthers)}/KG</span>

                </div>

              </div>

            </div>

          )}



          <div>

            <FieldLabel required>Date</FieldLabel>

            <input name="date" type="date" required defaultValue={defaultDate} className="input-field" />

          </div>



          <div>

            <FieldLabel required>Finished Quantity (KG)</FieldLabel>

            <input

              name="finishedQuantity"

              type="number"

              step="0.01"

              min="0.01"

              required

              value={finishedQty}

              onChange={(e) => setFinishedQty(e.target.value)}

              className="input-field"

            />

          </div>



          <div>

            <FieldLabel required>Production Mode</FieldLabel>

            <select

              name="productionMode"

              required

              className="input-field"

              value={mode}

              onChange={(e) => setMode(e.target.value)}

            >

              <option value="proportionate">Proportionate (Auto)</option>

              <option value="manual">Manual</option>

            </select>

          </div>



          {mode === 'proportionate' && effectiveLotStock && parseFloat(finishedQty) > 0 && (

            <div className="rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 p-3 text-sm">

              <p className="font-medium mb-1">Proportionate consumption preview</p>

              <p>

                6 No: {formatNumber(resolvedConsumption.consumed6No)} KG · 5 No:{' '}

                {formatNumber(resolvedConsumption.consumed5No)} KG · 4.5 No:{' '}

                {formatNumber(resolvedConsumption.consumed4_5No)} KG · 4 No:{' '}

                {formatNumber(resolvedConsumption.consumed4No)} KG · Others:{' '}

                {formatNumber(resolvedConsumption.consumedOthers)} KG

              </p>

            </div>

          )}



          {mode === 'manual' && (

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">

              <div>

                <label className="block text-sm mb-1">

                  6 No Used{' '}

                  <span className="text-gray-500">

                    (max {formatNumber(effectiveLotStock?.stock6No ?? 0)} KG)

                  </span>

                </label>

                <input

                  name="consumed6No"

                  type="number"

                  step="0.01"

                  min="0"

                  value={manualConsumed.consumed6No}

                  onChange={(e) =>

                    setManualConsumed((prev) => ({ ...prev, consumed6No: e.target.value }))

                  }

                  className="input-field"

                />

              </div>

              <div>

                <label className="block text-sm mb-1">

                  5 No Used{' '}

                  <span className="text-gray-500">

                    (max {formatNumber(effectiveLotStock?.stock5No ?? 0)} KG)

                  </span>

                </label>

                <input

                  name="consumed5No"

                  type="number"

                  step="0.01"

                  min="0"

                  value={manualConsumed.consumed5No}

                  onChange={(e) =>

                    setManualConsumed((prev) => ({ ...prev, consumed5No: e.target.value }))

                  }

                  className="input-field"

                />

              </div>

              <div>

                <label className="block text-sm mb-1">

                  4.5 No Used{' '}

                  <span className="text-gray-500">

                    (max {formatNumber(effectiveLotStock?.stock4_5No ?? 0)} KG)

                  </span>

                </label>

                <input

                  name="consumed4_5No"

                  type="number"

                  step="0.01"

                  min="0"

                  value={manualConsumed.consumed4_5No}

                  onChange={(e) =>

                    setManualConsumed((prev) => ({ ...prev, consumed4_5No: e.target.value }))

                  }

                  className="input-field"

                />

              </div>

              <div>

                <label className="block text-sm mb-1">

                  4 No Used{' '}

                  <span className="text-gray-500">

                    (max {formatNumber(effectiveLotStock?.stock4No ?? 0)} KG)

                  </span>

                </label>

                <input

                  name="consumed4No"

                  type="number"

                  step="0.01"

                  min="0"

                  value={manualConsumed.consumed4No}

                  onChange={(e) =>

                    setManualConsumed((prev) => ({ ...prev, consumed4No: e.target.value }))

                  }

                  className="input-field"

                />

              </div>

              <div>

                <label className="block text-sm mb-1">

                  Others Used{' '}

                  <span className="text-gray-500">

                    (max {formatNumber(effectiveLotStock?.stockOthers ?? 0)} KG)

                  </span>

                </label>

                <input

                  name="consumedOthers"

                  type="number"

                  step="0.01"

                  min="0"

                  value={manualConsumed.consumedOthers}

                  onChange={(e) =>

                    setManualConsumed((prev) => ({ ...prev, consumedOthers: e.target.value }))

                  }

                  className="input-field"

                />

              </div>

            </div>

          )}



          {pricePreview.finishedValue > 0 && (

            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm">

              <p>

                <strong>Finished goods price:</strong> {formatCurrency(pricePreview.finishedRate)} / KG

              </p>

              <p className="text-gray-600 dark:text-gray-400 mt-1">

                Total value: {formatCurrency(pricePreview.finishedValue)}

              </p>

            </div>

          )}



          <button type="submit" className="btn-primary w-full" disabled={!selectedLot}>

            {editRow ? 'Update' : 'Save'} Production

          </button>

        </form>

      </Modal>

      <ExcelImportModal {...importModalProps} />

      </>
      )}

    </div>

  );

}


