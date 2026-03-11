import React, { useEffect, useState, useCallback } from 'react';
import {
  Download, Trash2, Calendar,
  Loader2, FileSpreadsheet, Filter, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosClient.js';

// ─── Helpers ────────────────────────────────────────────────────────────────
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

// Try to resolve returned timestamp from multiple possible backend fields
const resolveReturnedAt = (row) => {
  return row.returned_at || row.full_return_time || row.returned_time || null;
};

// Resolve a reasonable student identifier (defensive)
const resolveStudentId = (row) => {
  return row.student_id || row.requester_student_id || row.student_number || row.requester_identifier || row.requester_id || null;
};

// ─── Excel export (Dynamic columns based on role filter) ──────
function exportToExcel(rows, filename, roleFilter) {
  if (!rows.length) return toast.error('Nothing to export');

  const showStudentId = roleFilter !== 'faculty';

  // Build Headers dynamically
  const headers = ['Requester'];
  
  if (showStudentId) {
    headers.push('Student ID');
  }

  headers.push('Items (Barcodes)', 'Requested At', 'Approved At', 'Issued At', 'Returned At');

  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const csvRows = [
    headers.join(','),
    ...rows.map(r => {
      // Safely format items for the Excel cell
      const itemsText = r.items && r.items.length > 0
        ? r.items.map(i => `${i.name} [${i.barcode || 'Batch'}] x${i.quantity || 1}`).join(' | ')
        : (r.items_summary ?? '—');

      const rowData = [escape(r.requester_name)];

      if (showStudentId) {
        // If it's a student, show ID, otherwise blank '—'
        rowData.push(escape(r.requester_type === 'student' ? (resolveStudentId(r) ?? '—') : '—'));
      }

      rowData.push(
        escape(itemsText),
        escape(r.requested_time ? new Date(r.requested_time).toLocaleString() : '—'),
        escape(r.approved_time ? new Date(r.approved_time).toLocaleString() : '—'),
        escape(r.issued_time ? new Date(r.issued_time).toLocaleString() : '—'),
        escape(resolveReturnedAt(r) ? new Date(resolveReturnedAt(r)).toLocaleString() : '—')
      );

      return rowData.join(',');
    })
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Exported successfully');
}

// ─── Date input ───────────────────────────────────────────────────────────────
const DateInput = ({ label, value, onChange }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">{label}</label>
    <div className="relative">
      <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input
        type="date"
        className="neu-input pl-8 text-sm w-full"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Reports() {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [roleFilter, setRoleFilter] = useState('all'); // all | faculty | student
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [filterMode, setFilterMode] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting]   = useState(false);

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
        params: { 
          from: dateFrom || undefined, 
          to: dateTo || undefined, 
          type: roleFilter !== 'all' ? roleFilter : undefined 
        }
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

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setFilterMode(false);
  };

  const showStudentId = roleFilter !== 'faculty';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary dark:text-darkText">Reports</h1>
          <p className="text-sm text-muted dark:text-darkMuted mt-0.5">{rows.length} issued records</p>
        </div>

        {/* Export buttons */}
        <div className="flex gap-2 flex-wrap">
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
                const res = await api.get('/reports/issued', {
                  params: roleFilter !== 'all' ? { type: roleFilter } : {}
                });
                exportToExcel(res.data?.data ?? res.data ?? [], `invncea_report_all_${Date.now()}`, roleFilter);
              }}
              className="neu-btn text-sm px-4 py-2 flex items-center gap-2"
            >
              <Download size={14} /> Export All
            </button>
          )}
        </div>
      </div>

      {/* Role tabs */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'faculty', 'student'].map(r => (
          <button
            key={r}
            onClick={() => setRoleFilter(r)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border capitalize
              ${roleFilter === r
                ? 'bg-primary text-white border-primary'
                : 'border-black/10 dark:border-white/10 text-muted dark:text-darkMuted hover:border-primary'}`}
          >
            {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}

        {/* Filter toggle */}
        <button
          onClick={() => setFilterMode(f => !f)}
          className={`ml-auto px-4 py-2 rounded-lg text-sm font-medium transition-all border flex items-center gap-2
            ${filterMode
              ? 'bg-primary text-white border-primary'
              : 'border-black/10 dark:border-white/10 text-muted dark:text-darkMuted hover:border-primary'}`}
        >
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
            <button
              onClick={fetchReports}
              className="neu-btn-primary text-sm px-4 py-2"
            >
              Apply
            </button>
            <button onClick={clearFilters} className="neu-btn text-sm px-3 py-2">
              <X size={14} />
            </button>
          </div>

          {/* Delete filtered — only in filter mode */}
          {(dateFrom || dateTo) && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="ml-auto flex items-center gap-2 text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
            >
              <Trash2 size={14} /> Delete Filtered Rows
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="neu-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted dark:text-darkMuted">
            No issued records found.
          </div>
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
                {rows.map((row, idx) => {
                  const returnedAt = resolveReturnedAt(row);

                  return (
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
                        {row.requested_time ? formatDate(row.requested_time) : '—'}
                      </td>

                      <td className="px-6 py-4 text-xs text-muted dark:text-darkMuted whitespace-nowrap">
                        {row.approved_time ? formatDate(row.approved_time) : '—'}
                      </td>

                      <td className="px-6 py-4 text-xs text-muted dark:text-darkMuted whitespace-nowrap">
                        {row.issued_time ? formatDate(row.issued_time) : '—'}
                      </td>

                      <td className="px-6 py-4 text-xs text-muted dark:text-darkMuted whitespace-nowrap">
                        {returnedAt ? formatDate(returnedAt) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="neu-card-lg w-full max-w-sm p-6 animate-slide-up">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={20} className="text-red-500" />
            </div>
            <h3 className="font-display text-center text-lg font-bold text-primary dark:text-darkText mb-1">
              Delete Filtered Records?
            </h3>
            <p className="text-sm text-center text-muted dark:text-darkMuted mb-2">
              This will permanently delete all issued records
              {dateFrom && ` from ${dateFrom}`}
              {dateTo && ` to ${dateTo}`}
              {roleFilter !== 'all' && ` for ${roleFilter}s`}.
            </p>
            <p className="text-xs text-center text-red-500 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)} className="flex-1 neu-btn text-sm py-2.5">
                Cancel
              </button>
              <button
                onClick={handleDeleteFiltered}
                disabled={deleting}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm py-2.5 font-medium transition-colors flex items-center justify-center gap-2"
              >
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