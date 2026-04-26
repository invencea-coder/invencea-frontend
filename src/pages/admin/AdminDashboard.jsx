// frontend/src/pages/admin/AdminDashboard.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, PackageCheck, Clock, AlertTriangle,
  ArrowRight, Loader2, History, FlaskConical, X, CalendarClock
} from 'lucide-react';
import RetroactiveLogModal from '../../components/admin/RetroactiveLogModal';
import ForceChangePasswordModal from '../../components/admin/ForceChangePasswordModal';
import { io } from 'socket.io-client';
import api from '../../api/axiosClient.js';
import { useAuth } from '../../context/AuthContext.jsx';

// ── Time helpers (Forced to Philippines Time UTC+8) ───────────────────────────
const toPHTime = (d) => {
  if (!d) return null;
  let str = typeof d === 'string' ? d : String(d);
  if (str.includes('T') && !str.endsWith('Z') && !str.includes('+') && !str.includes('-')) {
    str += 'Z';
  }
  return new Date(str);
};

const fmtDateTimePH = (d) => {
  if (!d) return '—';
  try {
    return toPHTime(d).toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short', day: 'numeric',
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
  'EXPIRED':            'bg-orange-50 text-orange-700 border border-orange-200',
};

const StatCard = ({ icon: Icon, label, value, color, sub, onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white border border-black/5 rounded-2xl p-5 flex items-center gap-4 transition-all duration-200 shadow-sm ${onClick ? 'cursor-pointer hover:scale-[1.02] hover:shadow-md hover:border-primary/20' : ''}`}
  >
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-opacity-10 ${color.replace('text-', 'bg-').replace('dark:', '')} ${color}`}>
      <Icon size={22} />
    </div>
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-black text-gray-800 mt-0.5">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-500 font-medium mt-0.5">{sub}</p>}
    </div>
  </div>
);

const ROW_HEIGHT  = 64; 
const MAX_VISIBLE = 4;

const HONORIFICS = new Set(['mr.', 'mrs.', 'ms.', 'miss', 'dr.', 'prof.', 'sr.', 'jr.']);

