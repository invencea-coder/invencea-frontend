// src/api/requestAPI.js
import api from './axiosClient.js';

export const listRequests = (params) => api.get('/requests', { params });
export const getRequest = (id) => api.get(`/requests/${id}`);
export const getRequestByQR = (code) => api.get(`/requests/qr/${code}`);
export const createRequest = (data) => api.post('/requests', data);

export const approveRequest = (id, data = {}) => api.put(`/requests/${id}/approve`, data);
export const rejectRequest = (id, data = {}) => api.put(`/requests/${id}/reject`, data);
export const issueRequest = (id, data) => api.put(`/requests/${id}/issue`, data);
// Legacy full-request manual return (kept for backward compatibility/emergencies)
export const returnRequest = (id) => api.put(`/requests/${id}/return`);

// --- NEW: Phase 3 Barcode Return Engine ---
// Expects: { barcode: "12345", condition: "Good" }
export const returnItemByBarcode = (data) => api.post('/requests/return-barcode', data);