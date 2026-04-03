// src/pages/admin/Reports.jsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Download, Trash2, Calendar,
  Loader2, FileSpreadsheet, Filter, X, Printer, Package, CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosClient.js';
import { useAuth } from '../../context/AuthContext.jsx'; 

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

const resolveRequestedAt = (row) => row.created_at ?? row.requested_at ?? null;
const resolveApprovedAt  = (row) => row.approved_time ?? row.approved_at ?? null;
const resolveIssuedAt    = (row) => row.issued_time ?? row.issued_at ?? null;

// ⚡ FIX: Hyper-Aggressive Return Timestamp Hunter (catches Bulk QR Scanner returns)
const resolveReturnedAt  = (row) => {
  // 1. Check direct request-level fields
  if (row.last_return_time) return row.last_return_time;
  if (row.returned_at) return row.returned_at;
  if (row.returned_time) return row.returned_time;
  if (row.actual_return_time) return row.actual_return_time;

  // 2. Check the items array (Bulk scanner often updates items directly)
  if (row.items && Array.isArray(row.items)) {
    const itemTimes = row.items
      .filter(i => String(i.item_status || i.status || '').toUpperCase() === 'RETURNED')
      .map(i => i.returned_at || i.returned_time || i.last_return_time || i.updated_at)
      .filter(Boolean);
      
    if (itemTimes.length > 0) {
      // Sort descending to get the most recent item return time
      itemTimes.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      return itemTimes[0];
    }
  }

  // 3. Ultimate Fallback: The row's generic update timestamp
  const status = String(row.request_status || row.status || '').toUpperCase();
  if (status === 'RETURNED' || status === 'PARTIALLY RETURNED') {
    return row.updated_at || null;
  }
  
  return null;
};

const resolveStudentId   = (row) => row.requester_id ?? row.student_id ?? row.school_id ?? null;

const getStatusColor = (status) => {
  if (status === 'RETURNED') return 'bg-gray-100 text-gray-600 border-gray-200';
  if (status === 'PARTIALLY RETURNED') return 'bg-orange-100 text-orange-700 border-orange-200';
  if (status === 'ISSUED') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  return 'bg-blue-100 text-blue-700 border-blue-200';
};

