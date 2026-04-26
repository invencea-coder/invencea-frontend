// src/pages/faculty/FacultyDashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, FileText, QrCode, AlertTriangle, Clock, Package, CheckCircle2, XCircle, Barcode, ChevronRight, Loader2, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../api/axiosClient.js';
import { listRequests } from '../../api/requestAPI.js';
import { fmtDateTime } from '../../utils/date.js';
import NeumorphCard from '../../components/ui/NeumorphCard.jsx';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';
import NeumorphModal from '../../components/ui/NeumorphModal.jsx';

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

const getStatusBadge = (status) => {
  const s = status?.toUpperCase() || 'UNKNOWN';
  switch (s) {
    case 'APPROVED':           return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'ISSUED':             return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'PARTIALLY RETURNED': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'PENDING':
    case 'PENDING APPROVAL':   return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'RETURNED':           return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'REJECTED':
    case 'CANCELLED':          
    case 'EXPIRED':
    case 'VOIDED':
    case 'EXPIRED (VOID)':     return 'bg-red-100 text-red-700 border-red-200';
    default:                   return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

export default function FacultyDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const loadRequests = () => {
    if (user?.id) {
      listRequests({ requester_id: user.id })
        .then(r => setRequests(r.data?.data || r.data || []))
        .catch(() => toast.error("Could not load your requests."))
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => { loadRequests(); }, [user]);

  const { activeRequests, history, overdueCount, pendingCount, issuedCount } = useMemo(() => {
    const active = [];
    const hist = [];
    let overdue = 0;

    requests.forEach(req => {
      let s = req.status?.toUpperCase();
      
      if (['PENDING', 'PENDING APPROVAL', 'APPROVED'].includes(s) && isRequestExpired(req)) {
        s = 'VOIDED'; 
      }

      if (s === 'EXPIRED') s = 'EXPIRED (VOID)';

      const isOverdue = checkIsOverdue(req);
      if (isOverdue) overdue++;

      if (['PENDING', 'PENDING APPROVAL', 'APPROVED', 'ISSUED', 'PARTIALLY RETURNED'].includes(s)) {
        active.push({ ...req, status: s, isOverdue });
      } else {
        hist.push({ ...req, status: s });
      }
    });

    active.sort((a, b) => {
      const aStat = a.status?.toUpperCase();
      const bStat = b.status?.toUpperCase();
      if (aStat === 'APPROVED' && bStat !== 'APPROVED') return -1;
      if (bStat === 'APPROVED' && aStat !== 'APPROVED') return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return { 
      activeRequests: active, 
      history: hist, 
      overdueCount: overdue,
      // ⚡ FIX: Added 'APPROVED' to the pending counter
      pendingCount: active.filter(r => ['PENDING', 'PENDING APPROVAL', 'APPROVED'].includes(r.status)).length,
      issuedCount: active.filter(r => ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status)).length
    };
  }, [requests]);

  const handleCancelRequest = async (id) => {
    if (!window.confirm("Are you sure you want to cancel this request?")) return;
    setCancelling(true);
    try {
      await api.put(`/requests/${id}/cancel`);
      toast.success("Request cancelled successfully.");
      setSelectedTicket(null);
      loadRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to cancel request.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] relative bg-slate-50 dark:bg-darkSurface p-4 md:p-8 overflow-x-hidden z-0 pb-20 md:pb-8">
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[100px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[40%] h-[40%] rounded-full bg-emerald-400/10 blur-[100px]" />
      </div>

      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500 relative z-10">
        
        {overdueCount > 0 && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-3 animate-pulse shadow-sm">
            <div className="bg-red-100 text-red-600 p-2 rounded-xl mt-0.5"><AlertTriangle size={20} /></div>
            <div>
              <h3 className="text-sm font-black text-red-800 tracking-tight">Overdue Equipment Alert</h3>
              <p className="text-xs text-red-700 mt-1 font-medium">You have {overdueCount} active request(s) past the return deadline. Please return the equipment to the administration counter immediately.</p>
            </div>
          </div>
        )}

        <NeumorphCard className="p-6 bg-white/70 backdrop-blur-xl border-white/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Faculty Dashboard</p>
            <h2 className="font-display text-3xl font-black text-gray-800 tracking-tight">Prof. {user?.name?.split(' ').pop()}</h2>
            <p className="text-sm font-medium text-gray-500 mt-1 flex items-center justify-center md:justify-start gap-1.5">
              <CalendarClock size={14} className="text-primary" />
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </NeumorphCard>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 flex flex-col items-center text-center shadow-sm">
            <p className="text-4xl font-black text-amber-500">{pendingCount}</p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2">Reserved</p>
          </div>
          <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 flex flex-col items-center text-center shadow-sm">
            <p className={`text-4xl font-black ${overdueCount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{issuedCount}</p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2">Active</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => navigate('/faculty/new-request')} className="group bg-primary p-6 rounded-3xl shadow-md shadow-primary/20 flex flex-col items-center gap-2 transition-all hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white"><PlusCircle size={24} /></div>
            <span className="text-sm font-black text-white">New Request</span>
          </button>
          <button onClick={() => navigate('/faculty/my-requests')} className="group bg-white/70 backdrop-blur-xl border border-white/50 p-6 rounded-3xl flex flex-col items-center gap-2 shadow-sm transition-all hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 group-hover:text-primary group-hover:bg-primary/10 transition-all"><FileText size={24} /></div>
            <span className="text-sm font-black text-gray-700 group-hover:text-primary">History</span>
          </button>
        </div>

        <div className="space-y-3">
          <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
            <Clock size={14} /> Active Activity
          </h3>

          {loading ? (
            <div className="flex justify-center py-10 bg-white/70 backdrop-blur-xl rounded-3xl border border-white/50 shadow-sm"><Loader2 className="animate-spin text-primary/50" size={32} /></div>
          ) : activeRequests.length === 0 ? (
            <NeumorphCard className="p-8 text-center bg-white/70 backdrop-blur-xl border-white/50 shadow-sm">
              <CheckCircle2 size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-bold text-gray-600">No active requests.</p>
              <p className="text-xs text-gray-400 mt-1">You are all caught up! Tap 'New Request' to borrow equipment.</p>
            </NeumorphCard>
          ) : (
            <div className="space-y-3">
              {activeRequests.map(r => {
                const s = r.status?.toUpperCase();
                return (
                <div key={r.id} className={`p-4 rounded-2xl border bg-white/90 backdrop-blur-xl shadow-sm transition-all ${r.isOverdue ? 'border-red-300 shadow-red-500/10' : s === 'APPROVED' ? 'border-emerald-300 shadow-emerald-500/10' : 'border-black/5'}`}>
                  
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className={`inline-block px-2 py-0.5 text-[9px] font-black rounded uppercase tracking-wider border ${getStatusBadge(r.isOverdue ? 'EXPIRED' : s)}`}>
                        {r.isOverdue ? 'OVERDUE' : s}
                      </span>
                      <p className="text-sm font-black text-gray-800 mt-2">{r.purpose || 'General Use'}</p>
                      <p className="text-xs font-medium text-gray-500 mt-0.5">#{r.id} • {r.items?.length || 0} items</p>
                    </div>
                    
                    {['PENDING', 'PENDING APPROVAL', 'APPROVED', 'ISSUED', 'PARTIALLY RETURNED'].includes(s) && (
                      <button onClick={() => setSelectedTicket(r)} className="flex flex-col items-center justify-center p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200 transition-colors shadow-sm">
                        <QrCode size={20} className="mb-1" />
                        <span className="text-[9px] font-black uppercase tracking-wider">Details</span>
                      </button>
                    )}
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3 border border-black/5">
                    {s === 'PENDING' || s === 'PENDING APPROVAL' ? (
                      <p className="text-xs font-bold text-gray-600 flex items-center gap-1.5"><Clock size={12}/> Waiting for Admin Approval...</p>
                    ) : s === 'APPROVED' ? (
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Pickup Window</p>
                        <p className="text-xs font-bold text-emerald-700">
                          {r.pickup_start ? `${fmtDateTime(r.pickup_start)}` : r.pickup_datetime ? fmtDateTime(r.pickup_datetime) : 'Ready for walk-in pickup'}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Return Deadline</p>
                        <p className={`text-xs font-bold flex items-center gap-1.5 ${r.isOverdue ? 'text-red-600' : 'text-blue-700'}`}>
                          {r.isOverdue && <AlertTriangle size={12} />}
                          {r.return_deadline ? fmtDateTime(r.return_deadline) : 'End of Day'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div className="space-y-3 pt-4">
            <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
              <Package size={14} /> History
            </h3>
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-sm overflow-hidden">
              {history.slice(0, 3).map((r, idx) => (
                <div key={r.id} className={`p-4 flex items-center justify-between ${idx !== 0 ? 'border-t border-black/5' : ''}`}>
                  <div>
                    <p className="text-sm font-black text-gray-800">{r.purpose || 'General Use'}</p>
                    <p className="text-[10px] font-medium text-gray-500 mt-0.5">{fmtDateTime(r.created_at)}</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`px-2 py-0.5 text-[9px] font-black rounded uppercase tracking-wider border ${getStatusBadge(r.status)}`}>{r.status?.toUpperCase() || 'UNKNOWN'}</span>
                    <span className="text-[10px] font-mono text-gray-400 mt-1">#{r.id}</span>
                  </div>
                </div>
              ))}
              <button onClick={() => navigate('/faculty/my-requests')} className="w-full p-3 text-xs font-bold text-primary bg-gray-50/50 hover:bg-gray-100 transition-colors border-t border-black/5 flex justify-center items-center gap-1">
                View All History <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ticket Detail Modal */}
      <NeumorphModal open={!!selectedTicket} onClose={() => setSelectedTicket(null)} title={`Request #${selectedTicket?.id}`} size="md">
        {selectedTicket && (
          <div className="space-y-4 flex flex-col items-center">
            <div className="p-4 bg-white border border-black/10 rounded-2xl shadow-sm inline-block">
              <QRCodeSVG value={selectedTicket.qr_code || String(selectedTicket.id)} size={160} />
            </div>
            
            <div className="w-full text-left mt-2 border-t border-black/5 pt-4">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Package size={14} /> Requested Items
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {selectedTicket.items?.map((it, i) => (
                  <div key={i} className="flex justify-between items-start p-3 bg-gray-50 rounded-xl border border-black/5">
                    <div>
                      <p className="text-xs font-bold text-gray-800 leading-snug">{it.item_name}</p>
                      {(it.inventory_item_barcode || it.stock_barcode || it.consumable_barcode || it.barcode) && (
                        <p className="text-[10px] font-mono text-gray-500 mt-1 flex items-center gap-1">
                          <Barcode size={10} /> {it.inventory_item_barcode || it.stock_barcode || it.consumable_barcode || it.barcode}
                        </p>
                      )}
                      {it.item_status && (
                        <span className={`text-[9px] font-bold uppercase mt-1.5 inline-block px-1.5 py-0.5 rounded ${['EXPIRED', 'REJECTED', 'CANCELLED', 'VOIDED'].includes(it.item_status) ? 'bg-red-100 text-red-600' : it.item_status === 'RETURNED' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                          {it.item_status}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded-md shrink-0 ml-2">
                      ×{it.qty_requested || it.quantity}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full pt-4 flex gap-3 border-t border-black/5">
              {['PENDING', 'PENDING APPROVAL', 'APPROVED'].includes(selectedTicket.status?.toUpperCase()) && (
                <NeumorphButton
                  variant="outline"
                  className="flex-1 py-3 font-bold text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200 transition-colors"
                  onClick={() => handleCancelRequest(selectedTicket.id)}
                  loading={cancelling}
                >
                  <XCircle size={16} className="mr-1.5" /> Cancel Request
                </NeumorphButton>
              )}
              <NeumorphButton variant="primary" className="flex-1 py-3 font-bold shadow-md shadow-primary/20" onClick={() => setSelectedTicket(null)}>
                Close Details
              </NeumorphButton>
            </div>
          </div>
        )}
      </NeumorphModal>
    </div>
  );
}