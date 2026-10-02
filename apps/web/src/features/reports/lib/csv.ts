import type { Money } from '@rbp/types';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const escape = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC 4180-ish CSV; money goes out as plain decimals (see `csvMoney`). */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]) {
  return [
    columns.map((c) => escape(c.header)).join(','),
    ...rows.map((r) => columns.map((c) => escape(c.value(r))).join(',')),
  ].join('\r\n');
}

export const csvMoney = (m: Money | null | undefined) => (m ? (m.amount / 100).toFixed(2) : '');

/** Save as a real .csv file (BOM so Excel reads UTF-8 names). */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
