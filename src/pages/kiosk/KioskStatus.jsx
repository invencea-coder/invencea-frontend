// src/pages/kiosk/KioskStatus.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { Package, Scan, CheckCircle, Clock, AlertCircle, Keyboard, Camera, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import NeumorphCard from '../../components/ui/NeumorphCard';
import NeumorphButton from '../../components/ui/NeumorphButton';

// ── Public axios instance ─────────────────────────────────────────────────────
// Does NOT have the auth interceptor that redirects to "/" on 401.
// KioskStatus is a public page — using the main api client would cause a
// redirect to the login page whenever the QR lookup fails or the token is absent.
const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1',
  withCredentials: false,
});

const fetchPublicQR = (code) =>
  publicApi.get(`/requests/qr/public/${encodeURIComponent(code)}`);

// ─── Camera Scanner Component ─────────────────────────────────────────────────
// Isolated so it mounts/unmounts cleanly — same pattern as Requests.jsx
function CameraScanner({ onResult }) {
  const containerRef = useRef(null);
  const scannerRef   = useRef(null);
  const isRunningRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const timer = setTimeout(async () => {
      if (!isMountedRef.current || !containerRef.current) return;

      let cameras;
      try {
        cameras = await Html5Qrcode.getCameras();
      } catch {
        if (isMountedRef.current) toast.error('Camera access denied. Use the physical scanner instead.');
        return;
      }

      if (!cameras?.length) {
        if (isMountedRef.current) toast.error('No camera found. Use the physical scanner instead.');
        return;
      }

      if (!isMountedRef.current || !containerRef.current) return;

      const camera  = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[0];
      const scanner = new Html5Qrcode('kiosk-qr-cam');
      scannerRef.current = scanner;

      try {
        await scanner.start(
          camera.id,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded) => { if (isMountedRef.current) onResult(decoded); },
          () => {}
        );
        isRunningRef.current = true;
      } catch {
        if (isMountedRef.current) toast.error('Could not start camera. Use the physical scanner instead.');
        scannerRef.current = null;
      }
    }, 300);

    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);

      const scanner = scannerRef.current;
      scannerRef.current = null;

      if (scanner && isRunningRef.current) {
        isRunningRef.current = false;
        // stop() can return undefined if the internal state is inconsistent —
        // always check the return value before chaining .then/.catch
        try {
          const stopPromise = scanner.stop();
          if (stopPromise && typeof stopPromise.then === 'function') {
            stopPromise
              .then(() => { try { scanner.clear(); } catch { } })
              .catch(() => {});
          } else {
            try { scanner.clear(); } catch { }
          }
        } catch { }
      } else if (scanner) {
        try { scanner.clear(); } catch { }
      }
    };
  }, []);

  return (
    <div
      id="kiosk-qr-cam"
      ref={containerRef}
      className="w-full max-w-sm mx-auto rounded-xl overflow-hidden border-4 border-primary/20 bg-black/5 min-h-[280px]"
    />
  );
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  'PENDING APPROVAL':   { color: 'text-amber-500',  border: 'border-amber-400',  step: 1, text: 'Awaiting Admin Approval' },
  'PENDING':            { color: 'text-blue-500',   border: 'border-blue-400',   step: 2, text: 'Ready to Issue at Counter' },
  'APPROVED':           { color: 'text-indigo-500', border: 'border-indigo-400', step: 2, text: 'Approved — Go to Counter' },
  'ISSUED':             { color: 'text-purple-500', border: 'border-purple-400', step: 3, text: 'Currently Borrowed' },
  'PARTIALLY RETURNED': { color: 'text-orange-500', border: 'border-orange-400', step: 4, text: 'Partial Return — Items Missing' },
  'RETURNED':           { color: 'text-emerald-500',border: 'border-emerald-400',step: 5, text: 'Fully Returned & Cleared' },
  'REJECTED':           { color: 'text-red-500',    border: 'border-red-400',    step: 0, text: 'Request Denied / Archived' },
  'CANCELLED':          { color: 'text-gray-500',   border: 'border-gray-400',   step: 0, text: 'Cancelled' },
};

