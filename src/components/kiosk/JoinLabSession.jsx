// src/components/kiosk/JoinLabSession.jsx
// Drop this into your existing kiosk flow after login
import React, { useState } from 'react';
import { FlaskConical, ArrowRight, Loader2, CheckCircle2, Clock, Package } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import api from '../../api/axiosClient';
import NeumorphButton from '../ui/NeumorphButton';
import NeumorphInput from '../ui/NeumorphInput';

export default function JoinLabSession({ onSuccess, onSkip }) {
  const [code, setCode]         = useState('');
  const [preview, setPreview]   = useState(null);  // session info before confirm
  const [result, setResult]     = useState(null);  // after claim
  const [loading, setLoading]   = useState(false);

  const handleValidate = async () => {
    if (!code.trim()) return toast.error('Enter a session code');
    setLoading(true);
    try {
      const res = await api.post('/lab-sessions/validate', { code: code.trim().toUpperCase() });
      setPreview(res.data.data);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    setLoading(true);
    try {
      const res = await api.post('/lab-sessions/claim', { code: code.trim().toUpperCase() });
      setResult(res.data.data);
      toast.success('Session joined! Bring this QR to the counter.');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to join session');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Success — show claim QR ──────────────────────────────────────
  if (result) {
    const endTime = new Date(result.session.end_time).toLocaleTimeString('en-PH', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
    return (
      <div className="flex flex-col items-center text-center space-y-6 p-4 animate-fade-in">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
          <CheckCircle2 size={36} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Session Joined!</h2>
          <p className="text-muted text-sm mt-1">Bring this QR to the admin counter to claim your items.</p>
        </div>

        <div className="p-4 bg-white rounded-2xl shadow-sm border border-black/5">
          <QRCodeSVG value={result.qr_code} size={200} />
        </div>

        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-left w-full max-w-sm">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">Return deadline</p>
          <p className="text-sm font-bold text-amber-700 flex items-center gap-2">
            <Clock size={16} /> Return all items by <strong>{endTime}</strong>
          </p>
          <p className="text-xs text-amber-600 mt-1">
            Authorized by {result.session.faculty_name}
          </p>
        </div>

        <NeumorphButton variant="primary" className="w-full py-4" onClick={() => onSuccess?.(result)}>
          Done
        </NeumorphButton>
      </div>
    );
  }

  // ── Step 2: Preview — confirm session details ─────────────────────────────
  if (preview) {
    const endTime = new Date(preview.end_time).toLocaleTimeString('en-PH', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="text-center">
          <div className="w-14 h-14 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-3">
            <FlaskConical size={28} className="text-primary" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">Confirm Session</h2>
          <p className="text-sm text-muted mt-1">Review the session details before joining</p>
        </div>

        <div className="bg-black/[0.02] border border-black/5 rounded-2xl p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Purpose</span>
            <span className="font-bold text-gray-800">{preview.purpose}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Room</span>
            <span className="font-bold text-gray-800">{preview.room_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Faculty</span>
            <span className="font-bold text-gray-800">{preview.faculty_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Return by</span>
            <span className="font-bold text-amber-600 flex items-center gap-1">
              <Clock size={14} /> {endTime}
            </span>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-muted uppercase mb-2 flex items-center gap-1">
            <Package size={12} /> Items you will receive
          </p>
          <div className="space-y-1">
            {(preview.items || []).map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm bg-white p-2 rounded-lg border border-black/5">
                <span>{item.name}</span>
                <span className="font-bold text-primary">×{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <NeumorphButton variant="outline" className="flex-1" onClick={() => setPreview(null)}>
            Back
          </NeumorphButton>
          <NeumorphButton variant="primary" className="flex-1" onClick={handleClaim} loading={loading}>
            Confirm & Join <ArrowRight size={16} className="ml-1" />
          </NeumorphButton>
        </div>
      </div>
    );
  }

  // ── Step 1: Enter code ────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center">
        <div className="w-14 h-14 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-3">
          <FlaskConical size={28} className="text-primary" />
        </div>
        <h2 className="text-xl font-bold text-gray-800">Join Lab Session</h2>
        <p className="text-sm text-muted mt-1">Enter the code your faculty wrote on the board</p>
      </div>

      <div className="space-y-3">
        <NeumorphInput
          label="Session Code"
          placeholder="e.g. LAB-K9M2"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          className="text-center font-mono text-xl tracking-widest"
          onKeyDown={e => e.key === 'Enter' && handleValidate()}
          autoFocus
        />
        <NeumorphButton
          variant="primary"
          className="w-full py-4 font-bold"
          onClick={handleValidate}
          loading={loading}
          disabled={!code.trim()}
        >
          Validate Code <ArrowRight size={16} className="ml-2" />
        </NeumorphButton>
      </div>

      <div className="text-center">
        <button onClick={onSkip} className="text-sm text-muted hover:text-primary transition-colors underline underline-offset-2">
          Skip — make a regular request instead
        </button>
      </div>
    </div>
  );
}
