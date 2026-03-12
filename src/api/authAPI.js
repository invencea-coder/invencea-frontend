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

// Student Access
export const studentLogin = (full_name, student_id) => api.post('/auth/student/login', { full_name, student_id });

// Session Management
export const logout = () => api.post('/auth/logout');
export const getMe = () => api.get('/auth/me');