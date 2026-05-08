// src/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import api from '../api/axiosClient.js';

export const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- Restore Session on Mount ---
  const restoreSession = useCallback(async () => {
    const token = sessionStorage.getItem('invencea_token');

    if (!token) {
      setLoading(false);
      return;
    }

    api.defaults.headers.common.Authorization = `Bearer ${token}`;

    try {
      const res = await api.get('/auth/me');
      const userData = res.data?.data ?? res.data;
      setUser(userData);
    } catch (err) {
      console.error('Session restoration failed:', err);
      sessionStorage.removeItem('invencea_token');
      delete api.defaults.headers.common.Authorization;
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // --- Login ---
  const login = useCallback(async (token, userData = null) => {
    sessionStorage.setItem('invencea_token', token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;

    if (userData) {
      setUser(userData);
      return userData;
    }

    try {
      const res = await api.get('/auth/me');
      const data = res.data?.data ?? res.data;
      setUser(data);
      return data;
    } catch (err) {
      sessionStorage.removeItem('invencea_token');
      delete api.defaults.headers.common.Authorization;
      throw err;
    }
  }, []);

// --- Logout ---
  const logout = async () => {
    try {
      await api.post('/auth/logout'); 
    } catch (error) {
      console.warn('Backend logout notification failed, but clearing session anyway.');
    } finally {
      // ⚡ THE FIX: Use sessionStorage and the correct key name!
      sessionStorage.removeItem('invencea_token');
      delete api.defaults.headers.common['Authorization'];
      setUser(null);
    }
  };

  // --- Update User (Utility) ---
  const updateUser = useCallback((newData) => {
    setUser((prev) => ({ ...prev, ...newData }));
  }, []);

  // --- Refresh User ---
  // Re-fetches the current user from /auth/me and updates state.
  // Called by ForceChangePasswordModal after a successful password reset
  // so needs_password_reset flips to false and the modal closes.
  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      const userData = res.data?.data ?? res.data;
      setUser(userData);
      return userData;
    } catch (err) {
      console.error('Failed to refresh user:', err);
      throw err;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        updateUser,
        refreshUser,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
