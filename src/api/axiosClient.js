// src/api/axiosClient.js
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// Attach token automatically
api.interceptors.request.use(
  (config) => {
    // SECURE FIX: Read from sessionStorage
    const token = sessionStorage.getItem('invencea_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Auto logout if token expired
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // SECURE FIX: Wipe from sessionStorage
      sessionStorage.removeItem('invencea_token');
      
      // If you are on the login page already, don't force a reload to prevent infinite loops
      if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/'; 
      }
    }
    return Promise.reject(error);
  }
);

export default api;