import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendOTP } from '../../api/authAPI.js';
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';

export default function FacultyLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) { setErr('Email is required'); return; }
    setLoading(true);
    try {
      await sendOTP(email);
      toast.success('OTP sent to your email!');
      navigate('/login/faculty/otp', { state: { email } });
    } catch (e) {
      const msg = e.response?.data?.message || 'Failed to send OTP';
      setErr(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-darkSurface px-4">
      <div className="w-full max-w-sm animate-slide-up">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-primary dark:hover:text-darkText mb-6 transition-colors"
        >
          <ArrowLeft size={13} /> Back
        </button>

        <div className="neu-card-lg p-8">
          <div className="neu-card-sm w-12 h-12 flex items-center justify-center mb-5">
            <Mail size={22} className="text-primary dark:text-darkText" />
          </div>
          <h2 className="font-display text-2xl font-bold text-primary dark:text-darkText">Faculty Login</h2>
          <p className="text-sm text-muted dark:text-darkMuted mt-1 mb-6">Enter your Gmail to receive an OTP.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <NeumorphInput
              label="Gmail Address"
              id="email"
              type="email"
              placeholder="you@gmail.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErr(''); }}
              icon={<Mail size={14} />}
              error={err}
              autoComplete="email"
              autoFocus
            />
            <NeumorphButton
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              icon={<Send size={15} />}
              className="w-full justify-center mt-1"
            >
              Send OTP
            </NeumorphButton>
          </form>
        </div>
      </div>
    </div>
  );
}
