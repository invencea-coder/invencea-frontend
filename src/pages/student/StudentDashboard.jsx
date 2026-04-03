// src/pages/student/StudentDashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, FileText, KeyRound, QrCode, AlertTriangle, Clock, Package, CheckCircle2, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext.jsx';
import { listRequests } from '../../api/requestAPI.js';
import { changeStudentPin } from '../../api/authAPI.js';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';
import NeumorphModal from '../../components/ui/NeumorphModal.jsx';
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatDate = (dateString) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString('en-US', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

const getStatusBadge = (status) => {
  switch (status) {
    case 'APPROVED':           return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'ISSUED':             return 'bg-purple-50 text-purple-800 border-purple-200';
    case 'PARTIALLY RETURNED': return 'bg-orange-50 text-orange-800 border-orange-200';
    case 'PENDING':
    case 'PENDING APPROVAL':   return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'RETURNED':           return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'REJECTED':
    case 'CANCELLED':          return 'bg-red-50 text-red-800 border-red-200';
    default:                   return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinForm, setPinForm] = useState({ current_pin: '', new_pin: '', confirm_pin: '' });
  const [changingPin, setChangingPin] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  useEffect(() => {
    listRequests({})
      .then(r => setRequests(r.data?.data || r.data || []))
      .catch(() => toast.error("Could not load your requests."))
      .finally(() => setLoading(false));
  }, []);

  const { activeRequests, history, overdueCount } = useMemo(() => {
    const active = [];
    const hist = [];
    let overdue = 0;
    const now = new Date();

    requests.forEach(req => {
      const isOverdue = req.status === 'ISSUED' && req.return_deadline && new Date(req.return_deadline) < now;
      if (isOverdue) overdue++;

      if (['PENDING', 'PENDING APPROVAL', 'APPROVED', 'ISSUED', 'PARTIALLY RETURNED'].includes(req.status)) {
        active.push({ ...req, isOverdue });
      } else {
        hist.push(req);
      }
    });

    active.sort((a, b) => {
      if (a.status === 'APPROVED' && b.status !== 'APPROVED') return -1;
      if (b.status === 'APPROVED' && a.status !== 'APPROVED') return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return { activeRequests: active, history: hist, overdueCount: overdue };
  }, [requests]);

  const handlePinChangeInput = (field, value) => {
    const onlyNums = value.replace(/\D/g, '');
    if (onlyNums.length <= 4) setPinForm({ ...pinForm, [field]: onlyNums });
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    if (pinForm.new_pin.length !== 4) return toast.error('New PIN must be exactly 4 digits.');
    if (pinForm.new_pin !== pinForm.confirm_pin) return toast.error('New PINs do not match.');

    setChangingPin(true);
    try {
      await changeStudentPin({ current_pin: pinForm.current_pin, new_pin: pinForm.new_pin });
      toast.success('Security PIN changed successfully!');
      setIsPinModalOpen(false);
      setPinForm({ current_pin: '', new_pin: '', confirm_pin: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change PIN');
    } finally {
      setChangingPin(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] relative bg-slate-50 dark:bg-darkSurface p-4 md:p-8 overflow-x-hidden z-0">
      
      {/* ⚡ PREMIUM GLASSMORPHISM BACKGROUND BLOBS ⚡ */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[100px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[40%] h-[40%] rounded-full bg-emerald-400/10 blur-[100px]" />
      </div>

      <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in zoom-in-95 duration-500 relative z-10">
        
        {/* ─── OVERDUE BANNER ─── */}
        {overdueCount > 0 && (
          <div className="bg-red-50/90 backdrop-blur-md border border-red-200 p-5 rounded-3xl flex items-start gap-4 animate-pulse shadow-sm">
            <div className="bg-red-100 text-red-600 p-3 rounded-2xl flex-shrink-0"><AlertTriangle size={24} /></div>
            <div>
              <h3 className="text-base font-black text-red-800 tracking-tight">Overdue Equipment Alert</h3>
              <p className="text-xs text-red-700 mt-1 font-medium leading-relaxed">You have {overdueCount} active request(s) past the return deadline. Please return the equipment to the administration counter immediately.</p>
            </div>
          </div>
        )}

        {/* ─── USER PROFILE CARD ─── */}
        <div className="bg-white/70 backdrop-blur-xl p-6 rounded-3xl shadow-sm border border-white/50 flex justify-between items-center">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Student Portal</p>
            <p className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">{user?.full_name || 'Student'}</p>
            <p className="text-sm font-medium text-gray-500 mt-1 flex items-center gap-1.5">
              <CalendarClock size={14} className="text-primary" />
              {user?.student_id}
            </p>
          </div>
          <button onClick={() => setIsPinModalOpen(true)} className="flex flex-col items-center justify-center p-4 bg-white/50 hover:bg-white rounded-2xl transition-all border border-white/50 shadow-sm hover:shadow-md group">
            <KeyRound size={20} className="text-gray-500 group-hover:text-primary mb-1.5 transition-colors" />
            <span className="text-[9px] font-black text-gray-500 group-hover:text-primary uppercase tracking-wider transition-colors">Change PIN</span>
          </button>
        </div>

        {/* ─── ACTION BUTTONS ─── */}
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => navigate('/student/new-request')}
            className="group bg-gradient-to-br from-primary to-primary/90 p-6 rounded-3xl shadow-md shadow-primary/20 flex flex-col items-center gap-3 hover:-translate-y-1 hover:shadow-lg transition-all duration-300"
          >
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white group-hover:scale-110 transition-transform">
              <PlusCircle size={24} />
            </div>
            <span className="text-sm font-black text-white tracking-wide">New Request</span>
          </button>
          
          <button 
            onClick={() => navigate('/student/my-requests')}
            className="group bg-white/70 backdrop-blur-xl border border-white/50 p-6 rounded-3xl shadow-sm flex flex-col items-center gap-3 hover:-translate-y-1 hover:shadow-md transition-all duration-300"
          >
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 group-hover:scale-110 group-hover:bg-primary/10 group-hover:text-primary transition-all">
              <FileText size={24} />
            </div>
            <span className="text-sm font-black text-gray-700 tracking-wide group-hover:text-primary">All Requests</span>
          </button>
        </div>

        {/* ─── ACTIVE REQUESTS (DIGITAL TICKET WALLET) ─── */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 shadow-sm">
          <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-5">
            <Clock size={16} className="text-primary" /> Active Activity
          </h3>

          {loading ? (
            <div className="flex justify-center py-10"><div className="neu-spinner w-8 h-8 border-primary" /></div>
          ) : activeRequests.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle2 size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-base font-black text-gray-600">No active requests.</p>
              <p className="text-xs font-medium text-gray-400 mt-1">You are all caught up! Tap 'New Request' to borrow equipment.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeRequests.map(r => (
                <div key={r.id} className={`p-5 rounded-3xl border bg-white/60 backdrop-blur-sm shadow-sm transition-all ${r.isOverdue ? 'border-red-300 shadow-red-500/10' : r.status === 'APPROVED' ? 'border-emerald-300 shadow-emerald-500/10' : 'border-white/50'}`}>
                  
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-mono text-[10px] font-black text-gray-400 uppercase tracking-widest">#{r.id}</span>
                        <span className={`px-2.5 py-0.5 text-[9px] font-black rounded-full uppercase tracking-wider border ${getStatusBadge(r.status)}`}>
                          {r.status}
                        </span>
                      </div>
                      <p className="text-lg font-black text-gray-800 tracking-tight">{r.purpose || 'General Use'}</p>
                      <p className="text-xs font-bold text-gray-500 mt-0.5">{r.items?.length || 0} items requested</p>
                    </div>
                    {r.status === 'APPROVED' && (
                      <button onClick={() => setSelectedTicket(r)} className="flex flex-col items-center justify-center p-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-2xl border border-emerald-200 transition-colors shadow-sm group">
                        <QrCode size={22} className="mb-1 group-hover:scale-110 transition-transform" />
                        <span className="text-[9px] font-black uppercase tracking-wider">Show QR</span>
                      </button>
                    )}
                  </div>

                  <div className="bg-white/80 rounded-2xl p-4 border border-black/5">
                    {r.status === 'PENDING' || r.status === 'PENDING APPROVAL' ? (
                      <p className="text-xs font-black text-gray-500 flex items-center gap-1.5 uppercase tracking-widest"><Clock size={14}/> Waiting for Admin Approval...</p>
                    ) : r.status === 'APPROVED' ? (
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pickup Window</p>
                        <p className="text-sm font-black text-emerald-700 flex items-center gap-1.5">
                          <CalendarClock size={14} />
                          {r.pickup_start ? `${formatDate(r.pickup_start)}` : r.pickup_datetime ? formatDate(r.pickup_datetime) : 'Ready for walk-in pickup'}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Return Deadline</p>
                        <p className={`text-sm font-black flex items-center gap-1.5 ${r.isOverdue ? 'text-red-600' : 'text-blue-700'}`}>
                          {r.isOverdue ? <AlertTriangle size={14} /> : <Clock size={14} />}
                          {r.return_deadline ? formatDate(r.return_deadline) : 'End of Day'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── RECENT HISTORY ─── */}
        {history.length > 0 && (
          <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 shadow-sm">
            <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-4 ml-1">
              <Package size={16} className="text-gray-400" /> Past History
            </h3>
            <div className="bg-white/50 rounded-2xl border border-white/50 shadow-sm overflow-hidden">
              {history.slice(0, 3).map((r, idx) => (
                <div key={r.id} className={`p-4 flex items-center justify-between ${idx !== 0 ? 'border-t border-black/5' : ''}`}>
                  <div>
                    <p className="text-sm font-black text-gray-800">{r.purpose || 'General Use'}</p>
                    <p className="text-[10px] font-medium text-gray-500 mt-0.5 flex items-center gap-1"><Clock size={10} /> {formatDate(r.created_at)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-0.5 text-[9px] font-black rounded-full uppercase tracking-wider border ${getStatusBadge(r.status)}`}>{r.status}</span>
                    <span className="text-[10px] font-mono text-gray-400 font-bold">#{r.id}</span>
                  </div>
                </div>
              ))}
              <button onClick={() => navigate('/student/my-requests')} className="w-full p-3 text-xs font-black text-primary bg-white hover:bg-gray-50 transition-colors border-t border-black/5 uppercase tracking-widest">
                View All History ➔
              </button>
            </div>
          </div>
        )}

        {/* ─── DIGITAL TICKET MODAL (QR CODE) ─── */}
        {selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white/90 backdrop-blur-2xl w-full max-w-sm relative overflow-hidden rounded-3xl border border-white/50 shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="p-6 space-y-6 flex flex-col items-center text-center">
                <div className="space-y-1 w-full border-b border-black/5 pb-4">
                  <h3 className="text-2xl font-black text-gray-800 tracking-tight">#{selectedTicket.id}</h3>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{selectedTicket.purpose || 'General Use'}</p>
                </div>
                
                <div className="p-4 bg-white border-2 border-black/5 rounded-3xl shadow-sm inline-block">
                  <QRCodeSVG value={selectedTicket.qr_code || String(selectedTicket.id)} size={220} level="M" />
                </div>
                
                <div className="w-full bg-primary/5 p-4 rounded-2xl border border-primary/10 space-y-1.5">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest">Present to Admin</p>
                  <p className="text-xs font-medium text-primary/80 leading-relaxed">Have your screen bright and hold this code up to the scanner at the counter.</p>
                </div>
                
                <button className="w-full bg-primary hover:bg-primary/90 text-white py-4 rounded-2xl font-black tracking-wide shadow-md shadow-primary/20 transition-all" onClick={() => setSelectedTicket(null)}>
                  Close Ticket
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── CHANGE PIN MODAL ─── */}
        <NeumorphModal open={isPinModalOpen} onClose={() => setIsPinModalOpen(false)} title="Change Security PIN">
          <form onSubmit={handlePinSubmit} className="space-y-5 p-2 mt-2">
            <NeumorphInput label="Current PIN" type="password" inputMode="numeric" placeholder="••••" value={pinForm.current_pin} onChange={e => handlePinChangeInput('current_pin', e.target.value)} autoFocus />
            <NeumorphInput label="New 4-Digit PIN" type="password" inputMode="numeric" placeholder="••••" value={pinForm.new_pin} onChange={e => handlePinChangeInput('new_pin', e.target.value)} />
            <NeumorphInput label="Confirm New PIN" type="password" inputMode="numeric" placeholder="••••" value={pinForm.confirm_pin} onChange={e => handlePinChangeInput('confirm_pin', e.target.value)} />
            <div className="flex justify-end gap-3 pt-5 border-t border-black/5 mt-6">
              <NeumorphButton variant="outline" type="button" onClick={() => setIsPinModalOpen(false)} className="flex-1 py-3.5 font-bold rounded-2xl">Cancel</NeumorphButton>
              <NeumorphButton variant="primary" type="submit" loading={changingPin} className="flex-1 py-3.5 font-black rounded-2xl shadow-md shadow-primary/20">Update PIN</NeumorphButton>
            </div>
          </form>
        </NeumorphModal>

      </div>
    </div>
  );
}