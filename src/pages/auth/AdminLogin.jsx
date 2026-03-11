import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';
import { adminLogin } from '../../api/authAPI.js';
import { useAuth } from '../../hooks/useAuth.js';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return setErr('Email and password are required');

    setLoading(true);
    setErr('');

    try {
      const res = await adminLogin({ email, password });

      // Unwrap the { success, message, data: { token, user } } envelope
      const payload = res.data?.data ?? res.data;
      const token = payload?.token;
      const userData = payload?.user;

      if (!token) throw new Error('Authentication failed: No token received');

      await login(token, userData);

      toast.success('Admin login successful');
      navigate('/admin', { replace: true });
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Invalid credentials';
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
          className="flex items-center gap-1.5 text-xs text-muted hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft size={13} /> Back to Selection
        </button>

        <div className="neu-card-lg p-8">
          <div className="neu-card-sm w-12 h-12 flex items-center justify-center mb-5">
            <Lock size={22} className="text-primary" />
          </div>
          <h2 className="font-display text-2xl font-bold text-primary mb-1">Admin Portal</h2>
          <p className="text-sm text-muted mb-6">Enter your credentials to manage inventory.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <NeumorphInput
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={14} />}
              error={err}
              autoComplete="email"
            />
            <NeumorphInput
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock size={14} />}
              error={err}
              autoComplete="current-password"
            />
            <NeumorphButton
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full justify-center mt-2"
            >
              Sign In
            </NeumorphButton>
          </form>
        </div>
      </div>
    </div>
  );
}
