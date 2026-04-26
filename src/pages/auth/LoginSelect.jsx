import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Shield, GraduationCap, BookOpen, ScanLine, X, 
  Loader2, Package, Clock, CheckCircle2, Smartphone 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react'; 
import api from '../../api/axiosClient.js';

const roles = [
  { label: 'Admins & System Manager', sub: 'Sign in with Email & Password', icon: Shield,        path: '/login/admin',   color: 'from-primary/20 to-accent/10' },
  { label: 'Faculty',       sub: 'Sign in via Gmail OTP',         icon: BookOpen,      path: '/login/faculty', color: 'from-info/10 to-primary/5'    },
  { label: 'Student',       sub: 'Sign in with Student ID & PIN', icon: GraduationCap, path: '/login/student', color: 'from-success/10 to-info/5'    },
];

// Helper to color-code the status in the modal
const StatusBadge = ({ status }) => {
  const colors = {
    'PENDING':            'bg-yellow-100 text-yellow-800 border-yellow-200',
    'PENDING APPROVAL':   'bg-amber-100  text-amber-800  border-amber-200',
    'APPROVED':           'bg-blue-100   text-blue-800   border-blue-200',
    'ISSUED':             'bg-green-100  text-green-800  border-green-200',
    'PARTIALLY RETURNED': 'bg-teal-100   text-teal-800   border-teal-200',
    'RETURNED':           'bg-gray-100   text-gray-600   border-gray-200',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase border tracking-wider ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
};

export default function LoginSelect() {
  const navigate = useNavigate();

  // ── Inline scanner modal state ──────────
  const [qrModalOpen,  setQrModalOpen]  = useState(false);
  const [isScanning,   setIsScanning]   = useState(false);
  const [scanResult,   setScanResult]   = useState(null);
  const scannerInputRef = useRef(null);

  useEffect(() => {
    if (qrModalOpen && !scanResult) {
      setTimeout(() => scannerInputRef.current?.focus(), 100);
    }
  }, [qrModalOpen, scanResult]);

  const handleScannerInput = async (e) => {
    if (e.key !== 'Enter') return;
    const code = e.target.value.trim();
    e.target.value = '';
    if (!code) return;

    setIsScanning(true);
    setScanResult(null);

    try {
      const res = await api.get(`/requests/qr/public/${code}`);
      setScanResult(res.data?.data ?? res.data);
      toast.success('Request found!');
    } catch {
      toast.error('Invalid QR Code or Request not found.');
      setTimeout(() => scannerInputRef.current?.focus(), 100);
    } finally {
      setIsScanning(false);
    }
  };

  const closeModal = () => {
    setQrModalOpen(false);
    setScanResult(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#e0e5ec] dark:bg-darkSurface px-4 py-8">
      <div className="animate-in fade-in zoom-in-95 duration-500 w-full max-w-[420px]">

        {/* ── LOGO & HEADER ── */}
        <div className="text-center mb-8">
          <div className="neu-card-lg w-24 h-24 mx-auto flex items-center justify-center mb-5 overflow-hidden shadow-lg">
            <img src="/favicon.ico" alt="InvenCEA Logo" className="w-16 h-16 object-contain" />
          </div>
          <h1 className="font-display text-3xl font-black text-primary dark:text-darkText tracking-tight">InvenCEA</h1>
          <p className="text-sm font-medium text-gray-500 dark:text-darkMuted mt-1">
            College of Engineering and Architecture
          </p>
        </div>

        {/* ── LOGIN ROLES ── */}
        <div className="flex flex-col gap-3.5 mb-6">
          {roles.map(({ label, sub, icon: Icon, path, color }) => (
            <button
              key={label}
              onClick={() => navigate(path)}
              className="bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-black/5 flex items-center gap-4 text-left w-full group hover:shadow-md hover:border-primary/30 transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${color} flex-shrink-0 shadow-inner group-hover:scale-105 transition-transform duration-300`}>
                <Icon size={20} className="text-primary dark:text-darkText" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-gray-800 dark:text-darkText group-hover:text-primary transition-colors text-base truncate">{label}</p>
                <p className="text-[11px] font-medium text-gray-500 dark:text-darkMuted mt-0.5 truncate">{sub}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <span className="text-gray-400 group-hover:text-primary font-bold">›</span>
              </div>
            </button>
          ))}
        </div>

        {/* ── KIOSK TOOLS DIVIDER ── */}
        <div className="flex items-center gap-3 mb-5 px-2">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Kiosk Tools</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />
        </div>

        {/* ── QUICK STATUS CHECK ── */}
        <button
          onClick={() => navigate('/kiosk/status')}
          className="w-full bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-black/5 flex items-center gap-4 text-left group hover:border-primary/40 hover:shadow-md transition-all duration-300"
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 flex-shrink-0 text-primary shadow-inner group-hover:bg-primary group-hover:text-white transition-colors duration-300">
            <ScanLine size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-gray-800 dark:text-darkText text-base truncate">Quick Status Check</p>
            <p className="text-[11px] font-medium text-gray-500 dark:text-darkMuted mt-0.5 truncate">
              Camera or scanner — check your request
            </p>
          </div>
        </button>

        {/* ⚡ SLEEK MOBILE ACCESS QR BANNER ⚡ */}
        <div className="mt-8 relative overflow-hidden bg-gradient-to-br from-primary/10 to-blue-50/50 p-5 rounded-2xl border border-primary/20 shadow-sm flex items-center gap-5 group hover:border-primary/40 transition-colors">
          {/* Decorative glowing blob */}
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-colors duration-700 pointer-events-none" />
          
          <div className="p-2.5 bg-white rounded-xl shadow-sm border border-primary/10 flex-shrink-0 relative z-10 group-hover:scale-105 transition-transform duration-500">
            <QRCodeSVG value="https://invencea.vercel.app" size={60} level="M" />
          </div>
          
          <div className="text-left relative z-10 flex-1">
            <p className="text-sm font-black text-primary dark:text-darkText flex items-center gap-1.5 leading-tight">
              <Smartphone size={16} className="animate-pulse" /> Mobile Access
            </p>
            <p className="text-[11px] text-primary/80 dark:text-darkMuted mt-1.5 font-medium leading-relaxed">
              Want to access the website on your personal device? Scan this code.
            </p>
          </div>
        </div>

        <footer className="mt-12 pb-4 text-center">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            &copy; {new Date().getFullYear()} <span className="text-primary">InvenCEA</span>. All rights reserved.
          </p>
        </footer>
      </div>

      {/* ── INLINE SCANNER MODAL (Hidden Fallback) ── */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden border border-black/5 animate-in zoom-in-95 duration-300">

            <button onClick={closeModal} className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-100 hover:text-red-500 rounded-full transition-colors z-10">
              <X size={20} />
            </button>

            <input
              ref={scannerInputRef}
              type="text"
              className="absolute opacity-0 w-0 h-0"
              onKeyDown={handleScannerInput}
              onBlur={() => !scanResult && setTimeout(() => scannerInputRef.current?.focus(), 50)}
            />

            {!scanResult ? (
              <div className="flex flex-col items-center justify-center p-10 text-center space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping duration-1000" />
                  <div className="w-24 h-24 bg-primary/5 border border-primary/20 rounded-full flex items-center justify-center relative z-10">
                    {isScanning ? <Loader2 size={36} className="text-primary animate-spin" /> : <ScanLine size={36} className="text-primary" />}
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 tracking-tight">Ready to Scan</h3>
                  <p className="text-sm font-medium text-gray-500 mt-2 max-w-xs mx-auto leading-relaxed">
                    Hold your digital or printed QR Code under the scanner to check its status.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-8 space-y-6 bg-gray-50/50">
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-green-200">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900">Request #{scanResult.id}</h3>
                  <p className="text-sm font-bold text-gray-500 mt-1">{scanResult.requester_name}</p>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={14}/> Status
                    </span>
                    <StatusBadge status={scanResult.status} />
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-black/5">
                    <span className="text-gray-500 font-bold text-xs uppercase tracking-wider">Room</span>
                    <span className="font-black text-sm text-gray-800">{scanResult.room_code || 'Global'}</span>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-3 tracking-widest flex items-center gap-1.5">
                    <Package size={14} className="text-gray-400" /> Requested Items
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {scanResult.items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 bg-white border border-black/5 rounded-xl shadow-sm">
                        <span className="font-bold text-sm text-gray-800 truncate pr-2">{item.item_name}</span>
                        <span className="bg-gray-100 px-2.5 py-1 rounded-md text-xs font-black text-gray-600 flex-shrink-0">
                          ×{item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={() => setScanResult(null)} className="w-full py-4 bg-primary hover:bg-primary/90 text-white font-black rounded-xl transition-colors shadow-md shadow-primary/20">
                  Scan Another Code
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}