import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm action',
  message = 'Are you sure you want to proceed?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  doubleConfirm = true,
  step2Message: step2MessageProp,
}) {
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (isOpen) setStep(1);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFirstConfirm = () => {
    if (doubleConfirm) setStep(2);
    else onConfirm();
  };

  const isDelete = variant === 'danger';
  const step2Message = step2MessageProp ?? 'This will update stock ledger balances. This action cannot be undone.';

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-t-xl sm:rounded-xl shadow-xl w-full max-w-md p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-3 mb-4">
          <div className={`p-2 rounded-full ${isDelete ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">{step === 1 ? title : 'Please confirm again'}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {step === 1 ? message : step2Message}
            </p>
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button onClick={onClose} className="btn-secondary">{cancelLabel}</button>
          {step === 1 ? (
            <button onClick={handleFirstConfirm} className={isDelete ? 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium' : 'btn-primary'}>
              {confirmLabel}
            </button>
          ) : (
            <button
              onClick={onConfirm}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium"
            >
              Yes, {confirmLabel.toLowerCase()}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DeleteButton({
  onDelete,
  title = 'Delete entry',
  message = 'Are you sure you want to delete this entry?',
  step2Message = 'This action cannot be undone.',
  className = 'text-red-600 hover:text-red-800',
  children,
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children || 'Delete'}
      </button>
      <ConfirmDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={() => { setOpen(false); onDelete(); }}
        title={title}
        message={message}
        confirmLabel="Delete"
        variant="danger"
        doubleConfirm
        step2Message={step2Message}
      />
    </>
  );
}

export function EntryActions({
  onEdit,
  onDelete,
  editTitle = 'Edit entry',
  deleteTitle = 'Delete entry',
  editMessage = 'You are about to edit this stock entry. Stock balances will be recalculated.',
  deleteMessage = 'Are you sure you want to delete this entry?',
  step2Message = 'This will update stock ledger balances. This action cannot be undone.',
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <div className="flex gap-2">
        <button onClick={() => setEditOpen(true)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
        <button onClick={() => setDeleteOpen(true)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
      </div>
      <ConfirmDialog
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onConfirm={() => { setEditOpen(false); onEdit(); }}
        title={editTitle}
        message={editMessage}
        confirmLabel="Continue to edit"
        variant="warning"
        doubleConfirm
        step2Message={step2Message}
      />
      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => { setDeleteOpen(false); onDelete(); }}
        title={deleteTitle}
        message={deleteMessage}
        confirmLabel="Delete"
        variant="danger"
        doubleConfirm
        step2Message={step2Message}
      />
    </>
  );
}
