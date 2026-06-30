import { Children, cloneElement, isValidElement, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/helpers';

function QtyValueRow({ label, quantity, value, bold = false, indent = false, className = '' }) {
  const qtyCell =
    quantity === '' || quantity === null || quantity === undefined
      ? '—'
      : `${formatNumber(quantity)} KG`;

  return (
    <tr className={`${bold ? 'font-semibold border-t' : ''} ${className}`.trim()}>
      <td className={`break-words ${indent ? 'pl-4' : ''}`}>{label}</td>
      <td className="text-right whitespace-nowrap">{qtyCell}</td>
      <td className="text-right whitespace-nowrap">{formatCurrency(value)}</td>
    </tr>
  );
}

function AmountRow({ label, amount, bold = false, indent = false, className = '' }) {
  return (
    <tr className={`${bold ? 'font-semibold border-t' : ''} ${className}`.trim()}>
      <td className={`break-words ${indent ? 'pl-4' : ''}`}>{label}</td>
      <td className="text-right whitespace-nowrap">—</td>
      <td className="text-right whitespace-nowrap">{formatCurrency(amount)}</td>
    </tr>
  );
}

function AccordionDetailRows({ open, children, emptyMessage = 'No breakdown' }) {
  const items = Children.toArray(children).filter(Boolean);

  if (!items.length) {
    return (
      <tr
        className={`account-accordion-detail text-sm text-gray-500 ${open ? '' : 'hidden print:!table-row'}`}
      >
        <td colSpan={3} className="pl-8 py-1">{emptyMessage}</td>
      </tr>
    );
  }

  return items.map((child, index) => {
    if (!isValidElement(child)) return child;
    const detailClass = `account-accordion-detail ${open ? '' : 'hidden print:!table-row'}`;
    return cloneElement(child, {
      key: child.key ?? index,
      className: `${child.props.className || ''} ${detailClass}`.trim(),
    });
  });
}

function AccountAccordionSection({
  title,
  quantity,
  value,
  amountOnly = false,
  defaultOpen = false,
  emptyMessage,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  const qtyCell =
    amountOnly || quantity === '' || quantity === null || quantity === undefined
      ? '—'
      : `${formatNumber(quantity)} KG`;

  const toggle = () => setOpen((prev) => !prev);

  return (
    <>
      <tr className="bg-gray-50 dark:bg-gray-800/50">
        <td className="font-medium">
          <button
            type="button"
            onClick={toggle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
              }
            }}
            aria-expanded={open}
            className="flex items-center gap-2 w-full text-left py-1 hover:text-primary-600 dark:hover:text-primary-400"
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
            {title}
          </button>
        </td>
        <td className="text-right whitespace-nowrap font-medium">{qtyCell}</td>
        <td className="text-right whitespace-nowrap font-medium">{formatCurrency(value)}</td>
      </tr>
      <AccordionDetailRows open={open} emptyMessage={emptyMessage}>
        {children}
      </AccordionDetailRows>
    </>
  );
}

function stockSectionRows(block) {
  if (block.groups?.length) {
    return block.groups.flatMap((group) => [
      <tr key={`${group.key}-heading`} className="bg-gray-50/70 dark:bg-gray-800/30">
        <td colSpan={3} className="font-medium pl-6">{group.label}</td>
      </tr>,
      ...group.lines.map((line) => (
        <QtyValueRow
          key={line.key || line.label}
          label={line.label}
          quantity={line.quantity}
          value={line.value}
          indent
        />
      )),
      <QtyValueRow
        key={`${group.key}-subtotal`}
        label={`${group.label} (Subtotal)`}
        quantity={group.quantity}
        value={group.value}
        bold
      />,
    ]);
  }

  return block.lines.map((line) => (
    <QtyValueRow
      key={line.key || line.label}
      label={line.label}
      quantity={line.quantity}
      value={line.value}
      indent
    />
  ));
}

