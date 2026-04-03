// src/pages/faculty/MyRequest.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Package, Clock, CheckCircle2, FileText, ChevronRight, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth.js';
import { listRequests } from '../../api/requestAPI.js';
import { fmtDateTime } from '../../utils/date.js';
import { QRCodeSVG } from 'qrcode.react';

const StatusBadge = ({ status }) => {
  const s = status?.toUpperCase() || 'UNKNOWN';
  const colors = {
    'PENDING':            'bg-amber-50 text-amber-800 border-amber-200',
    'PENDING APPROVAL':   'bg-amber-50 text-amber-800 border-amber-200',
    'APPROVED':           'bg-blue-50 text-blue-800 border-blue-200',
    'ISSUED':             'bg-purple-50 text-purple-800 border-purple-200',
    'PARTIALLY RETURNED': 'bg-orange-50 text-orange-800 border-orange-200',
    'RETURNED':           'bg-emerald-50 text-emerald-800 border-emerald-200',
    'REJECTED':           'bg-red-50 text-red-800 border-red-200',
    'CANCELLED':          'bg-red-50 text-red-800 border-red-200',
    'EXPIRED':            'bg-gray-100 text-gray-600 border-gray-300',
    'EXPIRED (VOID)':     'bg-gray-100 text-gray-600 border-gray-300',
  };
  const colorClass = colors[s] || 'bg-gray-100 text-gray-800 border-gray-200';
  return <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${colorClass}`}>{s}</span>;
};

export default function MyRequest() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [activeTab, setActiveTab] = useState('active');

  useEffect(() => {
    if (user?.id) {
      listRequests({ requester_id: user.id })
        .then(r => setRequests(r.data?.data ?? r.data ?? []))
        .catch(() => toast.error('Failed to load request history'))
        .finally(() => setLoading(false));
    }
  }, [user?.id]);

  const activeRequests = useMemo(() => {
    return requests.filter(r => 
      ['PENDING', 'PENDING APPROVAL', 'APPROVED', 'ISSUED', 'PARTIALLY RETURNED'].includes(r.status?.toUpperCase())
    );
  }, [requests]);

  const historyRequests = useMemo(() => {
    return requests.filter(r => 
      ['RETURNED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'EXPIRED (VOID)'].includes(r.status?.toUpperCase())
    );
  }, [requests]);

  const displayedRequests = activeTab === 'active' ? activeRequests : historyRequests;

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
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-800 tracking-tight mb-1">Request History</h1>
            <p className="text-sm font-medium text-gray-500">View all your past and current equipment requests.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-black/10 px-2">
          <button 
            onClick={() => setActiveTab('active')} 
            className={`pb-3 text-sm font-black tracking-wide transition-all ${activeTab === 'active' ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-gray-700'}`}
          >
            Active Requests
          </button>
          <button 
            onClick={() => setActiveTab('history')} 
            className={`pb-3 text-sm font-black tracking-wide transition-all ${activeTab === 'history' ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-gray-700'}`}
          >
            History
          </button>
        </div>

        {/* List Container */}
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-sm border border-white/50 overflow-hidden">
          {loading ? (
            <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-primary/50" size={40}/></div>
          ) : displayedRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <FileText size={56} className="mb-4 text-gray-300" />
              <p className="text-lg font-black text-gray-700 mb-1">No {activeTab === 'active' ? 'Active' : 'Past'} Requests</p>
              <p className="text-sm font-medium text-gray-500">
                {activeTab === 'active' 
                  ? "You don't have any active or pending requests right now."
                  : "You don't have any returned, expired, or cancelled requests."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {displayedRequests.map(req => (
                <div
                  key={req.id}
                  onClick={() => setSelectedRequest(req)}
                  className="p-5 hover:bg-white/60 transition-colors cursor-pointer group flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner flex-shrink-0 bg-white border border-black/5 text-gray-500 group-hover:scale-105 group-hover:text-primary transition-all">
                      {req.status === 'RETURNED' ? <CheckCircle2 size={24} className="text-emerald-500" /> : <Package size={24} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-mono text-[10px] font-black text-gray-400 uppercase tracking-widest">#{req.id}</span>
                        <StatusBadge status={req.status} />
                      </div>
                      <p className="font-black text-gray-800 text-lg group-hover:text-primary transition-colors">{req.purpose || 'General Request'}</p>
                      <p className="text-xs font-medium text-gray-500 mt-1 flex items-center gap-1.5">
                        <Clock size={12} className="text-gray-400" /> {fmtDateTime(req.requested_time || req.created_at)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto mt-2 md:mt-0 pl-18 md:pl-0">
                    <div className="text-left md:text-right">
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black mb-0.5">Items</p>
                      <p className="text-sm font-black text-primary bg-primary/10 px-3 py-1 rounded-lg">{req.items?.length || 0} borrowed</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center group-hover:bg-primary/10 border border-black/5 transition-colors">
                      <ChevronRight size={20} className="text-gray-400 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- Request Details Modal --- */}
        {selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white/90 backdrop-blur-2xl w-full max-w-lg relative overflow-hidden rounded-3xl border border-white/50 shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
              
              <div className="bg-white/50 p-6 border-b border-black/5 flex justify-between items-center flex-shrink-0">
                <div>
                  <h3 className="font-black text-gray-800 text-xl tracking-tight">#{selectedRequest.id}</h3>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">{selectedRequest.purpose || 'General Request'}</p>
                </div>
                <button onClick={() => setSelectedRequest(null)} className="p-2 bg-white rounded-full text-gray-400 hover:text-red-500 shadow-sm border border-black/5 transition-all hover:scale-110">
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-black/5 shadow-sm">
                  <span className="text-gray-500 font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                    <Clock size={14}/> Status
                  </span>
                  <StatusBadge status={selectedRequest.status} />
                </div>

                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Package size={14} /> Requested Items
                  </p>
                  <div className="space-y-2">
                    {selectedRequest.items?.map((item, idx) => {
                      const isReturned = item.status === 'RETURNED' || item.item_status === 'RETURNED';
                      const displayAssignee = (item.assigned_to === 'Shared Group' || item.assigned_to === 'Shared') ? 'Requester' : item.assigned_to;

                      return (
                        <div key={idx} className={`flex justify-between items-center p-3 rounded-2xl border transition-colors ${isReturned ? 'bg-emerald-50/50 border-emerald-100' : 'bg-white border-black/5 shadow-sm'}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner flex-shrink-0 ${isReturned ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-50 text-gray-400'}`}>
                              {isReturned ? <CheckCircle2 size={18} /> : <Package size={18} />}
                            </div>
                            <div className="min-w-0 pr-2">
                              <span className={`font-black text-sm truncate block ${isReturned ? 'text-emerald-900 line-through opacity-60' : 'text-gray-800'}`}>
                                {item.item_name}
                              </span>
                              {displayAssignee && displayAssignee !== 'Requester' && (
                                <p className="text-[10px] font-bold text-gray-400 mt-0.5 truncate">Assigned: {displayAssignee}</p>
                              )}
                            </div>
                          </div>
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-black border flex-shrink-0 ${isReturned ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-black/5 text-gray-600'}`}>
                            ×{item.quantity || item.qty_requested || 1}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {['PENDING', 'APPROVED'].includes(selectedRequest.status?.toUpperCase()) && selectedRequest.qr_code && (
                  <div className="mt-6 flex flex-col items-center justify-center p-6 border-2 border-dashed border-black/10 rounded-3xl bg-white/50 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none group-hover:bg-primary/10 transition-colors" />
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 relative z-10">Your Request QR Code</p>
                    <div className="p-3 bg-white rounded-2xl shadow-sm border border-black/5 relative z-10 group-hover:scale-105 transition-transform duration-300">
                      <QRCodeSVG value={selectedRequest.qr_code} size={160} level="M" />
                    </div>
                    <p className="text-[11px] font-medium text-gray-500 mt-4 text-center relative z-10 max-w-[200px] leading-relaxed">
                      Present this QR code at the counter to claim your items.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-black/5 flex-shrink-0 bg-white/50">
                <button onClick={() => setSelectedRequest(null)} className="w-full bg-primary hover:bg-primary/90 text-white py-4 rounded-2xl font-black tracking-wide shadow-md shadow-primary/20 transition-all">
                  Close Details
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}