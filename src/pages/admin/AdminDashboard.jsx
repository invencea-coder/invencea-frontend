// frontend/src/pages/admin/AdminDashboard.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, PackageCheck, Clock, AlertTriangle,
  ArrowRight, Loader2, History, FlaskConical, X,
} from 'lucide-react';
import RetroactiveLogModal from '../../components/admin/RetroactiveLogModal';
import ForceChangePasswordModal from '../../components/admin/ForceChangePasswordModal';
import { io } from 'socket.io-client';
import api from '../../api/axiosClient.js';
import { useAuth } from '../../context/AuthContext.jsx';

const statusColors = {
  'PENDING':            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'PENDING APPROVAL':   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'APPROVED':           'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'ISSUED':             'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'PARTIALLY RETURNED': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  'RETURNED':           'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'REJECTED':           'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'CANCELLED':          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'EXPIRED':            'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

const StatCard = ({ icon: Icon, label, value, color, sub, onClick }) => (
  <div
    onClick={onClick}
    className={`neu-card p-5 flex items-center gap-4 transition-all duration-200 ${onClick ? 'cursor-pointer hover:scale-[1.02] hover:shadow-lg' : ''}`}
  >
    <div className={`neu-card-sm w-12 h-12 flex items-center justify-center flex-shrink-0 ${color}`}>
      <Icon size={22} />
    </div>
    <div>
      <p className="text-xs text-muted dark:text-darkMuted uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-primary dark:text-darkText font-display">{value ?? '—'}</p>
      {sub && <p className="text-xs text-muted dark:text-darkMuted mt-0.5">{sub}</p>}
    </div>
  </div>
);

const ROW_HEIGHT  = 57;
const MAX_VISIBLE = 3;

const HONORIFICS = new Set(['mr.', 'mrs.', 'ms.', 'miss', 'dr.', 'prof.', 'sr.', 'jr.']);

function getFirstName(fullName) {
  if (!fullName) return 'Admin';
  const parts = fullName.trim().split(/\s+/);
  for (const part of parts) {
    if (!HONORIFICS.has(part.toLowerCase())) return part;
  }
  return parts[parts.length - 1] || 'Admin';
}

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

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const allRecent = recentRes.data?.data ?? recentRes.data ?? [];
      const todayOnly = allRecent.filter((req) => {
        const ts = req.requested_time || req.created_at;
        return ts ? new Date(ts) >= todayStart : true;
      });

      setRecent(todayOnly);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  // Midnight reload
  useEffect(() => {
    const now      = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(() => loadDashboardData(true), midnight - now);
    return () => clearTimeout(timer);
  }, [loadDashboardData]);

  // Socket listeners — extended with lab session alerts
  useEffect(() => {
    const socketURL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';
    const socket = io(socketURL);

    socket.on('inventory-updated', () => loadDashboardData(true));
    socket.on('request-updated',   () => loadDashboardData(true));
    socket.on('request-issued',    () => loadDashboardData(true));

    socket.on('admin-session-alert', (data) => {
      setSessionAlerts(prev => {
        // Deduplicate by session_id + type
        const key = `${data.session_id}-${data.type}`;
        const exists = prev.find(a => `${a.session_id}-${a.type}` === key);
        if (exists) return prev;
        return [data, ...prev].slice(0, 10);
      });
    });

    return () => socket.disconnect();
  }, [loadDashboardData]);

  const dismissAlert = (idx) => setSessionAlerts(prev => prev.filter((_, i) => i !== idx));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  const hasScroll = recent.length > MAX_VISIBLE;

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto relative">

      {mustResetPassword && <ForceChangePasswordModal />}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary dark:text-darkText">
            Welcome back, {getFirstName(user?.name)}!
          </h1>
          <p className="text-sm text-muted dark:text-darkMuted mt-1">
            Here is your inventory overview for{' '}
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        </div>

        <button
          onClick={() => setIsRetroModalOpen(true)}
          className="flex items-start gap-3 p-4 w-full md:w-auto text-left bg-surface border border-black/10 rounded-xl hover:border-primary/30 hover:shadow-md transition-all group"
        >
          <div className="mt-0.5 text-primary opacity-80 group-hover:opacity-100 transition-opacity">
            <History size={20} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-gray-800 group-hover:text-primary transition-colors">
              Log Manual Borrowing
            </span>
            <span className="text-xs text-muted mt-0.5 leading-relaxed">
              Did someone borrow items while the internet was down? Enter the{' '}
              <span className="text-blue-800 font-bold">Borrower's slip</span> here.
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
              className={`flex items-start gap-3 p-4 rounded-2xl border animate-fade-in ${
                alert.type === 'OVERDUE'
                  ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                  : 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'
              }`}
            >
              <div className={`p-2 rounded-xl flex-shrink-0 ${
                alert.type === 'OVERDUE'
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
              }`}>
                <FlaskConical size={18} />
              </div>

              <div className="flex-1 min-w-0">
                {alert.type === 'OVERDUE' ? (
                  <>
                    <p className="text-sm font-bold text-red-800 dark:text-red-300">
                      Overdue Lab Items
                    </p>
                    {(alert.overdue || []).map((od, i) => (
                      <p key={i} className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                        Session <strong>{od.code}</strong> ({od.purpose}) —{' '}
                        {od.overdue_requests?.length || 0} student(s) have not returned items
                      </p>
                    ))}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                      Lab Session Ending Soon — {alert.code}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      {alert.purpose} · {alert.room_name} ·{' '}
                      {alert.claimants?.length || 0} student(s) borrowed items · Return by{' '}
                      {new Date(alert.end_time).toLocaleTimeString('en-PH', {
                        hour: '2-digit', minute: '2-digit', hour12: true,
                      })}
                    </p>
                  </>
                )}
              </div>

              <button
                onClick={() => dismissAlert(idx)}
                className="text-muted hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 p-1 rounded transition-colors"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Pending"        value={stats?.pending ?? 0}   color="text-yellow-600 dark:text-yellow-400" sub="Awaiting approval"  onClick={() => navigate('/admin/requests')} />
        <StatCard icon={PackageCheck}  label="Active Borrows" value={stats?.active ?? 0}    color="text-green-600 dark:text-green-400"  sub="Currently issued"   onClick={() => navigate('/admin/return-scanner')} />
        <StatCard icon={Clock}         label="Due Today"      value={stats?.due_today ?? 0} color="text-blue-600 dark:text-blue-400"    sub="Expected returns"   onClick={() => navigate('/admin/requests')} />
        <StatCard icon={AlertTriangle} label="Low Stock"      value={stats?.low_stock ?? 0} color="text-red-600 dark:text-red-400"      sub="Consumables ≤ 5"    onClick={() => navigate('/admin/inventory')} />
      </div>

      {/* Recent Requests */}
      <div className="neu-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/5 bg-black/[0.01]">
          <div className="flex items-center gap-2">
            <h2 className="font-display font-semibold text-primary dark:text-darkText">Live Request Feed</h2>
            {recent.length > 0 && (
              <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {recent.length} today
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/admin/requests')}
            className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/70 transition-colors uppercase tracking-wider"
          >
            View Triage <ArrowRight size={14} />
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted dark:text-darkMuted">
            No requests logged today.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-black/[0.02] dark:bg-white/[0.03]">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">Requester</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">Room</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">Purpose</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide">Requested</th>
                </tr>
              </thead>
            </table>

            <div
              style={{ maxHeight: ROW_HEIGHT * MAX_VISIBLE, overflowY: hasScroll ? 'auto' : 'hidden' }}
              className={hasScroll ? 'custom-scrollbar' : ''}
            >
              <table className="w-full text-sm">
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {recent.map((req) => (
                    <tr
                      key={req.id}
                      onClick={() => navigate('/admin/requests')}
                      className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <td className="px-6 py-3 w-[22%]">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-primary dark:text-darkText leading-tight">{req.requester_name}</p>
                          {req.lab_session_id && (
                            <span title="Lab Session Request">
                              <FlaskConical size={12} className="text-emerald-500 flex-shrink-0" />
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] uppercase font-bold text-muted dark:text-darkMuted mt-0.5">{req.requester_type}</p>
                      </td>
                      <td className="px-6 py-3 w-[15%] font-medium text-gray-700 dark:text-gray-300">{req.room_code ?? '—'}</td>
                      <td className="px-6 py-3 w-[28%] text-muted dark:text-darkMuted max-w-[200px] truncate">{req.purpose ?? '—'}</td>
                      <td className="px-6 py-3 w-[20%]">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-black/5 shadow-sm ${statusColors[req.status] ?? 'bg-gray-100 text-gray-800'}`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 w-[15%] text-muted dark:text-darkMuted text-xs font-medium whitespace-nowrap">
                        {req.requested_time
                          ? new Date(req.requested_time).toLocaleString('en-US', {
                              month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasScroll && (
              <div className="px-6 py-2 border-t border-black/5 dark:border-white/5 bg-black/[0.01] text-center">
                <p className="text-[10px] text-muted dark:text-darkMuted">
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
