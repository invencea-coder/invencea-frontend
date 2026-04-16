// src/pages/faculty/FacultyDashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, FileText, Clock, CalendarClock, Package, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { listRequests } from '../../api/requestAPI.js';

// ── Time Formatter ────────────────────────────────────────────────────────────
const toPHTime = (d) => {
  if (!d) return null;
  let str = typeof d === 'string' ? d : String(d);
  if (str.includes('T') && !str.endsWith('Z') && !str.includes('+') && !str.includes('-')) str += 'Z';
  return new Date(str);
};

const fmtDateTimePH = (d) => {
  if (!d) return '—';
  try {
    return toPHTime(d).toLocaleString('en-US', {
      timeZone: 'Asia/Manila', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }).replace(' at ', ', ');
  } catch { return '—'; }
};

const statusColors = {
  'PENDING':            'bg-amber-50 text-amber-800 border border-amber-200',
  'PENDING APPROVAL':   'bg-amber-50 text-amber-800 border border-amber-200',
  'APPROVED':           'bg-blue-50 text-blue-800 border border-blue-200',
  'ISSUED':             'bg-emerald-50 text-emerald-800 border border-emerald-200',
  'PARTIALLY RETURNED': 'bg-orange-50 text-orange-800 border border-orange-200',
  'RETURNED':           'bg-gray-100 text-gray-600 border border-gray-200',
  'REJECTED':           'bg-red-50 text-red-700 border border-red-200',
  'CANCELLED':          'bg-red-50 text-red-700 border border-red-200',
  'VOIDED':             'bg-red-50 text-red-700 border border-red-200',
  'EXPIRED':            'bg-orange-50 text-orange-700 border border-orange-200',
};

// ⚡ DYNAMIC EXPIRATION CHECKER
const isRequestExpired = (ev) => {
  const now = Date.now();
  if (ev.pickup_datetime) return now > new Date(ev.pickup_datetime).getTime() + 15 * 60_000;
  if (ev.scheduled_time)  return now > new Date(ev.scheduled_time).getTime() + 15 * 60_000;
  if (ev.pickup_start) {
    const e = new Date(ev.pickup_start); e.setHours(23, 59, 59, 999);
    return now > e.getTime();
  }
  if (ev.created_at) {
    const e = new Date(ev.created_at); e.setHours(23, 59, 59, 999);
    return now > e.getTime();
  }
  return false;
};

export default function FacultyDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      listRequests({ user_id: user.id })
        .then(r => setRequests(r.data.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [user]);

  const processedRequests = useMemo(() => {
    return requests.map(r => {
      let s = r.status?.toUpperCase() || 'UNKNOWN';
      // ⚡ INTERCEPT EXPIRED STATUS
      if (['PENDING', 'PENDING APPROVAL', 'APPROVED'].includes(s) && isRequestExpired(r)) {
        s = 'VOIDED';
      }
      return { ...r, status: s };
    });
  }, [requests]);

  const pending = processedRequests.filter(r => ['PENDING', 'PENDING APPROVAL'].includes(r.status)).length;
  const issued  = processedRequests.filter(r => ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status)).length;

  return (
    <div className="min-h-[calc(100vh-4rem)] relative bg-slate-50 dark:bg-darkSurface p-4 md:p-8 overflow-x-hidden z-0">
      
      {/* ⚡ PREMIUM GLASSMORPHISM BACKGROUND BLOBS ⚡ */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[100px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[40%] h-[40%] rounded-full bg-emerald-400/10 blur-[100px]" />
      </div>

      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500 relative z-10">
        
        {/* Header */}
        <div className="bg-white/70 backdrop-blur-xl p-6 rounded-3xl shadow-sm border border-white/50 flex flex-col md:flex-row justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Welcome back</p>
            <h2 className="font-display text-3xl font-black text-gray-800 tracking-tight">{user?.name}</h2>
            <p className="text-sm font-medium text-gray-500 mt-1 flex items-center gap-1.5">
              <CalendarClock size={14} className="text-primary" />
              {new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 flex flex-col items-center text-center shadow-sm hover:shadow-md transition-shadow">
            <p className="text-4xl font-black text-amber-500">{pending}</p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2">Pending</p>
          </div>
          <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 flex flex-col items-center text-center shadow-sm hover:shadow-md transition-shadow">
            <p className="text-4xl font-black text-emerald-500">{issued}</p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2">Issued</p>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => navigate('/faculty/new-request')}
            className="group bg-gradient-to-br from-primary to-primary/90 p-6 rounded-3xl shadow-md shadow-primary/20 flex flex-col items-center gap-3 hover:-translate-y-1 hover:shadow-lg transition-all duration-300"
          >
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white group-hover:scale-110 transition-transform">
              <PlusCircle size={24} />
            </div>
            <span className="text-sm font-black text-white tracking-wide">New Request</span>
          </button>

          <button 
            onClick={() => navigate('/faculty/my-requests')}
            className="group bg-white/70 backdrop-blur-xl border border-white/50 p-6 rounded-3xl shadow-sm flex flex-col items-center gap-3 hover:-translate-y-1 hover:shadow-md transition-all duration-300"
          >
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 group-hover:scale-110 group-hover:bg-primary/10 group-hover:text-primary transition-all">
              <FileText size={24} />
            </div>
            <span className="text-sm font-black text-gray-700 tracking-wide group-hover:text-primary">My Requests</span>
          </button>
        </div>

        {/* Recent Requests */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <Clock size={16} className="text-primary" />
            <h3 className="font-black text-gray-800 uppercase tracking-widest text-xs">Recent History</h3>
          </div>
          
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={32} className="animate-spin text-primary/50" /></div>
          ) : processedRequests.length === 0 ? (
            <div className="text-center py-10">
              <Package size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-bold text-gray-500">No requests yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {processedRequests.slice(0, 5).map(r => (
                <div key={r.id} className="flex items-center justify-between bg-white/50 border border-black/5 rounded-2xl p-4 transition-colors hover:border-primary/30 hover:bg-white/80">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-black text-gray-800">#{r.id}</p>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${statusColors[r.status] || 'bg-gray-100 text-gray-800'}`}>
                        {r.status}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-gray-500">{r.room_code || 'Global Room'}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">{fmtDateTimePH(r.created_at || r.requested_time)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}