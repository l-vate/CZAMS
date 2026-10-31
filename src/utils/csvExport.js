// Browser-only CSV export for the reports. Pure helpers plus one function that triggers the download.

const UTF8_BOM = '﻿';
// A cell that starts with one of these is read as a formula by Excel and Sheets.
const FORMULA_START = /^[=+\-@\t\r]/;

// A calendar date written as text: 2026-11-03, or Nov 3, 2026 (also with the full month name). Excel and Sheets turn such text into a real date
// and then show ########## when the column is narrower than the date, which is what a CSV always gives them. So a date is written as a text
// value instead: it keeps reading as written and never shows hashes. Only this exact shape is treated so, and it holds no formula.
const DATE_TEXT = /^(\d{4}-\d{2}-\d{2}|[A-Z][a-z]{2,8} \d{1,2}, \d{4})$/;

// One cell as CSV text. Text that could run as a formula gets a leading single quote, and
// anything with a comma, quote or line break is wrapped in quotes with inner quotes doubled.
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && DATE_TEXT.test(text)) return `"=""${text}"""`;
  if (typeof value !== 'number' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// The whole file: a header row, the same rows the screen shows, then the totals row if any.
export function buildCsv(report) {
  const lines = [report.columns, ...report.rows];
  if (report.totalRow) lines.push(report.totalRow);
  if (report.footerRows) lines.push(...report.footerRows);
  return UTF8_BOM + lines.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// CZAMS_<report>_<from>_<to>_<datebasis>.csv
export function csvFilename(reportKey, filters) {
  return `CZAMS_${reportKey}_${filters.fromKey}_${filters.toKey}_${filters.dateBasis}.csv`;
}

export function downloadCsv(report, filename) {
  const blob = new Blob([buildCsv(report)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
