import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Mail, ArrowLeft, Send, CornerDownLeft } from 'lucide-react';
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
    if (e) e.preventDefault(); // Handle both button clicks and keyboard events
    
    // 1. Client-Side Validation (Immediate feedback for the user)
    if (!email.trim()) { 
      setErr('Email address is required.'); 
      return; 
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErr('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setErr(''); // Clear any previous errors

    try {
      await sendOTP(email.trim());
      toast.success('OTP sent to your email!');
      navigate('/login/faculty/otp', { state: { email: email.trim() } });
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to send OTP. Please try again.';
      setErr(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Explicitly listen for the Enter key to guarantee submission
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#e0e5ec] dark:bg-darkSurface px-4 py-8">
      <div className="animate-in fade-in zoom-in-95 duration-500 w-full max-w-[400px]">
        
        {/* Adjusted back button for better touch targets on mobile */}
        <button
          onClick={() => navigate('/')}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-primary mb-6 transition-colors disabled:opacity-50"
          aria-label="Go back to selection"
        >
          <ArrowLeft size={14} /> Back to Selection
        </button>

        <div className="bg-white/80 backdrop-blur-md p-8 rounded-3xl shadow-sm border border-black/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-info/10 to-primary/5 mb-6 shadow-inner mx-auto relative z-10">
            <BookOpen size={28} className="text-primary" />
          </div>
          
          <div className="text-center mb-8 relative z-10">
            <h2 className="font-display text-2xl font-black text-gray-900 tracking-tight">Faculty Login</h2>
            <p className="text-sm font-medium text-gray-500 mt-1">Enter your Gmail to receive a one-time password.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 relative z-10">
            <NeumorphInput
              label="Gmail Address"
              id="email"
              type="email"
              placeholder="you@gmail.com"
              value={email}
              disabled={loading}
              onChange={(e) => { 
                setEmail(e.target.value); 
                if (err) setErr(''); // Instantly clear error state when user starts typing
              }}
              onKeyDown={handleKeyDown}
              icon={<Mail size={14} />}
              error={err}
              autoComplete="email"
              autoFocus
            />
            
            <div className="pt-2">
              <NeumorphButton
                type="submit"
                variant="primary"
                loading={loading}
                disabled={loading || !email.trim()} // Prevent clicking if empty or loading
                onClick={handleSubmit}
                className="w-full py-3.5 flex justify-center items-center gap-2 text-base font-black rounded-xl shadow-md shadow-primary/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {!loading && <Send size={16} />} 
                Send OTP
                {!loading && <CornerDownLeft size={14} className="opacity-60 ml-1" />}
              </NeumorphButton>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}