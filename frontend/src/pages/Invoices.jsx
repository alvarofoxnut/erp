import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, FileText } from 'lucide-react';
import { useDataTable } from '../hooks/useDataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageHeader, SearchBar, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../components/common';
import { exportFilteredList } from '../utils/listExport';
import { formatDate, formatCurrency, formatNumber } from '../utils/helpers';
import { DeleteButton } from '../components/ConfirmDialog';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function Invoices() {
  const { type } = useParams();
  const invoiceTab = type === 'vendors' ? 'vendor' : 'customer';
  const isCustomer = invoiceTab === 'customer';

  const { data, pagination, loading, params, setPage, setSearch, updateParams, createItem, updateItem, deleteItem, fetchData } =
    useDataTable('/accounting/invoices', { initialParams: { invoiceType: invoiceTab }, notifyStock: false });

  const [modalOpen, setModalOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState(null);
  const [paymentModal, setPaymentModal] = useState(null);
  const [uninvoicedSales, setUninvoicedSales] = useState({ tradingSales: [], manufacturingSales: [] });
  const [uninvoicedPurchases, setUninvoicedPurchases] = useState({ tradingPurchases: [], rawPurchases: [] });
  const [loadingUninvoiced, setLoadingUninvoiced] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const loadUninvoicedSales = () => {
    setLoadingUninvoiced(true);
    api.get('/accounting/invoices/uninvoiced-sales')
      .then(({ data: res }) => setUninvoicedSales(res.data || { tradingSales: [], manufacturingSales: [] }))
      .catch(() => setUninvoicedSales({ tradingSales: [], manufacturingSales: [] }))
      .finally(() => setLoadingUninvoiced(false));
  };

  const loadUninvoicedPurchases = () => {
    setLoadingUninvoiced(true);
    api.get('/accounting/invoices/uninvoiced-purchases')
      .then(({ data: res }) => setUninvoicedPurchases(res.data || { tradingPurchases: [], rawPurchases: [] }))
      .catch(() => setUninvoicedPurchases({ tradingPurchases: [], rawPurchases: [] }))
      .finally(() => setLoadingUninvoiced(false));
  };

  useEffect(() => {
    updateParams({ invoiceType: invoiceTab, page: 1 });
    if (invoiceTab === 'customer') loadUninvoicedSales();
    else loadUninvoicedPurchases();
  }, [invoiceTab]);

  const openFromSale = (sale, type) => {
    setSelectedEntry({ ...sale, entryType: type, source: 'sale' });
    setModalOpen(true);
  };

  const openFromPurchase = (purchase, type) => {
    setSelectedEntry({ ...purchase, entryType: type, source: 'purchase' });
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditInvoice(null);
    setSelectedEntry(null);
    setModalOpen(true);
  };

  const openEdit = async (inv) => {
    try {
      const { data: res } = await api.get(`/accounting/invoices/${inv._id}`);
      setEditInvoice(res.data);
      setSelectedEntry(null);
      setModalOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load invoice');
    }
  };

  const buildInvoicePayload = (fd) => ({
    invoiceType: invoiceTab,
    date: fd.get('date'),
    partyName: fd.get('partyName'),
    reference: fd.get('reference'),
    amount: parseFloat(fd.get('amount')),
    paidAmount: parseFloat(fd.get('paidAmount') || 0),
    paymentMode: fd.get('paymentMode'),
    totalQuantity: parseFloat(fd.get('totalQuantity') || 0),
    contactDetails: { phone: fd.get('phone'), email: fd.get('email'), address: fd.get('address') },
    gstDetails: { gstRate: parseFloat(fd.get('gstRate') || 0), cgst: 0, sgst: 0, igst: 0 },
    items: [{
      description: fd.get('itemDescription') || 'Makhana',
      quantity: parseFloat(fd.get('totalQuantity') || 1),
      rate: parseFloat(fd.get('rate') || 0),
      amount: parseFloat(fd.get('amount')),
    }],
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = buildInvoicePayload(fd);

    if (editInvoice) {
      const ok = await updateItem(editInvoice._id, payload);
      if (ok) {
        setModalOpen(false);
        setEditInvoice(null);
      }
      return;
    }

    if (selectedEntry?.source === 'sale') {
      if (selectedEntry.entryType === 'trading') payload.tradingSale = selectedEntry._id;
      if (selectedEntry.entryType === 'manufacturing') payload.manufacturingSale = selectedEntry._id;
    } else if (selectedEntry?.source === 'purchase') {
      if (selectedEntry.entryType === 'trading') {
        payload.tradingPurchase = selectedEntry._id;
        payload.party = selectedEntry.party?._id || selectedEntry.party;
      }
      if (selectedEntry.entryType === 'manufacturing') payload.rawPurchase = selectedEntry._id;
    }

    const ok = await createItem(payload);
    if (ok) {
      setModalOpen(false);
      setSelectedEntry(null);
      setEditInvoice(null);
      if (isCustomer) loadUninvoicedSales();
      else loadUninvoicedPurchases();
      e.target.reset();
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    const paidAmount = parseFloat(new FormData(e.target).get('paidAmount'));
    try {
      await api.patch(`/accounting/invoices/${paymentModal._id}/payment`, { paidAmount });
      toast.success('Payment updated');
      setPaymentModal(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const handleExport = () => exportFilteredList(
    '/accounting/invoices',
    params,
    (inv) => ({
      Invoice: inv.invoiceNumber,
      Date: formatDate(inv.date),
      Party: inv.partyName,
      Quantity: inv.totalQuantity,
      Amount: inv.amount,
      Paid: inv.paidAmount,
      Due: inv.dueAmount,
      Status: inv.paymentStatus,
    }),
    isCustomer ? 'customer-invoices' : 'vendor-invoices'
  );

  const statusColor = { paid: 'bg-green-100 text-green-800', partial: 'bg-amber-100 text-amber-800', unpaid: 'bg-red-100 text-red-800' };

  const tradingSalesCount = uninvoicedSales.tradingSales?.length || 0;
  const manufacturingSalesCount = uninvoicedSales.manufacturingSales?.length || 0;
  const tradingPurchasesCount = uninvoicedPurchases.tradingPurchases?.length || 0;
  const rawPurchasesCount = uninvoicedPurchases.rawPurchases?.length || 0;

  const PendingSalesTable = ({ sales, type, emptyMessage }) => {
    if (!sales?.length) {
      return <p className="text-sm text-gray-500 py-2">{emptyMessage}</p>;
    }
    return (
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr><th>S.No</th><th>Date</th><th>Customer</th><th>Item / Product</th><th>Qty</th><th>Total Amount</th><th>Action</th></tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s._id}>
                <td className="font-mono">{s.serialNumber}</td>
                <td>{formatDate(s.date)}</td>
                <td>{s.customerName}</td>
                <td>{type === 'trading' ? s.item?.name : 'Finished Goods'}</td>
                <td>{formatNumber(s.quantity)}{type === 'manufacturing' ? ' KG' : ''}</td>
                <td>{formatCurrency(s.amount)}</td>
                <td>
                  <button onClick={() => openFromSale(s, type)} className="text-primary-600 text-sm hover:underline">
                    Create Invoice
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const PendingPurchasesTable = ({ purchases, type, emptyMessage }) => {
    if (!purchases?.length) {
      return <p className="text-sm text-gray-500 py-2">{emptyMessage}</p>;
    }
    return (
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr><th>S.No</th><th>Date</th><th>Vendor</th><th>Item / Lot</th><th>Qty</th><th>Total Amount</th><th>Action</th></tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p._id}>
                <td className="font-mono">{type === 'trading' ? p.serialNumber : p.lotNumber}</td>
                <td>{formatDate(p.date)}</td>
                <td>{type === 'trading' ? p.party?.name : p.vendor?.name}</td>
                <td>{type === 'trading' ? p.item?.name : `Raw Material (${p.lotNumber})`}</td>
                <td>{formatNumber(p.quantity)} KG</td>
                <td>{formatCurrency(type === 'trading' ? p.amount : p.totalAmount)}</td>
                <td>
                  <button onClick={() => openFromPurchase(p, type)} className="text-primary-600 text-sm hover:underline">
                    Create Invoice
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const entryDefaults = editInvoice
    ? {
        date: editInvoice.date ? new Date(editInvoice.date).toISOString().split('T')[0] : '',
        partyName: editInvoice.partyName,
        reference: editInvoice.reference || '',
        totalQuantity: editInvoice.totalQuantity,
        rate: editInvoice.items?.[0]?.rate ?? '',
        amount: editInvoice.amount,
        paidAmount: editInvoice.paidAmount,
        paymentMode: editInvoice.paymentMode || 'cash',
        phone: editInvoice.contactDetails?.phone || '',
        email: editInvoice.contactDetails?.email || '',
        address: editInvoice.contactDetails?.address || '',
        gstRate: editInvoice.gstDetails?.gstRate ?? 0,
        itemDescription: editInvoice.items?.[0]?.description || '',
      }
    : selectedEntry ? (
    selectedEntry.source === 'sale'
      ? {
          partyName: selectedEntry.customerName,
          reference: selectedEntry.serialNumber,
          totalQuantity: selectedEntry.quantity,
          rate: selectedEntry.rate,
          amount: selectedEntry.amount,
          phone: selectedEntry.customerPhone,
          email: selectedEntry.customerEmail,
          address: selectedEntry.customerAddress,
          itemDescription: selectedEntry.entryType === 'trading'
            ? selectedEntry.item?.name
            : 'Finished Goods (Makhana)',
        }
      : {
          partyName: selectedEntry.entryType === 'trading'
            ? selectedEntry.party?.name
            : selectedEntry.vendor?.name,
          reference: selectedEntry.entryType === 'trading'
            ? selectedEntry.serialNumber
            : selectedEntry.lotNumber,
          totalQuantity: selectedEntry.quantity,
          rate: selectedEntry.entryType === 'trading' ? selectedEntry.rate : selectedEntry.purchaseRate,
          amount: selectedEntry.entryType === 'trading' ? selectedEntry.amount : selectedEntry.totalAmount,
          phone: selectedEntry.entryType === 'trading'
            ? selectedEntry.party?.phone
            : selectedEntry.vendor?.phone,
          email: selectedEntry.entryType === 'trading'
            ? selectedEntry.party?.email
            : selectedEntry.vendor?.email,
          address: selectedEntry.entryType === 'trading'
            ? selectedEntry.party?.address
            : selectedEntry.vendor?.address,
          itemDescription: selectedEntry.entryType === 'trading'
            ? selectedEntry.item?.name
            : `Raw Material (Lot ${selectedEntry.lotNumber})`,
        }
  ) : {};

  const partyLabel = isCustomer ? 'Customer / Party Name' : 'Vendor / Party Name';

  return (
    <div>
      <PageHeader
        title={isCustomer ? 'Customer Invoices' : 'Vendor Invoices'}
        subtitle={isCustomer
          ? 'Create invoices from sales and track customer payments'
          : 'Create invoices from purchases and track vendor payments'}
        action={(
          <button
            onClick={openCreate}
            className="btn-primary flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" /> Create Invoice
          </button>
        )}
      />

      <div className="card mb-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {isCustomer ? 'Sales Pending Invoice' : 'Purchases Pending Invoice'}
        </h3>
        {loadingUninvoiced ? <LoadingSpinner className="py-6" /> : isCustomer ? (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">Trading</span>
                Pending ({tradingSalesCount})
              </h4>
              <PendingSalesTable
                sales={uninvoicedSales.tradingSales}
                type="trading"
                emptyMessage="No trading sales pending invoice."
              />
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800">Manufacturing</span>
                Pending ({manufacturingSalesCount})
              </h4>
              <PendingSalesTable
                sales={uninvoicedSales.manufacturingSales}
                type="manufacturing"
                emptyMessage="No manufacturing sales pending invoice."
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">Trading</span>
                Pending ({tradingPurchasesCount})
              </h4>
              <PendingPurchasesTable
                purchases={uninvoicedPurchases.tradingPurchases}
                type="trading"
                emptyMessage="No trading purchases pending invoice."
              />
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800">Manufacturing</span>
                Pending ({rawPurchasesCount})
              </h4>
              <PendingPurchasesTable
                purchases={uninvoicedPurchases.rawPurchases}
                type="manufacturing"
                emptyMessage="No manufacturing raw purchases pending invoice."
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <SearchBar
              value={params.search || ''}
              onChange={setSearch}
              placeholder={isCustomer ? 'Search invoice or customer...' : 'Search invoice or vendor...'}
            />
          </div>
          <select value={params.paymentStatus || ''} onChange={(e) => updateParams({ paymentStatus: e.target.value, page: 1 })} className="input-field w-auto">
            <option value="">All Status</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="unpaid">Unpaid</option>
          </select>
        </div>
        <ListPageToolbar
          showSearch={false}
          startDate={params.startDate || ''}
          endDate={params.endDate || ''}
          onStartChange={(v) => updateParams({ startDate: v, page: 1 })}
          onEndChange={(v) => updateParams({ endDate: v, page: 1 })}
          onExport={handleExport}
        />
      </div>

      {loading ? <LoadingSpinner className="py-12" /> : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Invoice</th><th>Date</th><th>Party</th><th>Qty</th><th>Total Amount</th><th>Paid</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {data.length === 0 ? <tr><td colSpan={9}><EmptyState /></td></tr> : data.map((inv) => (
                  <tr key={inv._id}>
                    <td className="font-mono">{inv.invoiceNumber}</td><td>{formatDate(inv.date)}</td><td>{inv.partyName}</td>
                    <td>{inv.totalQuantity}</td><td>{formatCurrency(inv.amount)}</td><td>{formatCurrency(inv.paidAmount)}</td><td>{formatCurrency(inv.dueAmount)}</td>
                    <td><span className={`px-2 py-1 text-xs rounded-full capitalize ${statusColor[inv.paymentStatus]}`}>{inv.paymentStatus}</span></td>
                    <td>
                      <div className="flex gap-3 items-center flex-wrap">
                        <button
                          type="button"
                          onClick={() => openEdit(inv)}
                          className="text-primary-600 text-sm hover:underline"
                        >
                          Edit
                        </button>
                        {inv.paymentStatus !== 'paid' && (
                          <button onClick={() => setPaymentModal(inv)} className="text-primary-600 text-sm hover:underline">Update Payment</button>
                        )}
                        <DeleteButton
                          onDelete={(reason) => deleteItem(inv._id, reason)}
                          title="Delete invoice"
                          message={`Are you sure you want to delete invoice ${inv.invoiceNumber}?`}
                          step2Message="This will remove the invoice from reports. This action cannot be undone."
                          className="text-red-600 text-sm font-medium hover:text-red-800"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedEntry(null); setEditInvoice(null); }}
        title={editInvoice
          ? `Edit Invoice ${editInvoice.invoiceNumber}`
          : selectedEntry
            ? `Invoice for ${selectedEntry.serialNumber || selectedEntry.lotNumber}`
            : `Create ${isCustomer ? 'Customer' : 'Vendor'} Invoice`}
      >
        <form onSubmit={handleSubmit} className="space-y-4" key={editInvoice?._id || selectedEntry?._id || invoiceTab}>
          <div className="form-grid-2">
            <div><FieldLabel required>Date</FieldLabel><input name="date" type="date" required defaultValue={entryDefaults.date || new Date().toISOString().split('T')[0]} className="input-field" /></div>
            <div><label className="block text-sm mb-1">Payment Mode</label><select name="paymentMode" defaultValue={entryDefaults.paymentMode || 'cash'} className="input-field"><option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI</option><option value="credit">Credit</option></select></div>
          </div>
          <div><FieldLabel required>{partyLabel}</FieldLabel><input name="partyName" required defaultValue={entryDefaults.partyName} className="input-field" /></div>
          <div><label className="block text-sm mb-1">{isCustomer ? 'Sale' : 'Purchase'} Reference</label><input name="reference" defaultValue={entryDefaults.reference} className="input-field" readOnly={!!selectedEntry && !editInvoice} /></div>
          <div><label className="block text-sm mb-1">Item Description</label><input name="itemDescription" defaultValue={entryDefaults.itemDescription} className="input-field" /></div>
          <div className="form-grid-3">
            <div><label className="block text-sm mb-1">Quantity</label><input name="totalQuantity" type="number" step="0.01" defaultValue={entryDefaults.totalQuantity} className="input-field" /></div>
            <div><label className="block text-sm mb-1">Rate (₹ per KG)</label><input name="rate" type="number" step="0.01" defaultValue={entryDefaults.rate} className="input-field" /></div>
            <div><FieldLabel required>Total Amount (₹)</FieldLabel><input name="amount" type="number" step="0.01" required defaultValue={entryDefaults.amount} className="input-field" /></div>
          </div>
          <div><label className="block text-sm mb-1">Paid Amount (₹)</label><input name="paidAmount" type="number" step="0.01" defaultValue={entryDefaults.paidAmount ?? 0} className="input-field" /></div>
          <div><label className="block text-sm mb-1">GST Rate (%)</label><input name="gstRate" type="number" step="0.01" defaultValue={entryDefaults.gstRate ?? 0} className="input-field" /></div>
          <div className="form-grid-2">
            <div><label className="block text-sm mb-1">Phone</label><input name="phone" defaultValue={entryDefaults.phone} className="input-field" /></div>
            <div><label className="block text-sm mb-1">Email</label><input name="email" type="email" defaultValue={entryDefaults.email} className="input-field" /></div>
          </div>
          <div><label className="block text-sm mb-1">Address</label><textarea name="address" defaultValue={entryDefaults.address} className="input-field" rows={2} /></div>
          <button type="submit" className="btn-primary w-full">{editInvoice ? 'Update Invoice' : 'Create Invoice'}</button>
        </form>
      </Modal>

      <Modal isOpen={!!paymentModal} onClose={() => setPaymentModal(null)} title="Update Payment">
        <form onSubmit={handlePayment} className="space-y-4">
          <p className="text-sm text-gray-500">Invoice: {paymentModal?.invoiceNumber} · Total: {formatCurrency(paymentModal?.amount)}</p>
          <div><FieldLabel required>Paid Amount (₹)</FieldLabel><input name="paidAmount" type="number" step="0.01" required defaultValue={paymentModal?.paidAmount} className="input-field" /></div>
          <button type="submit" className="btn-primary w-full">Update Payment</button>
        </form>
      </Modal>
    </div>
  );
}
