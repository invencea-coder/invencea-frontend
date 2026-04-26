// src/pages/faculty/FacultyDashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, FileText, Clock, CalendarClock, Package, Loader2, AlertTriangle, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { listRequests } from '../../api/requestAPI.js';
import { fmtDateTime } from '../../utils/date.js';
import NeumorphCard from '../../components/ui/NeumorphCard.jsx';

// ── Shared Logic ──
const isRequestExpired = (req) => {
  const now = Date.now();
  const time = req.pickup_datetime || req.scheduled_time || req.pickup_start || req.created_at;
  if (!time) return false;
  return now > new Date(time).getTime() + 15 * 60_000;
};

const checkIsOverdue = (req) => {
  const s = req.status?.toUpperCase();
  if (!['ISSUED', 'PARTIALLY RETURNED'].includes(s)) return false;
  return req.return_deadline && new Date() > new Date(req.return_deadline);
};

export default function FacultyDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      listRequests({ requester_id: user.id })
        .then(r => setRequests(r.data?.data || r.data || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [user]);

  const { processedRequests, pendingCount, issuedCount, overdueCount } = useMemo(() => {
    let overdue = 0;
    const processed = requests.map(r => {
      let s = r.status?.toUpperCase() || 'UNKNOWN';
      if (['PENDING', 'PENDING APPROVAL', 'APPROVED'].includes(s) && isRequestExpired(r)) s = 'VOIDED';
      const isOverdue = checkIsOverdue(r);
      if (isOverdue) overdue++;
      return { ...r, status: s, isOverdue };
    });

    return {
      processedRequests: processed,
      pendingCount: processed.filter(r => ['PENDING', 'PENDING APPROVAL'].includes(r.status)).length,
      issuedCount: processed.filter(r => ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status)).length,
      overdueCount: overdue
    };
  }, [requests]);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative bg-slate-50 dark:bg-darkSurface p-4 md:p-8 overflow-x-hidden z-0">
      {/* Premium Glassmorphism Background */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[100px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[40%] h-[40%] rounded-full bg-emerald-400/10 blur-[100px]" />
      </div>

      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500 relative z-10">
        
        {/* Overdue Alert */}
        {overdueCount > 0 && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-3 animate-pulse shadow-sm">
            <div className="bg-red-100 text-red-600 p-2 rounded-xl mt-0.5"><AlertTriangle size={20} /></div>
            <div>
              <h3 className="text-sm font-black text-red-800 tracking-tight">Overdue Equipment Alert</h3>
              <p className="text-xs text-red-700 mt-1 font-medium">You have {overdueCount} active request(s) past the return deadline.</p>
            </div>
          </div>
        )}

        {/* Welcome Header */}
        <NeumorphCard className="p-6 bg-white/70 backdrop-blur-xl border-white/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Faculty Dashboard</p>
            <h2 className="font-display text-3xl font-black text-gray-800 tracking-tight">{user?.name}</h2>
            <p className="text-sm font-medium text-gray-500 mt-1 flex items-center justify-center md:justify-start gap-1.5">
              <CalendarClock size={14} className="text-primary" />
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </NeumorphCard>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 flex flex-col items-center text-center shadow-sm">
            <p className="text-4xl font-black text-amber-500">{pendingCount}</p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2">Waitlisted</p>
          </div>
          <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 flex flex-col items-center text-center shadow-sm">
            <p className={`text-4xl font-black ${overdueCount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{issuedCount}</p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2">Items Out</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => navigate('/faculty/new-request')} className="group bg-primary p-6 rounded-3xl shadow-md shadow-primary/20 flex flex-col items-center gap-2 hover:-translate-y-1 transition-all duration-300">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white"><PlusCircle size={24} /></div>
            <span className="text-sm font-black text-white">New Request</span>
          </button>
          <button onClick={() => navigate('/faculty/my-requests')} className="group bg-white/70 backdrop-blur-xl border border-white/50 p-6 rounded-3xl shadow-sm flex flex-col items-center gap-2 hover:-translate-y-1 transition-all duration-300">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 group-hover:text-primary group-hover:bg-primary/10 transition-all"><FileText size={24} /></div>
            <span className="text-sm font-black text-gray-700 group-hover:text-primary">History</span>
          </button>
        </div>

        {/* Recent Activity */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5 px-1">
            <Clock size={16} className="text-primary" />
            <h3 className="font-black text-gray-800 uppercase tracking-widest text-xs">Recent History</h3>
          </div>
          
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={32} className="animate-spin text-primary/50" /></div>
          ) : processedRequests.length === 0 ? (
            <div className="text-center py-10 opacity-40">
              <Package size={32} className="mx-auto mb-3" />
              <p className="text-sm font-bold">No recent requests found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {processedRequests.slice(0, 5).map(r => (
                <div key={r.id} onClick={() => navigate('/faculty/my-requests')} className={`flex items-center justify-between bg-white/50 border rounded-2xl p-4 cursor-pointer hover:bg-white transition-all ${r.isOverdue ? 'border-red-200' : 'border-black/5'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${r.isOverdue ? 'bg-red-50 text-red-500' : 'bg-primary/5 text-primary'}`}>
                      <Package size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-xs font-black text-gray-800">#{r.id}</p>
                        <span className={`px-2 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-wider border ${r.isOverdue ? 'bg-red-100 text-red-700 border-red-200' : 'bg-gray-100 text-gray-500'}`}>
                          {r.isOverdue ? 'OVERDUE' : r.status}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-gray-500 truncate max-w-[150px]">{r.purpose || 'General Use'}</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}