// src/api/inventoryAPI.js
import api from './axiosClient.js';

export const listInventory = (params) => api.get('/inventory', { params });

// ─── Unified CRUD (Used by the new dynamic Inventory.jsx) ───
export const addInventoryItem = (data) => api.post('/inventory', data);
export const updateInventoryItem = (id, data) => api.put(`/inventory/${id}`, data);
export const deleteInventoryItem = (id, type, inventory_mode) => api.delete(`/inventory/${id}`, { params: { type, inventory_mode } });

// Aliases for backward compatibility
export const createItem = addInventoryItem;
export const updateItem = updateInventoryItem;
export const deleteItem = (id, params = {}) => api.delete(`/inventory/${id}`, { params });

// ─── Granular endpoints (admin internal) ───
export const listInventoryTypes = () => api.get('/inventory/types');
export const createType = (data) => api.post('/inventory/types', data);

export const addItem = (data) => api.post('/inventory/items', data); 
export const updateBorrowableItem = (id, data) => api.put(`/inventory/items/${id}`, data);
export const deleteBorrowableItem = (id) => api.delete(`/inventory/items/${id}`);

export const addConsumable = (data) => api.post('/inventory/consumables', data);
export const updateConsumable = (id, data) => api.put(`/inventory/consumables/${id}`, data);
export const deleteConsumable = (id) => api.delete(`/inventory/consumables/${id}`);