const isValidItem = (item) => ['ISSUED', 'RETURNED', 'PARTIALLY RETURNED'].includes(item.item_status || item.status);
const getItemQty = (item) => item.quantity_issued || item.qty_requested || item.quantity || 1;

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportToExcel(rows, filename, roleFilter) {
  if (!rows.length) return toast.error('Nothing to export');
  const showStudentId = roleFilter !== 'faculty';
  
  const headers = ['Request ID', 'Status', 'Requester'];
  if (showStudentId) headers.push('User ID');
  headers.push('Items (Barcodes)', 'Requested At', 'Approved At', 'Issued At', 'Returned At');
  
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  
  const csvRows = [
    headers.join(','),
    ...rows.map(r => {
      const validItems = (r.items || []).filter(isValidItem);
      const itemsText = validItems.length
        ? validItems.map(i => `${i.item_name} [${i.barcode || 'Batch'}] x${getItemQty(i)}`).join(' | ')
        : (r.items_summary ?? '—');
        
      const row = [
        escape(`#${r.request_id || r.id}`),
        escape(r.request_status || r.status),
        escape(r.requester_name)
      ];
      
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

// ─── Print handler ─────────────────────────────────────────────────────
function printReport(rows, roleFilter, dateFrom, dateTo) {
  if (!rows.length) return toast.error('Nothing to print');

  const showStudentId = roleFilter !== 'faculty';
  const title = `Equipment Request Report${roleFilter !== 'all' ? ` — ${roleFilter.charAt(0).toUpperCase() + roleFilter.slice(1)}` : ''}`;
  const subtitle = [dateFrom && `From: ${dateFrom}`, dateTo && `To: ${dateTo}`].filter(Boolean).join('  ·  ');

  const headerCells = ['Req #', 'Status', 'Requester', showStudentId && 'User ID', 'Items', 'Requested At', 'Approved At', 'Issued At', 'Returned At']
    .filter(Boolean)
    .map(h => `<th>${h}</th>`)
    .join('');

  const bodyRows = rows.map(r => {
    const validItems = (r.items || []).filter(isValidItem);
    const itemsHtml = validItems.length
      ? validItems.map(i => `<span class="item-line">${i.item_name} <code>${i.barcode || 'Batch'}</code> ×${getItemQty(i)}</span>`).join('')
      : (r.items_summary ?? '—');

    const cells = [
      `<td><strong>#${r.request_id || r.id}</strong></td>`,
      `<td><span class="badge status-${String(r.request_status || r.status).replace(' ', '-').toLowerCase()}">${r.request_status || r.status}</span></td>`,
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
        .badge { display: inline-block; padding: 2px 6px; border-radius: 999px; font-size: 8px; font-weight: bold; margin-top: 2px; border: 1px solid #ccc; }
        .badge.faculty { background: #dbeafe; color: #1d4ed8; border-color: #bfdbfe; }
        .badge.student { background: #dcfce7; color: #15803d; border-color: #bbf7d0; }
        .badge.status-returned { background: #f3f4f6; color: #4b5563; }
        .badge.status-issued { background: #d1fae5; color: #047857; }
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
  setTimeout(() => { win.print(); win.close(); }, 400);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const DateInput = ({ label, value, onChange }) => (
  <div className="flex flex-col gap-1 w-full sm:w-auto">
    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</label>
    <div className="relative">
      <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input type="date" className="w-full sm:w-40 pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Reports() {
  const { user } = useAuth();
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
      if (filterMode && dateFrom) params.from = dateFrom;
      if (filterMode && dateTo)   params.to   = dateTo;
      if (user?.room_id) params.room_id = user.room_id;
      
      const res = await api.get('/reports/issued', { params });
      let fetchedData = res.data?.data ?? res.data ?? [];
      
      if (user?.room_id) {
        fetchedData = fetchedData.filter(r => 
          String(r.room_id) === String(user.room_id) || 
          !r.room_id || 
          (r.items && r.items.some(i => String(i.location_room_id) === String(user.room_id)))
        );
      }

      setRows(fetchedData);
    } catch (err) {
      console.error('Fetch reports error', err);
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [filterMode, dateFrom, dateTo, user?.room_id]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const filteredRows = useMemo(() => {
    if (roleFilter === 'all') return rows;
    return rows.filter(r => String(r.requester_type).toLowerCase() === roleFilter);
  }, [rows, roleFilter]);

  const handleDeleteFiltered = async () => {
    setDeleting(true);
    try {
      await api.delete('/reports', {
        params: { 
          from: dateFrom || undefined, 
          to: dateTo || undefined, 
          type: roleFilter !== 'all' ? roleFilter : undefined,
          room_id: user?.room_id 
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

  const clearFilters = () => { setDateFrom(''); setDateTo(''); setFilterMode(false); };

  const showStudentId = roleFilter !== 'faculty';

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight">Reports & History</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Found <strong className="text-primary">{filteredRows.length}</strong> matching records.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => printReport(filteredRows, roleFilter, isFiltered ? dateFrom : '', isFiltered ? dateTo : '')} className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-bold rounded-xl border border-gray-200 transition-colors">
            <Printer size={16} /> Print {isFiltered ? 'Filtered' : 'All'}
          </button>
          <button onClick={() => exportToExcel(filteredRows, `invncea_report_${roleFilter}_${Date.now()}`, roleFilter)} className="flex items-center gap-2 px-4 py-2.5 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-bold rounded-xl border border-green-200 transition-colors">
            <FileSpreadsheet size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-2xl border border-black/5 shadow-sm">
        <div className="flex bg-gray-100 p-1 rounded-xl">
          {['all', 'faculty', 'student'].map(r => (
            <button key={r} onClick={() => setRoleFilter(r)} className={`px-5 py-2 rounded-lg text-sm font-bold capitalize transition-all ${roleFilter === r ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {r}
            </button>
          ))}
        </div>
        <button onClick={() => setFilterMode(f => !f)} className={`ml-auto px-5 py-2 rounded-xl text-sm font-bold transition-all border flex items-center justify-center gap-2 ${filterMode ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
          <Filter size={16} /> {filterMode ? 'Close Filters' : 'Filter by Date'}
        </button>
      </div>

      {/* Date filter panel */}
      {filterMode && (
        <div className="bg-white p-5 rounded-2xl border border-black/5 shadow-sm flex flex-col sm:flex-row gap-4 items-end animate-in slide-in-from-top-4 duration-200">
          <DateInput label="Start Date" value={dateFrom} onChange={setDateFrom} />
          <DateInput label="End Date"   value={dateTo}   onChange={setDateTo}   />
          <div className="flex gap-2 w-full sm:w-auto">
            <button onClick={fetchReports} className="flex-1 sm:flex-none px-6 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg transition-colors shadow-sm">Apply Filters</button>
            <button onClick={clearFilters} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition-colors"><X size={18} /></button>
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => setDeleteConfirm(true)} className="ml-auto flex items-center justify-center gap-2 px-4 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg font-bold transition-colors w-full sm:w-auto mt-2 sm:mt-0">
              <Trash2 size={16} /> Delete Filtered Rows
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Loader2 size={32} className="animate-spin text-primary mb-4" />
            <p className="font-bold">Fetching records...</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-gray-50 text-gray-300 rounded-full flex items-center justify-center mb-3">
              <Calendar size={28} />
            </div>
            <p className="text-lg font-black text-gray-800">No records found</p>
            <p className="text-sm text-gray-500 mt-1">Try adjusting your filters or date ranges.</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left min-w-[1000px]">
              <thead className="bg-gray-50/80 border-b border-black/5">
                <tr>
                  <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Req ID / Status</th>
                  <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest">Requester</th>
                  {showStudentId && <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">User ID</th>}
                  <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest w-1/4">Items Issued</th>
                  <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Requested</th>
                  <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Approved</th>
                  <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Issued</th>
                  <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filteredRows.map((row, idx) => {
                  const reqStatus = row.request_status || row.status;
                  const validItems = (row.items || []).filter(isValidItem);

                  return (
                    <tr key={idx} className="hover:bg-primary/[0.02] transition-colors">
                      <td className="px-6 py-4 align-top">
                        <div className="font-mono text-xs font-black text-gray-500 mb-1.5">#{row.request_id || row.id}</div>
                        <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider border ${getStatusColor(reqStatus)}`}>
                          {reqStatus}
                        </span>
                      </td>

                      <td className="px-6 py-4 align-top">
                        <p className="font-bold text-gray-800 text-sm leading-tight">{row.requester_name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase inline-block mt-1 tracking-wider ${row.requester_type === 'faculty' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                          {row.requester_type}
                        </span>
                      </td>

                      {showStudentId && (
                        <td className="px-6 py-4 align-top text-xs font-bold text-gray-600">
                          {row.requester_type === 'student' ? (resolveStudentId(row) ?? '—') : '—'}
                        </td>
                      )}

                      <td className="px-6 py-4 align-top">
                        <div className="space-y-1.5">
                          {validItems.map((item, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <Package size={14} className="text-gray-400 mt-0.5 shrink-0" />
                              <div>
                                <span className="font-bold text-gray-700">{item.item_name}</span>
                                {item.barcode && <span className="ml-1.5 font-mono text-[10px] text-gray-500 bg-gray-100 px-1 rounded">[{item.barcode}]</span>}
                                <span className="ml-1.5 font-black text-primary bg-primary/10 px-1 rounded">×{getItemQty(item)}</span>
                              </div>
                            </div>
                          ))}
                          {validItems.length === 0 && (
                            <span className="text-xs text-gray-400 italic">{row.items_summary ?? 'No items listed'}</span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 align-top text-xs font-medium text-gray-600 whitespace-nowrap">
                        {resolveRequestedAt(row) ? formatDate(resolveRequestedAt(row)) : '—'}
                      </td>

                      <td className="px-6 py-4 align-top text-xs font-medium text-gray-600 whitespace-nowrap">
                        {resolveApprovedAt(row) ? formatDate(resolveApprovedAt(row)) : '—'}
                      </td>

                      <td className="px-6 py-4 align-top text-xs font-medium text-gray-600 whitespace-nowrap">
                        {resolveIssuedAt(row) ? formatDate(resolveIssuedAt(row)) : '—'}
                      </td>

                      <td className="px-6 py-4 align-top text-xs font-black text-gray-800 whitespace-nowrap">
                        {resolveReturnedAt(row) ? (
                          <div className="flex items-center gap-1.5 text-emerald-600">
                            <CheckCircle2 size={14} />
                            {formatDate(resolveReturnedAt(row))}
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={28} className="text-red-500" />
            </div>
            <h3 className="text-center text-xl font-black text-gray-900 mb-2">Delete Filtered Records?</h3>
            <p className="text-sm text-center text-gray-600 mb-6 font-medium leading-relaxed">
              This will permanently delete all displayed records
              {dateFrom && ` from ${dateFrom}`}{dateTo && ` to ${dateTo}`}
              {roleFilter !== 'all' && ` for ${roleFilter}s`}.
              <br/><span className="text-red-500 font-bold block mt-2">This action cannot be undone.</span>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-xl transition-colors">Cancel</button>
              <button onClick={handleDeleteFiltered} disabled={deleting} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />} Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}