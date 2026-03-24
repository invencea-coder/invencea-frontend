// src/pages/auth/StudentLogin.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowLeft, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';

// Import your custom hooks and API functions
import { useAuth } from '../../hooks/useAuth.js'; 
import { studentLogin } from '../../api/authAPI.js'; // Using your API service!

// UI Components
import NeumorphCard from '../../components/ui/NeumorphCard.jsx';
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';

export default function StudentLogin() {
  const navigate = useNavigate();
  const { login } = useAuth(); 
  
  // Updated state to match your API parameters
  const [formData, setFormData] = useState({ student_id: '', pin: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = (field, value) => {
    // If it's the PIN, restrict it to numbers only and max 4 digits
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
      // Use your dedicated API function
      const res = await studentLogin(formData.student_id, formData.pin);
      // Extract the token and user data from your backend response
      const token = res.data?.token || res.data?.data?.token;
      const userData = res.data?.user || res.data?.data?.user || res.data?.data;

      if (!token) throw new Error("No token received from server");

      // Pass the token and user to your AuthContext to establish the session
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface dark:bg-darkSurface px-4">
      <div className="animate-slide-up w-full max-w-md">
        
        {/* Back Button */}
        <button 
          onClick={() => navigate('/')}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted hover:text-primary transition-colors"
        >
          <ArrowLeft size={16} /> Back to roles
        </button>

        <NeumorphCard className="p-8 relative overflow-hidden">
          {/* Decorative background element */}
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-success/10 rounded-full blur-2xl pointer-events-none" />

          <div className="text-center mb-8 relative z-10">
            <div className="w-16 h-16 mx-auto neu-card-sm flex items-center justify-center bg-gradient-to-br from-success/10 to-info/5 mb-4 rounded-full">
              <GraduationCap size={32} className="text-primary dark:text-darkText" />
            </div>
            <h2 className="font-display text-2xl font-bold text-primary dark:text-darkText">Student Login</h2>
            <p className="text-sm text-muted mt-2">Enter your details to access the InvenCEA system.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
            <NeumorphInput 
              label="Full Name" 
              type="text" 
              placeholder="e.g., Juan Dela Cruz" 
              value={formData.full_name} 
              onChange={e => handleChange('full_name', e.target.value)} 
              autoFocus 
            />
            
            <NeumorphInput 
              label="Student ID" 
              type="text" 
              placeholder="e.g., 2021-0001" 
              value={formData.student_id} 
              onChange={e => handleChange('student_id', e.target.value)} 
            />

            <NeumorphInput 
              label="4-Digit Security PIN(default: 1234)" 
              type="password" 
              inputMode="numeric"
              placeholder="••••" 
              value={formData.pin} 
              onChange={e => handleChange('pin', e.target.value)} 
            />

            <div className="pt-4">
              <NeumorphButton 
                variant="primary" 
                type="submit" 
                loading={loading}
                className="w-full py-3 flex justify-center items-center gap-2 text-base"
              >
                {!loading && <LogIn size={18} />}
                {loading ? 'Authenticating...' : 'Sign In'}
              </NeumorphButton>
            </div>
          </form>
        </NeumorphCard>

      </div>
    </div>
  );
}