function AccountSideTable({ side, sideLabel }) {
  const isDebit = sideLabel === 'Debit';

  return (
    <div className="card h-full">
      <h4 className="font-semibold mb-4 text-primary-700 dark:text-primary-400">
        {side.heading} ({sideLabel})
      </h4>
      <div className="table-container lg:overflow-x-visible">
        <table className="data-table table-fixed account-report-table">
          <thead>
            <tr>
              <th className="w-[45%]">Particulars</th>
              <th className="text-right w-[27%]">Quantity</th>
              <th className="text-right w-[28%]">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {isDebit ? (
              <>
                <AccountAccordionSection
                  title="Opening Stock"
                  quantity={side.openingStock.quantity}
                  value={side.openingStock.value}
                >
                  {stockSectionRows(side.openingStock)}
                </AccountAccordionSection>

                <AccountAccordionSection
                  title="Purchases"
                  quantity={side.purchases.quantity}
                  value={side.purchases.value}
                >
                  {side.purchases.lines.map((line) => (
                    <QtyValueRow
                      key={line.key}
                      label={line.label}
                      quantity={line.quantity}
                      value={line.value}
                      indent
                    />
                  ))}
                </AccountAccordionSection>

                <AccountAccordionSection
                  title="Direct Expenses"
                  quantity=""
                  value={side.directExpenses.total}
                  amountOnly
                  emptyMessage="No direct expenses in this period"
                >
                  {side.directExpenses.items.map((item) => (
                    <AmountRow key={item.label} label={item.label} amount={item.amount} indent />
                  ))}
                </AccountAccordionSection>

                <QtyValueRow
                  label="Left Side Total"
                  quantity={side.total.quantity}
                  value={side.total.value}
                  bold
                />
              </>
            ) : (
              <>
                <AccountAccordionSection
                  title="Closing Stock"
                  quantity={side.closingStock.quantity}
                  value={side.closingStock.value}
                >
                  {stockSectionRows(side.closingStock)}
                </AccountAccordionSection>

                <AccountAccordionSection
                  title="Damages"
                  quantity={side.damages.quantity}
                  value={side.damages.value}
                >
                  {side.damages.lines.map((line) => (
                    <QtyValueRow
                      key={line.key}
                      label={line.label}
                      quantity={line.quantity}
                      value={line.value}
                      indent
                    />
                  ))}
                </AccountAccordionSection>

                <AccountAccordionSection
                  title="Sales"
                  quantity={side.sales.quantity}
                  value={side.sales.value}
                >
                  {side.sales.lines.map((line) => (
                    <QtyValueRow
                      key={line.key || line.label}
                      label={line.label}
                      quantity={line.quantity}
                      value={line.value}
                      indent
                    />
                  ))}
                </AccountAccordionSection>

                <QtyValueRow
                  label="Right Side Total"
                  quantity={side.total.quantity}
                  value={side.total.value}
                  bold
                />
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ManufacturingAccountTables({ section }) {
  if (!section?.debitSide || !section?.creditSide) return null;

  return (
    <div id="trading-account-print" className="space-y-6">
      <div className="card border-l-4 border-l-primary-500">
        <h3 className="font-semibold text-lg">Trading / Manufacturing Account</h3>
        <p className="text-sm text-gray-500 mt-1">{section.unitLabel}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AccountSideTable side={section.debitSide} sideLabel="Debit" />
        <AccountSideTable side={section.creditSide} sideLabel="Credit" />
      </div>

      <div className={`card text-center ${section.gross.isLoss ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
        <p className="text-sm text-gray-500">{section.gross.label}</p>
        <p className="text-xs text-gray-500 mt-1">Right Side Total − Left Side Total</p>
        <p className={`text-2xl font-bold mt-1 ${section.gross.isLoss ? 'text-red-600' : 'text-green-600'}`}>
          {formatCurrency(section.gross.amount)}
        </p>
      </div>

      <div className="card">
        <h4 className="font-semibold mb-4">Profit &amp; Loss Account</h4>
        <table className="data-table max-w-2xl">
          <tbody>
            <tr>
              <td>Gross Profit B/F</td>
              <td className="text-right font-medium">
                {formatCurrency(section.profitAndLoss.grossProfitBroughtForward)}
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="text-sm text-gray-500 pt-2">Less: Indirect Expenses</td>
            </tr>
            {section.profitAndLoss.indirectExpenses.items.length === 0 ? (
              <tr>
                <td colSpan={2} className="text-sm text-gray-500 pl-4">No indirect expenses in this period</td>
              </tr>
            ) : (
              section.profitAndLoss.indirectExpenses.items.map((item) => (
                <tr key={item.label}>
                  <td className="pl-4">{item.label}</td>
                  <td className="text-right text-red-600">{formatCurrency(item.amount)}</td>
                </tr>
              ))
            )}
            <tr className="font-medium border-t">
              <td className="pl-4">Total Indirect Expenses</td>
              <td className="text-right text-red-600">
                {formatCurrency(section.profitAndLoss.indirectExpenses.total)}
              </td>
            </tr>
            <tr className="font-semibold border-t">
              <td>{section.profitAndLoss.net.label}</td>
              <td className={`text-right ${section.profitAndLoss.net.isLoss ? 'text-red-600' : 'text-primary-600'}`}>
                {formatCurrency(section.profitAndLoss.net.amount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h4 className="font-semibold mb-4">Less: Personal Expenses / Drawings</h4>
        <table className="data-table max-w-2xl">
          <tbody>
            <tr>
              <td>Net Profit</td>
              <td className="text-right">{formatCurrency(section.final.netProfit)}</td>
            </tr>
            {section.final.personalExpenses.items.length === 0 ? (
              <tr>
                <td colSpan={2} className="text-sm text-gray-500 pl-4">No personal expenses in this period</td>
              </tr>
            ) : (
              section.final.personalExpenses.items.map((item) => (
                <tr key={item.label}>
                  <td className="pl-4">{item.label}</td>
                  <td className="text-right text-red-600">{formatCurrency(item.amount)}</td>
                </tr>
              ))
            )}
            <tr className="font-medium border-t">
              <td className="pl-4">Total Personal Expenses</td>
              <td className="text-right text-red-600">
                {formatCurrency(section.final.personalExpenses.total)}
              </td>
            </tr>
            <tr className="font-semibold border-t">
              <td>{section.final.final.label}</td>
              <td className={`text-right ${section.final.final.isLoss ? 'text-red-600' : 'text-primary-600'}`}>
                {formatCurrency(section.final.final.amount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
