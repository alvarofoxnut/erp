import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export const exportToExcel = (data, filename, sheetName = 'Report') => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportToPDF = (columns, data, title, filename) => {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 20);
  doc.autoTable({
    head: [columns],
    body: data,
    startY: 30,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [22, 163, 74] },
  });
  doc.save(`${filename}.pdf`);
};
