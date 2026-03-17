// src/pages/admin/Reports.jsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Download, Trash2, Calendar,
  Loader2, FileSpreadsheet, Filter, X, Printer
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosClient.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return String(value);
  }
};

const resolveRequestedAt = (row) =>
  row.requested_time ?? row.created_at ?? null;

// FIX 2: Try every plausible column name the backend might return for approved_at.
// The backend query likely SELECTs it as one of these — all are checked.
const resolveApprovedAt = (row) =>
  row.approved_at ??
  row.approved_time ??
  row.approval_time ??
  row.approved_timestamp ??
  row.approvedAt ??
  null;

const resolveIssuedAt = (row) =>
  row.issued_at ??
  row.issued_time ??
  row.issuedAt ??
  null;

const resolveReturnedAt = (row) =>
  row.returned_at ??
  row.full_return_time ??
  row.returned_time ??
  row.returnedAt ??
  null;

const resolveStudentId = (row) =>
  row.student_id ??
  row.requester_student_id ??
  row.student_number ??
  row.requester_identifier ??
  row.requester_id ??
  null;

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportToExcel(rows, filename, roleFilter) {
  if (!rows.length) return toast.error('Nothing to export');
  const showStudentId = roleFilter !== 'faculty';
  const headers = ['Requester'];
  if (showStudentId) headers.push('Student ID');
  headers.push('Items (Barcodes)', 'Requested At', 'Approved At', 'Issued At', 'Returned At');
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csvRows = [
    headers.join(','),
    ...rows.map(r => {
      const itemsText = r.items?.length
        ? r.items.map(i => `${i.name} [${i.barcode || 'Batch'}] x${i.quantity || 1}`).join(' | ')
        : (r.items_summary ?? '—');
      const row = [escape(r.requester_name)];
      if (showStudentId) row.push(escape(r.requester_type === 'student' ? (resolveStudentId(r) ?? '—') : '—'));
      row.push(
        escape(itemsText),
        escape(resolveRequestedAt(r) ? new Date(resolveRequestedAt(r)).toLocaleString() : '—'),
        escape(resolveApprovedAt(r)  ? new Date(resolveApprovedAt(r)).toLocaleString()  : '—'),
        escape(resolveIssuedAt(r)    ? new Date(resolveIssuedAt(r)).toLocaleString()    : '—'),
        escape(resolveReturnedAt(r)  ? new Date(resolveReturnedAt(r)).toLocaleString()  : '—'),
      );
      return row.join(',');
    })
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast.success('Exported successfully');
}

// ─── FIX 3: Print handler ─────────────────────────────────────────────────────
// Injects a temporary print stylesheet, triggers window.print(), then removes it.
// This avoids polluting the global stylesheet and works with any CSS framework.
function printReport(rows, roleFilter, dateFrom, dateTo) {
  if (!rows.length) return toast.error('Nothing to print');

  const showStudentId = roleFilter !== 'faculty';
  const title = `Equipment Request Report${roleFilter !== 'all' ? ` — ${roleFilter.charAt(0).toUpperCase() + roleFilter.slice(1)}` : ''}`;
  const subtitle = [dateFrom && `From: ${dateFrom}`, dateTo && `To: ${dateTo}`].filter(Boolean).join('  ·  ');

  const headerCells = ['Requester', showStudentId && 'Student ID', 'Items', 'Requested At', 'Approved At', 'Issued At', 'Returned At']
    .filter(Boolean)
    .map(h => `<th>${h}</th>`)
    .join('');

  const bodyRows = rows.map(r => {
    const itemsHtml = (r.items ?? []).length
      ? r.items.map(i => `<span class="item-line">${i.name} <code>${i.barcode || 'Batch'}</code> ×${i.quantity || 1}</span>`).join('')
      : (r.items_summary ?? '—');

    const cells = [
      `<td><strong>${r.requester_name ?? '—'}</strong><br/><span class="badge ${r.requester_type}">${r.requester_type}</span></td>`,
      showStudentId && `<td>${r.requester_type === 'student' ? (resolveStudentId(r) ?? '—') : '—'}</td>`,
      `<td class="items-cell">${itemsHtml}</td>`,
      `<td>${resolveRequestedAt(r) ? formatDate(resolveRequestedAt(r)) : '—'}</td>`,
      `<td>${resolveApprovedAt(r)  ? formatDate(resolveApprovedAt(r))  : '—'}</td>`,
      `<td>${resolveIssuedAt(r)    ? formatDate(resolveIssuedAt(r))    : '—'}</td>`,
      `<td>${resolveReturnedAt(r)  ? formatDate(resolveReturnedAt(r))  : '—'}</td>`,
    ].filter(Boolean).join('');

    return `<tr>${cells}</tr>`;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>${title}</title>
      <style>
        @page { size: landscape; margin: 15mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 10px; color: #111; margin: 0; }
        h1 { font-size: 16px; margin: 0 0 2px; }
        .subtitle { font-size: 10px; color: #666; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1e3a5f; color: #fff; text-align: left; padding: 6px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        tr:nth-child(even) td { background: #f9fafb; }
        .item-line { display: block; margin-bottom: 2px; }
        code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 9px; }
        .badge { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 9px; font-weight: 600; margin-top: 2px; }
        .badge.faculty { background: #dbeafe; color: #1d4ed8; }
        .badge.student { background: #dcfce7; color: #15803d; }
        .items-cell { max-width: 200px; }
        .meta { font-size: 9px; color: #888; margin-top: 12px; }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <p class="meta">Generated: ${new Date().toLocaleString()} · Total records: ${rows.length}</p>
    </body>
    </html>
  `;

  const win = window.open('', '_blank', 'width=1100,height=700');
  if (!win) { toast.error('Pop-up blocked — please allow pop-ups for this site.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Small delay so browser finishes rendering before print dialog
  setTimeout(() => { win.print(); win.close(); }, 400);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const DateInput = ({ label, value, onChange }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">{label}</label>
    <div className="relative">
      <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input type="date" className="neu-input pl-8 text-sm w-full" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Reports() {
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [roleFilter, setRoleFilter]   = useState('all');
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [filterMode, setFilterMode]   = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting]       = useState(false);

  const isFiltered = filterMode && (dateFrom || dateTo);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (roleFilter !== 'all') params.type = roleFilter;
      if (filterMode && dateFrom) params.from = dateFrom;
      if (filterMode && dateTo)   params.to   = dateTo;
      const res = await api.get('/reports/issued', { params });
      setRows(res.data?.data ?? res.data ?? []);
    } catch (err) {
      console.error('Fetch reports error', err);
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, filterMode, dateFrom, dateTo]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleDeleteFiltered = async () => {
    setDeleting(true);
    try {
      await api.delete('/reports', {
        params: { from: dateFrom || undefined, to: dateTo || undefined, type: roleFilter !== 'all' ? roleFilter : undefined }
      });
      toast.success('Filtered records deleted');
      setDeleteConfirm(false);
      fetchReports();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = () => { setDateFrom(''); setDateTo(''); setFilterMode(false); };

  const showStudentId = roleFilter !== 'faculty';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary dark:text-darkText">Reports</h1>
          <p className="text-sm text-muted dark:text-darkMuted mt-0.5">{rows.length} issued records</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* FIX 3: Print button */}
          <button
            onClick={() => printReport(rows, roleFilter, isFiltered ? dateFrom : '', isFiltered ? dateTo : '')}
            className="neu-btn text-sm px-4 py-2 flex items-center gap-2"
          >
            <Printer size={14} />
            Print {isFiltered ? 'Filtered' : 'All'}
          </button>

          <button
            onClick={() => exportToExcel(rows, `invncea_report_${roleFilter}_${Date.now()}`, roleFilter)}
            className="neu-btn text-sm px-4 py-2 flex items-center gap-2"
          >
            <FileSpreadsheet size={14} />
            Export {isFiltered ? 'Filtered' : 'All'}
          </button>

          {isFiltered && (
            <button
              onClick={async () => {
                const res = await api.get('/reports/issued', { params: roleFilter !== 'all' ? { type: roleFilter } : {} });
                exportToExcel(res.data?.data ?? res.data ?? [], `invncea_report_all_${Date.now()}`, roleFilter);
              }}
              className="neu-btn text-sm px-4 py-2 flex items-center gap-2"
            >
              <Download size={14} /> Export All
            </button>
          )}
        </div>
      </div>

      {/* Role filter + date filter toggle */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'faculty', 'student'].map(r => (
          <button key={r} onClick={() => setRoleFilter(r)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border capitalize
              ${roleFilter === r
                ? 'bg-primary text-white border-primary'
                : 'border-black/10 dark:border-white/10 text-muted dark:text-darkMuted hover:border-primary'}`}>
            {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
        <button
          onClick={() => setFilterMode(f => !f)}
          className={`ml-auto px-4 py-2 rounded-lg text-sm font-medium transition-all border flex items-center gap-2
            ${filterMode
              ? 'bg-primary text-white border-primary'
              : 'border-black/10 dark:border-white/10 text-muted dark:text-darkMuted hover:border-primary'}`}>
          <Filter size={13} />
          {filterMode ? 'Filtering' : 'Filter by Date'}
        </button>
      </div>

      {/* Date filter panel */}
      {filterMode && (
        <div className="neu-card p-4 flex flex-col sm:flex-row gap-4 items-end animate-slide-up">
          <DateInput label="From" value={dateFrom} onChange={setDateFrom} />
          <DateInput label="To"   value={dateTo}   onChange={setDateTo}   />
          <div className="flex gap-2 items-center">
            <button onClick={fetchReports} className="neu-btn-primary text-sm px-4 py-2">Apply</button>
            <button onClick={clearFilters} className="neu-btn text-sm px-3 py-2"><X size={14} /></button>
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => setDeleteConfirm(true)}
              className="ml-auto flex items-center gap-2 text-sm text-red-500 hover:text-red-600 font-medium transition-colors">
              <Trash2 size={14} /> Delete Filtered Rows
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="neu-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted dark:text-darkMuted">No issued records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-black/[0.02] dark:bg-white/[0.03]">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">Requester</th>
                  {showStudentId && (
                    <th className="text-left px-6 py-3 text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">Student ID</th>
                  )}
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">Items (Barcodes)</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">Requested At</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">Approved At</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">Issued At</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">Returned At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-primary dark:text-darkText">{row.requester_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-block mt-1
                        ${row.requester_type === 'faculty'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'}`}>
                        {row.requester_type}
                      </span>
                    </td>

                    {showStudentId && (
                      <td className="px-6 py-4 text-muted dark:text-darkMuted">
                        {row.requester_type === 'student' ? (resolveStudentId(row) ?? '—') : '—'}
                      </td>
                    )}

                    <td className="px-6 py-4">
                      <div className="space-y-0.5">
                        {(row.items ?? []).map((item, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs text-muted dark:text-darkMuted">
                            <span className="font-medium text-primary dark:text-darkText">{item.name}</span>
                            <span className="font-mono bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">{item.barcode || 'Batch'}</span>
                            {item.quantity > 1 && <span>×{item.quantity}</span>}
                          </div>
                        ))}
                        {(!row.items || row.items.length === 0) && (
                          <span className="text-xs text-muted dark:text-darkMuted">{row.items_summary ?? '—'}</span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-xs text-muted dark:text-darkMuted whitespace-nowrap">
                      {resolveRequestedAt(row) ? formatDate(resolveRequestedAt(row)) : '—'}
                    </td>

                    {/* FIX 2: uses the hardened resolveApprovedAt that tries all possible column names */}
                    <td className="px-6 py-4 text-xs text-muted dark:text-darkMuted whitespace-nowrap">
                      {resolveApprovedAt(row) ? formatDate(resolveApprovedAt(row)) : '—'}
                    </td>

                    <td className="px-6 py-4 text-xs text-muted dark:text-darkMuted whitespace-nowrap">
                      {resolveIssuedAt(row) ? formatDate(resolveIssuedAt(row)) : '—'}
                    </td>

                    <td className="px-6 py-4 text-xs text-muted dark:text-darkMuted whitespace-nowrap">
                      {resolveReturnedAt(row) ? formatDate(resolveReturnedAt(row)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="neu-card-lg w-full max-w-sm p-6 animate-slide-up">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={20} className="text-red-500" />
            </div>
            <h3 className="font-display text-center text-lg font-bold text-primary dark:text-darkText mb-1">Delete Filtered Records?</h3>
            <p className="text-sm text-center text-muted dark:text-darkMuted mb-2">
              This will permanently delete all issued records
              {dateFrom && ` from ${dateFrom}`}{dateTo && ` to ${dateTo}`}
              {roleFilter !== 'all' && ` for ${roleFilter}s`}.
            </p>
            <p className="text-xs text-center text-red-500 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)} className="flex-1 neu-btn text-sm py-2.5">Cancel</button>
              <button onClick={handleDeleteFiltered} disabled={deleting}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm py-2.5 font-medium transition-colors flex items-center justify-center gap-2">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
