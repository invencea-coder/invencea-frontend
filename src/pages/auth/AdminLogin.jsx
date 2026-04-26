import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Mail, Lock, ArrowLeft } from 'lucide-react';
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
      const payload = res.data?.data ?? res.data;
      const token = payload?.token;
      const userData = payload?.user;

      if (!token) throw new Error('Authentication failed: No token received');

      await login(token, userData);

      // Capitalize the role for the toast message (e.g., "Manager" or "Admin")
      const roleName = userData.role.charAt(0).toUpperCase() + userData.role.slice(1);
      toast.success(`${roleName} login successful`);
      
      // DYNAMIC ROUTING: Navigate based on the user's role 
      // Admin goes to '/admin', Manager goes to '/manager'
      navigate(`/${userData.role}`, { replace: true });
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Invalid credentials';
      setErr(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#e0e5ec] dark:bg-darkSurface px-4 py-8">
      <div className="animate-in fade-in zoom-in-95 duration-500 w-full max-w-[400px]">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Selection
        </button>

        <div className="bg-white/80 backdrop-blur-md p-8 rounded-3xl shadow-sm border border-black/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/10 mb-6 shadow-inner mx-auto relative z-10">
            <Shield size={28} className="text-primary" />
          </div>
          
          <div className="text-center mb-8 relative z-10">
            <h2 className="font-display text-2xl font-black text-gray-900 tracking-tight">System Portal</h2>
            <p className="text-sm font-medium text-gray-500 mt-1">Admin & Manager Login.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 relative z-10">
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
            <div className="pt-2">
              <NeumorphButton
                type="submit"
                variant="primary"
                loading={loading}
                className="w-full py-3.5 flex justify-center items-center gap-2 text-base font-black rounded-xl shadow-md shadow-primary/20"
              >
                Sign In
              </NeumorphButton>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}