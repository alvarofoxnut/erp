import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { DeleteButton } from '../../components/ConfirmDialog';
import { useDataTable } from '../../hooks/useDataTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { PageHeader, Pagination, ListPageToolbar, Modal, EmptyState, FieldLabel } from '../../components/common';
import { exportFilteredList } from '../../utils/listExport';
import { qualityPerPacketGrams, gradeGramsPerPacket, gradeGramsToFormValues } from '../../utils/brandedPackaging';

const round2 = (n) => Math.round((n || 0) * 100) / 100;

export default function Brands() {
  const { data, pagination, loading, params, setPage, setSearch, createItem, updateItem, deleteItem } =
    useDataTable('/manufacturing/brands', { notifyStock: false });

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({
    name: '',
    packetSizeGrams: '',
    packingWeightGrams: '',
    packagingPrice: '',
    proportion6No: '',
    proportion5No: '',
    proportion4_5No: '',
    proportion4No: '',
    proportionOthers: '',
  });

  const derivedQuality = useMemo(() => {
    const packetSize = parseFloat(form.packetSizeGrams);
    const packingWeight = parseFloat(form.packingWeightGrams || 0);
    if (!packetSize || Number.isNaN(packetSize)) return null;
    const quality = round2(packetSize - (Number.isNaN(packingWeight) ? 0 : packingWeight));
    if (quality <= 0) return null;
    return {
      qualityGrams: quality,
      qualityPercent: round2((quality / packetSize) * 100),
      packingPercent: round2((packingWeight / packetSize) * 100),
    };
  }, [form.packetSizeGrams, form.packingWeightGrams]);

  const totalGradeGrams = useMemo(() => {
    return round2(
      Number(form.proportion6No || 0) +
      Number(form.proportion5No || 0) +
      Number(form.proportion4_5No || 0) +
      Number(form.proportion4No || 0) +
      Number(form.proportionOthers || 0)
    );
  }, [form]);

  const proportionsValid =
    derivedQuality != null && Math.abs(totalGradeGrams - derivedQuality.qualityGrams) <= 0.01;

  const packingWeightValid =
    !form.packetSizeGrams ||
    !form.packingWeightGrams ||
    parseFloat(form.packingWeightGrams) < parseFloat(form.packetSizeGrams);

  const emptyForm = () => ({
    name: '',
    packetSizeGrams: '',
    packingWeightGrams: '',
    packagingPrice: '',
    proportion6No: '',
    proportion5No: '',
    proportion4_5No: '',
    proportion4No: '',
    proportionOthers: '',
  });

  const openCreate = () => {
    setEditItem(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    const grams = gradeGramsToFormValues(item);
    setForm({
      name: item.name || '',
      packetSizeGrams: item.packetSizeGrams ?? '',
      packingWeightGrams: item.packingWeightGrams ?? '',
      packagingPrice: item.packagingPrice ?? '',
      proportion6No: grams.proportion6No ?? '',
      proportion5No: grams.proportion5No ?? '',
      proportion4_5No: grams.proportion4_5No ?? '',
      proportion4No: grams.proportion4No ?? '',
      proportionOthers: grams.proportionOthers ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!proportionsValid || !packingWeightValid || !derivedQuality) return;
    const payload = {
      name: form.name.trim(),
      packetSizeGrams: parseFloat(form.packetSizeGrams),
      packingWeightGrams: parseFloat(form.packingWeightGrams || 0),
      packagingPrice: parseFloat(form.packagingPrice || 0),
      proportion6No: parseFloat(form.proportion6No || 0),
      proportion5No: parseFloat(form.proportion5No || 0),
      proportion4_5No: parseFloat(form.proportion4_5No || 0),
      proportion4No: parseFloat(form.proportion4No || 0),
      proportionOthers: parseFloat(form.proportionOthers || 0),
    };
    const ok = editItem
      ? await updateItem(editItem._id || editItem.id, payload)
      : await createItem(payload);
    if (ok) {
      setModalOpen(false);
      setEditItem(null);
    }
  };

  const handleExport = () => exportFilteredList(
    '/manufacturing/brands',
    params,
    (b) => {
      const g = gradeGramsPerPacket(b);
      return {
        Name: b.name,
        'Packet Size (gm)': b.packetSizeGrams,
        'Packing Weight (gm)': b.packingWeightGrams,
        'Quality per Packet (gm)': qualityPerPacketGrams(b),
        'Packaging Price (₹)': b.packagingPrice,
        '6 No (gm)': g.grams6No,
        '5 No (gm)': g.grams5No,
        '4.5 No (gm)': g.grams4_5No,
        '4 No (gm)': g.grams4No,
        'Others (gm)': g.gramsOthers,
      };
    },
    'brands'
  );

  return (
    <div>
      <PageHeader
        title="Brand Master"
        subtitle="Define packet size, packing weight, and grade weights (gm) that sum to quality per packet"
        action={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Brand
          </button>
        }
      />

      <ListPageToolbar
        search={params.search || ''}
        onSearchChange={setSearch}
        searchPlaceholder="Search brands..."
        onExport={handleExport}
      />

      {loading ? <LoadingSpinner className="py-12" /> : (
        <>
          {data.length === 0 ? (
            <EmptyState message="No brands yet" />
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Brand Name</th>
                    <th>Packet Size</th>
                    <th>Packing</th>
                    <th>Quality/Pkt</th>
                    <th>Pack Price</th>
                    <th>6 No</th>
                    <th>5 No</th>
                    <th>4.5 No</th>
                    <th>4 No</th>
                    <th>Others</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((b) => {
                    const g = gradeGramsPerPacket(b);
                    return (
                      <tr key={b._id || b.id}>
                        <td className="font-medium">{b.name}</td>
                        <td>{b.packetSizeGrams} gm</td>
                        <td>{b.packingWeightGrams ?? 0} gm</td>
                        <td>{qualityPerPacketGrams(b)} gm</td>
                        <td>₹{b.packagingPrice ?? 0}</td>
                        <td>{g.grams6No} gm</td>
                        <td>{g.grams5No} gm</td>
                        <td>{g.grams4_5No} gm</td>
                        <td>{g.grams4No} gm</td>
                        <td>{g.gramsOthers} gm</td>
                        <td className="text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => openEdit(b)} className="btn-secondary p-2" title="Edit">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <DeleteButton onConfirm={() => deleteItem(b._id || b.id)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Brand' : 'Add Brand'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel required>Brand Name</FieldLabel>
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Packet Size (grams)</FieldLabel>
              <input
                type="number"
                step="any"
                min="0.01"
                className="input-field"
                placeholder="e.g. 250"
                value={form.packetSizeGrams}
                onChange={(e) => setForm((f) => ({ ...f, packetSizeGrams: e.target.value }))}
                required
              />
              <p className="text-xs text-gray-500 mt-1">Total gross packet weight</p>
            </div>
            <div>
              <FieldLabel required>Packing Weight (grams)</FieldLabel>
              <input
                type="number"
                step="any"
                min="0"
                className="input-field"
                placeholder="e.g. 20"
                value={form.packingWeightGrams}
                onChange={(e) => setForm((f) => ({ ...f, packingWeightGrams: e.target.value }))}
                required
              />
              <p className="text-xs text-gray-500 mt-1">Bag/packaging material per packet</p>
            </div>
          </div>
          {derivedQuality && (
            <p className="text-sm text-gray-600">
              Quality makhana per packet: <strong>{derivedQuality.qualityGrams} gm</strong>
              {' '}(packet size − packing weight)
            </p>
          )}
          {!packingWeightValid && (
            <p className="text-sm text-red-600">Packing weight must be less than packet size</p>
          )}
          <div>
            <FieldLabel>Packaging Price (₹ per packet)</FieldLabel>
            <input
              type="number"
              step="any"
              min="0"
              className="input-field"
              placeholder="e.g. 5"
              value={form.packagingPrice}
              onChange={(e) => setForm((f) => ({ ...f, packagingPrice: e.target.value }))}
            />
            <p className="text-xs text-gray-500 mt-1">Fixed packaging material/labour cost added to each packet</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['proportion6No', '6 No (gm per packet)'],
              ['proportion5No', '5 No (gm per packet)'],
              ['proportion4_5No', '4.5 No (gm per packet)'],
              ['proportion4No', '4 No (gm per packet)'],
              ['proportionOthers', 'Others (gm per packet)'],
            ].map(([key, label]) => (
              <div key={key}>
                <FieldLabel required>{label}</FieldLabel>
                <input
                  type="number"
                  step="any"
                  min="0"
                  className="input-field"
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  required
                />
              </div>
            ))}
          </div>
          {derivedQuality && (
            <p className={`text-sm ${proportionsValid ? 'text-green-600' : 'text-red-600'}`}>
              Grade total: {totalGradeGrams} gm
              {' / '}
              {derivedQuality.qualityGrams} gm required
              {proportionsValid ? '' : ' — must equal packet size − packing weight'}
            </p>
          )}
          <p className="text-xs text-gray-500">
            Enter how many grams of each grade go into each packet. All grades must add up to the quality portion only.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!proportionsValid || !packingWeightValid || !derivedQuality}
            >
              {editItem ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
