import { useEffect, useState } from 'react';
import { FieldLabel } from './common';
import { formatCurrency } from '../utils/helpers';

export function AmountQuantityFields({
  quantityName = 'quantity',
  rateName = 'rate',
  amountName = 'amount',
  defaultQuantity,
  defaultRate,
  defaultAmount,
  unit = 'KG',
  required = true,
}) {
  const [quantity, setQuantity] = useState(defaultQuantity ?? '');
  const [rate, setRate] = useState(defaultRate ?? '');
  const [amount, setAmount] = useState(defaultAmount ?? '');

  useEffect(() => {
    setQuantity(defaultQuantity ?? '');
    setRate(defaultRate ?? '');
    setAmount(defaultAmount ?? '');
  }, [defaultQuantity, defaultRate, defaultAmount]);

  const syncTotalFromRate = (qty, r) => {
    const q = parseFloat(qty);
    const rt = parseFloat(r);
    if (!Number.isNaN(q) && !Number.isNaN(rt) && q > 0 && rt >= 0) {
      setAmount((q * rt).toFixed(2));
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel required={required}>Quantity ({unit})</FieldLabel>
        <input
          name={quantityName}
          type="number"
          step="0.01"
          min="0.01"
          required={required}
          value={quantity}
          onChange={(e) => {
            setQuantity(e.target.value);
            syncTotalFromRate(e.target.value, rate);
          }}
          className="input-field"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel required={required}>Rate (₹ per {unit})</FieldLabel>
          <input
            name={rateName}
            type="number"
            step="0.01"
            min="0"
            required={required}
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              syncTotalFromRate(quantity, e.target.value);
            }}
            className="input-field"
          />
        </div>
        <div>
          <FieldLabel required={required}>Total Amount (₹)</FieldLabel>
          <input
            name={amountName}
            type="number"
            step="0.01"
            min="0"
            required={required}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-field"
          />
        </div>
      </div>
      {amount && !Number.isNaN(parseFloat(amount)) && (
        <p className="text-xs text-gray-500">
          Total: {formatCurrency(parseFloat(amount))}
          {quantity && rate ? ` (${quantity} ${unit} × ₹${rate}/KG)` : ''}
        </p>
      )}
    </div>
  );
}

export function CustomerDetailsFields({ prefix = 'customer', defaults = {} }) {
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Customer Details</p>
      <div>
        <FieldLabel required>Customer Name</FieldLabel>
        <input name={`${prefix}Name`} required defaultValue={defaults.name} className="input-field" placeholder="Buyer name" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Phone</label>
          <input name={`${prefix}Phone`} defaultValue={defaults.phone} className="input-field" />
        </div>
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input name={`${prefix}Email`} type="email" defaultValue={defaults.email} className="input-field" />
        </div>
      </div>
      <div>
        <label className="block text-sm mb-1">Address</label>
        <textarea name={`${prefix}Address`} defaultValue={defaults.address} className="input-field" rows={2} />
      </div>
    </div>
  );
}

export function parseCustomerDetails(fd, prefix = 'customer') {
  return {
    customerName: fd.get(`${prefix}Name`),
    customerPhone: fd.get(`${prefix}Phone`) || undefined,
    customerEmail: fd.get(`${prefix}Email`) || undefined,
    customerAddress: fd.get(`${prefix}Address`) || undefined,
  };
}
