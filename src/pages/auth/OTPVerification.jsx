import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendOTP, verifyOTP } from '../../api/authAPI.js';
import { useAuth } from '../../hooks/useAuth.js';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';

const OTP_SECONDS = 120;

export default function OTPVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const email = location.state?.email;

  const [digits, setDigits] = useState(Array(6).fill(''));
  const [timeLeft, setTimeLeft] = useState(OTP_SECONDS);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputs = useRef([]);

  useEffect(() => { if (!email) navigate('/login/faculty'); }, [email]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft((p) => p - 1), 1000);
    return () => clearInterval(t);
  }, [timeLeft]);

  const handleDigit = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    if (val && i < 5) inputs.current[i + 1]?.focus();
    if (!val && i > 0) inputs.current[i - 1]?.focus();
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setDigits(text.split(''));
      inputs.current[5]?.focus();
    }
    e.preventDefault();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = digits.join('');
    if (code.length < 6) { toast.error('Enter all 6 digits'); return; }
    setLoading(true);
    try {
      const { data } = await verifyOTP(email, code);
      login(data.data.token, data.data.user);
      toast.success('Welcome back!');
      navigate(`/${data.data.user.role}`);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Invalid OTP');
      setDigits(Array(6).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await sendOTP(email);
      setTimeLeft(OTP_SECONDS);
      setDigits(Array(6).fill(''));
      toast.success('New OTP sent!');
    } catch {
      toast.error('Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');
  const expired = timeLeft <= 0;
  const circumference = 2 * Math.PI * 28;
  const progress = (timeLeft / OTP_SECONDS) * circumference;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#e0e5ec] dark:bg-darkSurface px-4 py-8">
      <div className="animate-in fade-in zoom-in-95 duration-500 w-full max-w-[400px]">
        <button
          onClick={() => navigate('/login/faculty')}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Email
        </button>

        <div className="bg-white/80 backdrop-blur-md p-8 rounded-3xl shadow-sm border border-black/5 text-center relative overflow-hidden">
          
          <h2 className="font-display text-2xl font-black text-gray-900 tracking-tight">Verify OTP</h2>
          <p className="text-sm font-medium text-gray-500 mt-2">
            Code sent to <span className="font-bold text-primary">{email}</span>
          </p>

          {/* Circular countdown */}
          <div className="flex justify-center my-8">
            <div className="relative w-20 h-20">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="#f3f4f6" strokeWidth="4" />
                <circle
                  cx="32" cy="32" r="28" fill="none"
                  stroke={expired ? '#f3f4f6' : '#1e3a8a'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - progress}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`font-mono text-sm font-black tracking-widest ${expired ? 'text-gray-400' : 'text-primary'}`}>
                  {expired ? '0:00' : `${mins}:${secs}`}
                </span>
              </div>
            </div>
          </div>

          {/* OTP inputs */}
          <div className="flex gap-2 justify-center mb-8" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={d}
                onChange={(e) => handleDigit(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={expired}
                className="w-12 h-14 text-center text-xl font-black bg-gray-50 border border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all disabled:opacity-50"
              />
            ))}
          </div>

          {expired ? (
            <NeumorphButton
              variant="outline"
              loading={resending}
              onClick={handleResend}
              className="w-full py-3.5 flex justify-center items-center gap-2 text-base font-black rounded-xl text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100"
            >
              {!resending && <RefreshCw size={16} />} Resend OTP
            </NeumorphButton>
          ) : (
            <NeumorphButton
              variant="primary"
              loading={loading}
              onClick={handleVerify}
              className="w-full py-3.5 flex justify-center items-center gap-2 text-base font-black rounded-xl shadow-md shadow-primary/20"
              disabled={digits.join('').length < 6}
            >
              Verify & Login
            </NeumorphButton>
          )}

          {!expired && (
            <p className="text-center text-xs font-medium text-gray-500 mt-4">
              Didn't receive it?{' '}
              <button onClick={handleResend} className="text-primary font-bold hover:underline">
                Resend
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}