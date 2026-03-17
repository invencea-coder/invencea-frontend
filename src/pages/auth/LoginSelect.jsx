import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, GraduationCap, BookOpen, ScanLine, X, Loader2, Package, Clock, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosClient.js';

const roles = [
  { label: 'Administrator', sub: 'Manage inventory & requests', icon: Shield,        path: '/login/admin',   color: 'from-primary/20 to-accent/10' },
  { label: 'Faculty',       sub: 'Gmail OTP login',             icon: BookOpen,      path: '/login/faculty', color: 'from-info/10 to-primary/5'    },
  { label: 'Student',       sub: 'Name + Student ID',           icon: GraduationCap, path: '/login/student', color: 'from-success/10 to-info/5'    },
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
    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
};

export default function LoginSelect() {
  const navigate = useNavigate();

  // ── Inline scanner modal state (kept for backward compatibility) ──────────
  const [qrModalOpen,  setQrModalOpen]  = useState(false);
  const [isScanning,   setIsScanning]   = useState(false);
  const [scanResult,   setScanResult]   = useState(null);
  const scannerInputRef = useRef(null);

  // Keep the hidden input focused when the modal is open
  useEffect(() => {
    if (qrModalOpen && !scanResult) {
      setTimeout(() => scannerInputRef.current?.focus(), 100);
    }
  }, [qrModalOpen, scanResult]);

  // Handle Bluetooth / USB scanner input (types fast then fires Enter)
  const handleScannerInput = async (e) => {
    if (e.key !== 'Enter') return;
    const code = e.target.value.trim();
    e.target.value = '';
    if (!code) return;

    setIsScanning(true);
    setScanResult(null);

    try {
      // Uses the public endpoint — no auth token required
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface dark:bg-darkSurface px-4">
      <div className="animate-slide-up w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="neu-card-lg w-20 h-20 mx-auto flex items-center justify-center mb-4 overflow-hidden">
            <img src="/favicon.ico" alt="InvenCEA Logo" className="w-20 h-20 object-contain" />
          </div>
          <h1 className="font-display text-3xl font-bold text-primary dark:text-darkText">InvenCEA</h1>
          <p className="text-sm text-muted dark:text-darkMuted mt-1">
            Inventory System of College of Engineering and Architecture
          </p>
        </div>

        {/* Login options */}
        <div className="flex flex-col gap-4">
          {roles.map(({ label, sub, icon: Icon, path, color }) => (
            <button
              key={label}
              onClick={() => navigate(path)}
              className="neu-card neu-card-hover p-5 flex items-center gap-4 text-left w-full group"
            >
              <div className={`neu-card-sm w-12 h-12 flex items-center justify-center bg-gradient-to-br ${color} flex-shrink-0`}>
                <Icon size={22} className="text-primary dark:text-darkText" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-primary dark:text-darkText group-hover:text-accent transition-colors">{label}</p>
                <p className="text-xs text-muted dark:text-darkMuted mt-0.5">{sub}</p>
              </div>
              <span className="text-muted dark:text-darkMuted text-lg">›</span>
            </button>
          ))}

          {/* Divider */}
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-black/5 dark:bg-white/5" />
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Kiosk Tools</span>
            <div className="flex-1 h-px bg-black/5 dark:bg-white/5" />
          </div>

          {/* Quick Status Check
              - Navigates to /kiosk/status (full page with camera + physical scanner)
              - The inline modal below is kept as a fallback for direct physical-scanner
                use from this page without leaving it */}
          <button
            onClick={() => navigate('/kiosk/status')}
            className="neu-card neu-card-hover p-5 flex items-center gap-4 text-left w-full group border-2 border-primary/20 bg-primary/[0.02]"
          >
            <div className="neu-card-sm w-12 h-12 flex items-center justify-center bg-primary/10 flex-shrink-0 text-primary">
              <ScanLine size={22} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-primary dark:text-darkText">Quick Status Check</p>
              <p className="text-xs text-muted dark:text-darkMuted mt-0.5">
                Camera or scanner — check your request status
              </p>
            </div>
            <span className="text-primary text-lg">›</span>
          </button>
        </div>

        <footer className="mt-auto py-8 text-center">
          <p className="text-xs text-muted dark:text-darkMuted font-display tracking-wide">
            &copy; {new Date().getFullYear()}{' '}
            <span className="font-bold text-primary dark:text-darkText">InvenCEA</span>. All rights reserved.
          </p>
        </footer>
      </div>

      {/* ── Inline Scanner Modal (physical scanner fallback) ────────────────── */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="neu-card-lg w-full max-w-md relative bg-white dark:bg-darkSurface overflow-hidden">

            {/* Close button */}
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 p-2 text-muted hover:text-red-500 rounded-full transition-colors z-10"
            >
              <X size={20} />
            </button>

            {/* Hidden input — captures Bluetooth/USB scanner keystrokes */}
            <input
              ref={scannerInputRef}
              type="text"
              className="absolute opacity-0 w-0 h-0"
              onKeyDown={handleScannerInput}
              onBlur={() => !scanResult && setTimeout(() => scannerInputRef.current?.focus(), 50)}
            />

            {!scanResult ? (
              // Scanning state
              <div className="flex flex-col items-center justify-center p-8 text-center space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                  <div className="w-24 h-24 neu-inset rounded-full flex items-center justify-center relative z-10 bg-white">
                    {isScanning
                      ? <Loader2 size={40} className="text-primary animate-spin" />
                      : <ScanLine size={40} className="text-primary" />
                    }
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-primary font-display">Ready to Scan</h3>
                  <p className="text-sm text-muted mt-2">
                    Hold your digital or printed Request QR Code under the red light of the kiosk scanner.
                  </p>
                </div>
              </div>
            ) : (
              // Result state
              <div className="p-6 space-y-5">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800">Request #{scanResult.id}</h3>
                  <p className="text-sm font-medium text-muted mt-1">{scanResult.requester_name}</p>
                </div>

                <div className="neu-inset p-4 rounded-xl space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted font-semibold flex items-center gap-1">
                      <Clock size={14}/> Status
                    </span>
                    <StatusBadge status={scanResult.status} />
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-black/5">
                    <span className="text-muted font-semibold">Requested Room</span>
                    <span className="font-bold">{scanResult.room_code || 'Global'}</span>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-muted uppercase mb-2 tracking-wider flex items-center gap-1">
                    <Package size={14} /> Requested Items
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {scanResult.items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 bg-black/[0.02] border border-black/5 rounded-lg text-sm">
                        <span className="font-medium text-gray-700">{item.item_name}</span>
                        <span className="bg-white px-2 py-1 rounded shadow-sm text-xs font-bold border border-black/5 text-primary">
                          ×{item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setScanResult(null)}
                  className="w-full neu-btn text-primary py-3 font-bold mt-4"
                >
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
