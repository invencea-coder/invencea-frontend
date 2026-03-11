// src/pages/admin/AdminDashboard.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, PackageCheck, Clock, AlertTriangle,
  ArrowRight, Loader2, History
} from 'lucide-react';
import RetroactiveLogModal from '../../components/admin/RetroactiveLogModal';
import { io } from 'socket.io-client';
import api from '../../api/axiosClient.js';
import { useAuth } from '../../context/AuthContext.jsx';

const statusColors = {
  'PENDING': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'PENDING APPROVAL': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'APPROVED': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'ISSUED': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'PARTIALLY RETURNED': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  'RETURNED': 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'REJECTED': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'CANCELLED': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'EXPIRED': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
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

// Row height ~57px, show 3 rows exactly, overflow scrolls smoothly
const ROW_HEIGHT = 57;
const MAX_VISIBLE = 3;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRetroModalOpen, setIsRetroModalOpen] = useState(false);

  const loadDashboardData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statsRes, recentRes] = await Promise.all([
        api.get('/admin/dashboard/stats'),
        api.get('/admin/dashboard/recent'),
      ]);
      setStats(statsRes.data?.data ?? statsRes.data);

      // Filter out records older than today (created before midnight today)
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

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Schedule a silent reload at midnight to clear yesterday's rows
  useEffect(() => {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0); // next midnight
    const msUntilMidnight = midnight - now;

    const timer = setTimeout(() => {
      loadDashboardData(true);
    }, msUntilMidnight);

    return () => clearTimeout(timer);
  }, [loadDashboardData]);

  // Real-Time Socket Listeners
  useEffect(() => {
    const socketURL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';
    const socket = io(socketURL);
    socket.on('inventory-updated', () => loadDashboardData(true));
    socket.on('request-updated',   () => loadDashboardData(true));
    socket.on('request-issued',    () => loadDashboardData(true));
    return () => socket.disconnect();
  }, [loadDashboardData]);

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

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary dark:text-darkText">
            Welcome back, {user?.name?.split(' ')[0] || 'Admin'}!
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
          className="neu-btn flex items-center gap-2 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 shadow-sm py-2.5 px-4"
        >
          <History size={18} />
          <span className="font-bold text-sm">Log Past Blackout Record</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Pending"       value={stats?.pending ?? 0}   color="text-yellow-600 dark:text-yellow-400" sub="Awaiting approval"   onClick={() => navigate('/admin/requests')} />
        <StatCard icon={PackageCheck}  label="Active Borrows" value={stats?.active ?? 0}    color="text-green-600 dark:text-green-400"  sub="Currently issued"    onClick={() => navigate('/admin/return-scanner')} />
        <StatCard icon={Clock}         label="Due Today"      value={stats?.due_today ?? 0} color="text-blue-600 dark:text-blue-400"    sub="Expected returns"    onClick={() => navigate('/admin/requests')} />
        <StatCard icon={AlertTriangle} label="Low Stock"      value={stats?.low_stock ?? 0} color="text-red-600 dark:text-red-400"      sub="Consumables ≤ 5"     onClick={() => navigate('/admin/inventory')} />
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

            {/* Scrollable body — locked to 3 rows, smooth scroll if more */}
            <div
              style={{
                maxHeight: ROW_HEIGHT * MAX_VISIBLE,
                overflowY: hasScroll ? 'auto' : 'hidden',
              }}
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
                        <p className="font-medium text-primary dark:text-darkText leading-tight">{req.requester_name}</p>
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

            {/* Scroll hint */}
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
