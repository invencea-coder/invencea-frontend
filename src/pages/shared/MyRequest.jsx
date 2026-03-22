// src/pages/shared/MyRequests.jsx
import React, { useState, useEffect } from 'react';
import { Package, Clock, CheckCircle2, FileText, ChevronRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import { listRequests } from '../../api/requestAPI';
import NeumorphCard from '../../components/ui/NeumorphCard';
import NeumorphModal from '../../components/ui/NeumorphModal';
import NeumorphButton from '../../components/ui/NeumorphButton';
import { statusColor } from '../../utils/format';
import { fmtDateTime } from '../../utils/date';
import { QRCodeSVG } from 'qrcode.react';

export default function MyRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);

  useEffect(() => {
    if (user?.id) {
      listRequests({ user_id: user.id })
        .then(r => setRequests(r.data.data))
        .catch(() => toast.error('Failed to load request history'))
        .finally(() => setLoading(false));
    }
  }, [user]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-display mb-2">Request History</h1>
          <p className="text-muted">View all your past and current equipment requests.</p>
        </div>
      </div>

      <NeumorphCard className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-primary" size={32}/></div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted">
            <FileText size={48} className="mb-4 opacity-20" />
            <p className="text-lg font-bold text-gray-700 mb-1">No Requests Found</p>
            <p className="text-sm">You haven't made any equipment requests yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-black/5">
            {requests.map(req => (
              <div 
                key={req.id} 
                onClick={() => setSelectedRequest(req)}
                className="p-4 hover:bg-black/[0.01] transition-colors cursor-pointer group flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner flex-shrink-0 ${statusColor(req.status)}`}>
                    {req.status === 'RETURNED' ? <CheckCircle2 size={24} /> : <Package size={24} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">#{req.id}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shadow-sm ${statusColor(req.status)}`}>{req.status}</span>
                    </div>
                    <p className="font-bold text-gray-800 text-lg">{req.purpose || 'General Request'}</p>
                    <p className="text-xs text-muted mt-1 flex items-center gap-1"><Clock size={12} /> {fmtDateTime(req.requested_time)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto mt-2 md:mt-0 pl-16 md:pl-0">
                  <div className="text-left md:text-right">
                    <p className="text-xs text-muted uppercase tracking-widest font-bold mb-0.5">Items</p>
                    <p className="text-sm font-bold text-primary">{req.items?.length || 0} borrowed</p>
                  </div>
                  <ChevronRight size={20} className="text-muted group-hover:text-primary transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </NeumorphCard>

      {/* --- Request Details Modal --- */}
      <NeumorphModal open={!!selectedRequest} onClose={() => setSelectedRequest(null)} title={`Request Details #${selectedRequest?.id}`}>
        {selectedRequest && (
          <div className="space-y-6 mt-4 p-2">
            
            <div className="flex justify-between items-center bg-black/[0.02] p-4 rounded-xl border border-black/5">
              <span className="text-muted font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                <Clock size={16}/> Status
              </span>
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm ${statusColor(selectedRequest.status)}`}>
                {selectedRequest.status}
              </span>
            </div>

            <div>
              <p className="text-xs font-bold text-muted uppercase mb-2 tracking-wider flex items-center gap-1">
                <Package size={14} /> Requested Items
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                {selectedRequest.items?.map((item, idx) => {
                  const isReturned = item.status === 'RETURNED';
                  const displayAssignee = (item.assigned_to === 'Shared Group' || item.assigned_to === 'Shared') ? 'Requester' : item.assigned_to;
                  
                  return (
                    <div key={idx} className={`flex justify-between items-center p-3 rounded-xl border transition-colors ${isReturned ? 'bg-emerald-50 border-emerald-100' : 'bg-black/[0.02] border-black/5'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${isReturned ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-muted'}`}>
                          {isReturned ? <CheckCircle2 size={16} /> : <Package size={16} />}
                        </div>
                        <div>
                          <span className={`font-bold text-sm ${isReturned ? 'text-emerald-900 line-through opacity-70' : 'text-gray-800'}`}>
                            {item.item_name}
                          </span>
                          {displayAssignee && displayAssignee !== 'Requester' && (
                            <p className="text-[10px] font-bold text-muted mt-0.5">Assigned to: {displayAssignee}</p>
                          )}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-bold border ${isReturned ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-white border-black/10 text-primary shadow-sm'}`}>
                        x{item.quantity}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Show QR Code if it's Pending or Approved so they can scan it at the desk */}
            {['PENDING', 'APPROVED'].includes(selectedRequest.status) && selectedRequest.qr_code && (
              <div className="mt-6 flex flex-col items-center justify-center p-6 border-2 border-dashed border-black/10 rounded-2xl bg-black/[0.02]">
                <p className="text-xs font-bold text-muted uppercase tracking-widest mb-4">Your Request QR Code</p>
                <div className="p-3 bg-white rounded-xl shadow-sm">
                  <QRCodeSVG value={selectedRequest.qr_code} size={150} />
                </div>
                <p className="text-[11px] text-muted mt-4 text-center">Present this QR code at the counter to claim your items.</p>
              </div>
            )}

            <div className="pt-4 border-t border-black/5 flex justify-end">
               <NeumorphButton variant="outline" onClick={() => setSelectedRequest(null)}>Close</NeumorphButton>
            </div>
          </div>
        )}
      </NeumorphModal>
    </div>
  );
}