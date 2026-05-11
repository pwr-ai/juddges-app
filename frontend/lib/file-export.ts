import ExcelJS from "exceljs";

export type ExportFormat = "xlsx" | "csv" | "json";

export type ExportRow = Record<string, unknown>;

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

export async function exportToXLSX(
  data: ExportRow[],
  filename: string,
  sheetName = "Data"
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31));

  const keys = Object.keys(data[0] || {});
  worksheet.columns = keys.map((key) => {
    const maxLength = Math.max(
      key.length,
      ...data.map((row) => String(row[key] ?? "").length)
    );
    return {
      header: key,
      key,
      width: Math.min(maxLength + 2, 60),
    };
  });

  data.forEach((row) => {
    const exportRow = Object.fromEntries(
      keys.map((key) => [key, row[key] ?? ""])
    );
    worksheet.addRow(exportRow);
  });

  const excelBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  downloadBlob(blob, `${filename}.xlsx`);
}

export function exportToCSV(data: ExportRow[], filename: string): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [];

  csvRows.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(","));

  data.forEach((row) => {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return '""';
      const strValue = String(value).replace(/"/g, '""');
      return `"${strValue}"`;
    });
    csvRows.push(values.join(","));
  });

  const csvContent = csvRows.join("\n");
  // UTF-8 BOM so Excel detects the encoding correctly.
  const blob = new Blob(["﻿" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  downloadBlob(blob, `${filename}.csv`);
}

export function exportToJSON(data: ExportRow[], filename: string): void {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], {
    type: "application/json;charset=utf-8;",
  });

  downloadBlob(blob, `${filename}.json`);
}
