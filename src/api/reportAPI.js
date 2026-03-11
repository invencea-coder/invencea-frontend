import api from './axiosClient.js';

export const getReports = (params) => api.get('/reports/issued', { params });
export const exportReports = (params) =>
  api.get('/reports/export', { params, responseType: 'blob' });
export const deleteReports = (params) => api.delete('/reports', { params });
