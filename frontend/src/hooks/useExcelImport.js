import { useState } from 'react';

export function useExcelImport(entityType, onSuccess) {
  const [importOpen, setImportOpen] = useState(false);

  return {
    importOpen,
    onImport: () => setImportOpen(true),
    importModalProps: {
      isOpen: importOpen,
      onClose: () => setImportOpen(false),
      entityType,
      onSuccess,
    },
  };
}