const TIMELINE_STEPS = [
  { icon: <Clock   size={18}/>, label: 'Approved'       },
  { icon: <Package size={18}/>, label: 'Issued'         },
  { icon: <AlertCircle size={18}/>, label: 'Partial'    },
  { icon: <CheckCircle size={18}/>, label: 'Cleared'    },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function KioskStatus() {
  const navigate = useNavigate();
  const [requestData,  setRequestData]  = useState(null);
  const [scanMode,     setScanMode]     = useState('camera'); // 'camera' | 'physical'
  const [cameraActive, setCameraActive] = useState(true);
  const [processing,   setProcessing]   = useState(false);

  // Physical scanner buffer — same stale-closure-safe pattern as Requests.jsx
  const bufferRef    = useRef('');
  const processingRef = useRef(false); // ref mirror so keydown handler sees latest value

  useEffect(() => { processingRef.current = processing; }, [processing]);

  // ── Lookup handler (shared by both camera and physical scanner) ────────────
  const handleCode = useCallback(async (code) => {
    if (processingRef.current) return; // debounce double-scans
    const trimmed = code.trim();
    if (!trimmed) return;

    setProcessing(true);
    setCameraActive(false); // stop camera while processing
    toast.loading('Checking status…', { id: 'kiosk' });

    try {
      const res = await fetchPublicQR(trimmed);
      setRequestData(res.data?.data ?? res.data);
      toast.success('Request found!', { id: 'kiosk' });
    } catch {
      toast.error('Invalid QR or request not found.', { id: 'kiosk' });
      // Resume scanning after a short delay so the user can try again
      setTimeout(() => {
        setCameraActive(true);
        setProcessing(false);
      }, 1500);
      return;
    }

    setProcessing(false);
  }, []);

  // ── Physical scanner keydown listener ─────────────────────────────────────
  // USB/Bluetooth scanners type characters rapidly then send Enter.
  // We buffer every character and flush on Enter.
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore keystrokes when the user is typing in a real input/textarea
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim();
        bufferRef.current = '';
        if (code.length > 0 && !processingRef.current) {
          handleCode(code);
        }
        return;
      }

      // Only buffer printable characters (length 1)
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCode]);

  // ── Reset to scan again ────────────────────────────────────────────────────
  const resetScanner = () => {
    setRequestData(null);
    setProcessing(false);
    setCameraActive(true);
    bufferRef.current = '';
  };

  const cfg          = requestData ? (STATUS_CONFIG[requestData.status] ?? STATUS_CONFIG['PENDING']) : null;
  const currentStep  = cfg?.step ?? 0;
  const isTerminal   = requestData && ['REJECTED', 'CANCELLED'].includes(requestData.status);

  return (
    <div className="min-h-screen bg-[#e0e5ec] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">

        {/* Header */}
        <div className="text-center relative">
          <button
            onClick={() => navigate('/')}
            className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-primary transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="text-4xl font-extrabold text-primary flex items-center justify-center gap-3">
            <Scan size={36} /> InvenCEA Tracker
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Scan your receipt QR code to check your request status
          </p>
        </div>

        <NeumorphCard className="p-8">

          {/* ── SCAN VIEW ── */}
          {!requestData && (
            <div className="flex flex-col items-center gap-6">

              {/* Mode toggle */}
              <div className="flex gap-2 bg-black/5 p-1 rounded-xl self-center">
                <button
                  onClick={() => setScanMode('camera')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    scanMode === 'camera' ? 'bg-white shadow text-primary' : 'text-muted hover:text-primary'
                  }`}
                >
                  <Camera size={15}/> Camera
                </button>
                <button
                  onClick={() => setScanMode('physical')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    scanMode === 'physical' ? 'bg-white shadow text-primary' : 'text-muted hover:text-primary'
                  }`}
                >
                  <Keyboard size={15}/> Scanner
                </button>
              </div>

              {/* Camera mode */}
              {scanMode === 'camera' && (
                <div className="w-full flex flex-col items-center gap-4">
                  {cameraActive && <CameraScanner onResult={handleCode} />}
                  {processing && (
                    <div className="flex items-center gap-2 text-sm text-muted animate-pulse">
                      <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin"/>
                      Checking…
                    </div>
                  )}
                  {!processing && (
                    <p className="text-sm text-muted animate-pulse text-center">
                      Present your QR code to the camera
                    </p>
                  )}
                </div>
              )}

              {/* Physical scanner mode */}
              {scanMode === 'physical' && (
                <div className="flex flex-col items-center gap-6 py-6 w-full">
                  <div className={`w-24 h-24 rounded-2xl flex items-center justify-center shadow-inner bg-[#e0e5ec] transition-all ${
                    processing ? 'scale-95 opacity-70' : 'scale-100'
                  }`}>
                    <Scan size={40} className={processing ? 'text-primary animate-pulse' : 'text-primary/40'} />
                  </div>

                  <div className="text-center">
                    <p className="font-bold text-gray-700 text-lg">
                      {processing ? 'Processing…' : 'Ready to Scan'}
                    </p>
                    <p className="text-sm text-muted mt-1">
                      Point your Bluetooth or USB scanner at the QR code on your receipt.
                      The system reads it automatically — no button press needed.
                    </p>
                  </div>

                  {/* Visual feedback bar — fills while buffer has content */}
                  <div className="w-full max-w-xs h-2 bg-black/5 rounded-full overflow-hidden">
                    <div className={`h-full bg-primary rounded-full transition-all duration-200 ${processing ? 'w-full' : 'w-0'}`}/>
                  </div>

                  <p className="text-[11px] text-muted/60 text-center">
                    Also works with USB barcode readers connected to this device
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── RESULT VIEW ── */}
          {requestData && cfg && (
            <div className="space-y-6 animate-in fade-in zoom-in duration-300">

              {/* Status banner */}
              <div className="text-center">
                <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-white shadow-sm border ${cfg.border} ${cfg.color}`}>
                  {requestData.status}
                </span>
                <h2 className="text-2xl font-bold text-gray-800 mt-4">Request #{requestData.id}</h2>
                <p className="text-sm text-muted">{requestData.room_code || 'Global'} · {new Date(requestData.created_at).toLocaleDateString()}</p>
                <p className={`text-sm font-semibold mt-1 ${cfg.color}`}>{cfg.text}</p>
              </div>

              {/* Progress timeline */}
              {!isTerminal && (
                <div className="relative py-6 px-2">
                  {/* Track */}
                  <div className="absolute top-1/2 left-4 right-4 h-1 bg-black/5 -translate-y-1/2 rounded-full" />
                  {/* Fill */}
                  <div
                    className="absolute top-1/2 left-4 h-1 bg-primary -translate-y-1/2 rounded-full transition-all duration-700"
                    style={{ width: `calc(${((currentStep - 1) / (TIMELINE_STEPS.length - 1)) * 100}% - 0px)`, maxWidth: 'calc(100% - 2rem)' }}
                  />
                  {/* Steps */}
                  <div className="relative flex justify-between">
                    {TIMELINE_STEPS.map((step, idx) => {
                      const stepNum   = idx + 2; // steps start at 2 (Approved=2)
                      const done      = currentStep >= stepNum;
                      const active    = currentStep === stepNum;
                      return (
                        <div key={idx} className="flex flex-col items-center gap-2">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md border-2 transition-all duration-500 ${
                            done   ? 'bg-primary text-white border-primary scale-110' :
                            active ? 'bg-white text-primary border-primary' :
                                     'bg-[#e0e5ec] text-muted border-white'
                          }`}>
                            {step.icon}
                          </div>
                          <span className={`text-[10px] font-bold uppercase tracking-wide ${done ? 'text-primary' : 'text-muted'}`}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items list */}
              <div className="bg-black/[0.03] p-4 rounded-xl border border-black/5">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Items in Request</h3>
                <div className="space-y-2">
                  {(requestData.items ?? []).map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border border-black/5">
                      <div>
                        <p className="font-bold text-sm text-gray-800">{item.item_name}</p>
                        <p className="text-[10px] font-mono text-muted">
                          {item.inventory_item_barcode || 'Batch Item'} · ×{item.quantity || 1}
                        </p>
                      </div>
                      <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full ${
                        item.item_status === 'RETURNED'  ? 'bg-emerald-50 text-emerald-600' :
                        item.item_status === 'ISSUED'    ? 'bg-purple-50  text-purple-600'  :
                        item.item_status === 'CANCELLED' ? 'bg-gray-100   text-gray-400'    :
                                                           'bg-amber-50   text-amber-600'
                      }`}>
                        {item.item_status || 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Return deadline */}
              {requestData.return_deadline && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center">
                  <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Return Deadline</p>
                  <p className="font-mono text-red-700 font-bold text-lg mt-1">
                    {new Date(requestData.return_deadline).toLocaleString()}
                  </p>
                </div>
              )}

              {/* Members */}
              {requestData.members?.length > 0 && (
                <div className="bg-black/[0.03] p-4 rounded-xl border border-black/5">
                  <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Group Members</h3>
                  <div className="space-y-1.5">
                    {requestData.members.map((m, idx) => (
                      <div key={idx} className="flex justify-between text-sm bg-white p-2.5 rounded-lg border border-black/5">
                        <span className="font-medium text-gray-800">{m.full_name}</span>
                        <span className="font-mono text-xs text-muted">{m.student_id !== 'N/A' ? m.student_id : 'Faculty'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Scan another */}
              <NeumorphButton className="w-full py-4" variant="primary" onClick={resetScanner}>
                <Scan size={18} className="mr-2"/> Scan Another Request
              </NeumorphButton>
            </div>
          )}
        </NeumorphCard>

        <p className="text-center text-xs text-gray-400">
          InvenCEA · Equipment Management System
        </p>
      </div>
    </div>
  );
}
