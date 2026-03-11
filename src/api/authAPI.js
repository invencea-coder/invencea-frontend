// src/api/authAPI.js
import api from './axiosClient.js';

export const adminLogin = (data) => api.post('/auth/admin/login', data);
export const sendOTP = (email) => api.post('/auth/faculty/send-otp', { email });
export const verifyOTP = (email, code) => api.post('/auth/faculty/verify-otp', { email, code });
export const studentLogin = (full_name, student_id) => api.post('/auth/student/login', { full_name, student_id });
export const logout = () => api.post('/auth/logout');
export const getMe = () => api.get('/auth/me');