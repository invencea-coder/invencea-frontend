import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowLeft, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth.js'; 
import { studentLogin } from '../../api/authAPI.js'; 
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';

export default function StudentLogin() {
  const navigate = useNavigate();
  const { login } = useAuth(); 
  
  const [formData, setFormData] = useState({ student_id: '', pin: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = (field, value) => {
    if (field === 'pin') {
      const onlyNums = value.replace(/\D/g, '');
      if (onlyNums.length <= 4) {
        setFormData({ ...formData, [field]: onlyNums });
      }
      return;
    }
    setFormData({ ...formData, [field]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.student_id.trim() || !formData.pin.trim()) {
      return toast.error('Please enter your Student ID and PIN.');
    }
    
    if (formData.pin.length !== 4) {
      return toast.error('PIN must be exactly 4 digits.');
    }

    setLoading(true);
    try {
      const res = await studentLogin(formData.student_id, formData.pin);
      const token = res.data?.token || res.data?.data?.token;
      const userData = res.data?.user || res.data?.data?.user || res.data?.data;

      if (!token) throw new Error("No token received from server");

      await login(token, userData); 
      
      toast.success('Login successful!');
      navigate('/student'); 
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid credentials. Please try again.');
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
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

          <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-success/10 to-info/5 mb-6 shadow-inner mx-auto relative z-10">
            <GraduationCap size={28} className="text-primary dark:text-darkText" />
          </div>
          
          <div className="text-center mb-8 relative z-10">
            <h2 className="font-display text-2xl font-black text-gray-900 tracking-tight">Student Login</h2>
            <p className="text-sm font-medium text-gray-500 mt-1">Enter your details to access the system.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
            <NeumorphInput 
              label="Student ID" 
              type="text" 
              placeholder="e.g., 2021-0001" 
              value={formData.student_id} 
              onChange={e => handleChange('student_id', e.target.value)} 
              autoFocus
            />

            <NeumorphInput 
              label="4-Digit Security PIN (default: 1234)" 
              type="password" 
              inputMode="numeric"
              placeholder="••••" 
              value={formData.pin} 
              onChange={e => handleChange('pin', e.target.value)} 
            />

            <div className="pt-2">
              <NeumorphButton 
                variant="primary" 
                type="submit" 
                loading={loading}
                className="w-full py-3.5 flex justify-center items-center gap-2 text-base font-black rounded-xl shadow-md shadow-primary/20"
              >
                {!loading && <LogIn size={18} />}
                {loading ? 'Authenticating...' : 'Sign In'}
              </NeumorphButton>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}