const getFirstName = (fullName) => {
  if (!fullName) return '';

  // 1. Strip out common titles (add any others you might use)
  const cleanName = fullName.replace(/^(Engr\.|Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.|Miss)\s+/i, '');

  // 2. Split the cleaned name by spaces and grab the first word
  return cleanName.split(' ')[0];
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats]                       = useState(null);
  const [recent, setRecent]                     = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [isRetroModalOpen, setIsRetroModalOpen] = useState(false);
  const [sessionAlerts, setSessionAlerts]       = useState([]);

  const mustResetPassword = user?.needs_password_reset === true;

  const loadDashboardData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statsRes, recentRes] = await Promise.all([
        api.get('/admin/dashboard/stats'),
        api.get('/admin/dashboard/recent'),
      ]);
      setStats(statsRes.data?.data ?? statsRes.data);

      const nowPH = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Manila"}));
      nowPH.setHours(0, 0, 0, 0);

      const allRecent = recentRes.data?.data ?? recentRes.data ?? [];
      const todayOnly = allRecent.filter((req) => {
        const ts = req.created_at || req.requested_time;
        if (!ts) return true;
        const reqPH = new Date(toPHTime(ts).toLocaleString("en-US", {timeZone: "Asia/Manila"}));
        return reqPH >= nowPH;
      });

      setRecent(todayOnly);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ⚡ SOCKET LIVE EVENTS (Strictly Room Filtered) ⚡
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socketURL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';
    const socket = io(socketURL);

    // Helper to check if a live event belongs to this admin's room
    const isMyRoom = (payload) => {
      if (!payload) return true; // generic broadcast pass
      const targetRoom = payload.room_id || payload.roomId;
      
      // If this Admin is assigned to a specific room
      if (user?.room_id) {
        // And the payload targets a SPECIFIC room that is NOT the admin's room -> Block it.
        if (targetRoom && String(targetRoom) !== String(user.room_id)) {
          return false;
        }
      }
      return true;
    };

    socket.on('inventory-updated', (payload) => { if (isMyRoom(payload)) loadDashboardData(true); });
    socket.on('request-updated',   (payload) => { if (isMyRoom(payload)) loadDashboardData(true); });
    socket.on('request-issued',    (payload) => { if (isMyRoom(payload)) loadDashboardData(true); });
    socket.on('new-request',       (payload) => { if (isMyRoom(payload)) loadDashboardData(true); });

    socket.on('admin-session-alert', (data) => {
      if (!isMyRoom(data)) return; // 🚨 IGNORE ALERTS FOR OTHER ROOMS 🚨
      
      setSessionAlerts(prev => {
        const key = `${data.session_id}-${data.type}`;
        const exists = prev.find(a => `${a.session_id}-${a.type}` === key);
        if (exists) return prev;
        return [data, ...prev].slice(0, 10);
      });
    });

    return () => socket.disconnect();
  }, [loadDashboardData, user?.room_id]); // ⚡ Ensure user?.room_id is in the dependencies

  const dismissAlert = (idx) => setSessionAlerts(prev => prev.filter((_, i) => i !== idx));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-sm font-bold text-gray-500">Loading your dashboard...</p>
      </div>
    );
  }

  const hasScroll = recent.length > MAX_VISIBLE;

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto relative">

      {mustResetPassword && <ForceChangePasswordModal />}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-black/5">
        <div>
          <h1 className="font-display text-3xl font-black text-gray-800 tracking-tight">
            Welcome back, {getFirstName(user?.name)}!
          </h1>
          <p className="text-sm text-gray-500 font-medium mt-1 flex items-center gap-1.5">
            <CalendarClock size={14} className="text-primary" />
            {new Date().toLocaleDateString('en-US', {
              timeZone: 'Asia/Manila',
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        </div>

        <button
          onClick={() => setIsRetroModalOpen(true)}
          className="flex items-center gap-3 p-4 w-full md:w-auto text-left bg-gray-50 border border-black/5 rounded-xl hover:bg-primary/5 hover:border-primary/30 transition-all group"
        >
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-primary group-hover:scale-110 transition-transform">
            <History size={18} />
          </div>
          <div className="flex flex-col pr-2">
            <span className="font-black text-sm text-gray-800 group-hover:text-primary transition-colors">
              Log Offline Borrowing
            </span>
            <span className="text-[10px] font-bold text-gray-500 mt-0.5 uppercase tracking-wider">
              Digitize paper slips
            </span>
          </div>
        </button>
      </div>

      {/* ── Lab Session Alerts ─────────────────────────────────────────────── */}
      {sessionAlerts.length > 0 && (
        <div className="space-y-2">
          {sessionAlerts.map((alert, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 p-4 rounded-2xl border animate-in slide-in-from-top-2 ${
                alert.type === 'OVERDUE'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className={`p-2 rounded-xl flex-shrink-0 ${
                alert.type === 'OVERDUE' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
              }`}>
                <FlaskConical size={18} />
              </div>

              <div className="flex-1 min-w-0">
                {alert.type === 'OVERDUE' ? (
                  <>
                    <p className="text-sm font-black text-red-800">Overdue Lab Items</p>
                    {(alert.overdue || []).map((od, i) => (
                      <p key={i} className="text-xs font-medium text-red-700 mt-0.5">
                        Session <strong>{od.code}</strong> ({od.purpose}) — {od.overdue_requests?.length || 0} student(s) have not returned items.
                      </p>
                    ))}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-black text-amber-800">Lab Session Ending Soon — {alert.code}</p>
                    <p className="text-xs font-medium text-amber-700 mt-0.5">
                      {alert.purpose} · {alert.room_name} · {alert.claimants?.length || 0} student(s) borrowed items · Return by{' '}
                      {new Date(alert.end_time).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true })}
                    </p>
                  </>
                )}
              </div>

              <button onClick={() => dismissAlert(idx)} className="text-gray-400 hover:text-gray-800 p-1 rounded transition-colors" title="Dismiss">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Pending"        value={stats?.pending ?? 0}   color="text-amber-500"  sub="Awaiting approval"  onClick={() => navigate('/admin/requests')} />
        <StatCard icon={PackageCheck}  label="Active Borrows" value={stats?.active ?? 0}    color="text-emerald-500" sub="Currently issued"   onClick={() => navigate('/admin/return-scanner')} />
        <StatCard icon={Clock}         label="Due Today"      value={stats?.due_today ?? 0} color="text-blue-500"    sub="Expected returns"   onClick={() => navigate('/admin/requests')} />
        <StatCard icon={AlertTriangle} label="Low Stock"      value={stats?.low_stock ?? 0} color="text-red-500"     sub="Consumables ≤ 5"    onClick={() => navigate('/admin/inventory')} />
      </div>

      {/* Recent Requests */}
      <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <h2 className="font-black text-gray-800 tracking-tight">Today's Live Request Feed</h2>
            {recent.length > 0 && (
              <span className="text-[10px] font-black bg-primary/10 text-primary px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                {recent.length} Active
              </span>
            )}
          </div>
          <button onClick={() => navigate('/admin/requests')} className="flex items-center gap-1.5 text-[11px] font-black text-primary hover:text-primary/70 transition-colors uppercase tracking-widest bg-primary/5 px-3 py-1.5 rounded-lg">
            View Requests Page <ArrowRight size={12} />
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <ClipboardList size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-bold text-gray-500">No requests have been logged today.</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left min-w-[800px]">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-black/5">Requester</th>
                  <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-black/5">Room</th>
                  <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-black/5">Purpose</th>
                  <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-black/5">Status</th>
                  <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-black/5">Time</th>
                </tr>
              </thead>
            </table>

            <div style={{ maxHeight: ROW_HEIGHT * MAX_VISIBLE, overflowY: hasScroll ? 'auto' : 'hidden' }} className={hasScroll ? 'custom-scrollbar' : ''}>
              <table className="w-full text-left min-w-[800px]">
                <tbody className="divide-y divide-black/5">
                  {recent.map((req) => {
                    // Safe mapping for unified database schema
                    const reqTime = req.created_at || req.requested_time;
                    const reqStatus = req.status;
                    const studentId = req.student_id || req.requester_id;
                    
                    return (
                      <tr
                        key={req.id}
                        onClick={() => navigate('/admin/requests')}
                        className="hover:bg-primary/[0.02] cursor-pointer transition-colors"
                        style={{ height: ROW_HEIGHT }}
                      >
                        <td className="px-6 py-3 w-[25%] align-middle">
                          <p className="font-bold text-gray-800 text-sm truncate" title={req.requester_name ? `${req.requester_name} (${studentId})` : studentId}>
                            {req.requester_name || studentId}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[9px] font-bold uppercase text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{req.requester_type}</span>
                            {req.requester_type === 'student' && <span className="text-[10px] font-medium text-gray-400 truncate">{studentId}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-3 w-[15%] align-middle font-bold text-gray-600 text-xs">
                          {req.room_code ?? 'Global'}
                        </td>
                        <td className="px-6 py-3 w-[25%] align-middle">
                          <p className="text-xs font-medium text-gray-600 truncate">{req.purpose ?? '—'}</p>
                        </td>
                        <td className="px-6 py-3 w-[20%] align-middle">
                          <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${statusColors[reqStatus] ?? 'bg-gray-100 text-gray-800'}`}>
                            {reqStatus}
                          </span>
                        </td>
                        <td className="px-6 py-3 w-[15%] align-middle text-gray-500 text-xs font-bold whitespace-nowrap">
                          {fmtDateTimePH(reqTime)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {hasScroll && (
              <div className="px-6 py-2 border-t border-black/5 bg-gray-50 text-center sticky bottom-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Showing {recent.length} entries — scroll to see all
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <RetroactiveLogModal
        isOpen={isRetroModalOpen}
        onClose={() => setIsRetroModalOpen(false)}
        onSuccess={() => loadDashboardData(true)}
      />
    </div>
  );
}