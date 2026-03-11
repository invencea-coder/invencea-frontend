import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Hash, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { studentLogin } from '../../api/authAPI.js';
import { useAuth } from '../../hooks/useAuth.js';
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';

export default function StudentLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ full_name: '', student_id: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.full_name.trim()) e.full_name = 'Full name is required';
    if (!form.student_id.trim()) e.student_id = 'Student ID is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { data } = await studentLogin(form.full_name.trim(), form.student_id.trim());
      login(data.data.token, data.data.user);
      toast.success(`Welcome, ${data.data.user.full_name}!`);
      navigate('/student');
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed';
      toast.error(msg);
      setErrors({ student_id: msg });
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
            <User size={22} className="text-primary dark:text-darkText" />
          </div>
          <h2 className="font-display text-2xl font-bold text-primary dark:text-darkText">Student Login</h2>
          <p className="text-sm text-muted dark:text-darkMuted mt-1 mb-6">Enter your full name and student ID.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <NeumorphInput
              label="Full Name"
              id="full_name"
              type="text"
              placeholder="e.g. Juan dela Cruz"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              icon={<User size={14} />}
              error={errors.full_name}
              autoFocus
            />
            <NeumorphInput
              label="Student ID"
              id="student_id"
              type="text"
              placeholder="e.g. 2021-00001"
              value={form.student_id}
              onChange={(e) => setForm({ ...form, student_id: e.target.value })}
              icon={<Hash size={14} />}
              error={errors.student_id}
            />
            <NeumorphButton
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              icon={<LogIn size={15} />}
              className="w-full justify-center mt-1"
            >
              Log In
            </NeumorphButton>
          </form>

          <p className="text-center text-xs text-muted dark:text-darkMuted mt-4">
            First time? You'll be auto-registered.
          </p>
        </div>
      </div>
    </div>
  );
}
