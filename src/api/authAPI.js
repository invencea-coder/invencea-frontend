import api from './axiosClient.js';

/**
 * AUTH API SERVICE
 * All calls use the base instance configured with VITE_API_URL
 */

// Admin/System Manager Login
export const adminLogin = (data) => api.post('/auth/admin/login', data);

// Faculty OTP Workflow
export const sendOTP = (email) => api.post('/auth/faculty/send-otp', { email });
export const verifyOTP = (email, code) => api.post('/auth/faculty/verify-otp', { email, code });

// Student Access - FIXED: Now accepts and sends the 4-digit PIN
export const studentLogin = (full_name, student_id, pin) => 
  api.post('/auth/student/login', { full_name, student_id, pin });

// Student - Change PIN
export const changeStudentPin = (data) => api.put('/auth/student/change-pin', data);

// Session Management
export const logout = () => api.post('/auth/logout');
export const getMe = () => api.get('/auth/me');