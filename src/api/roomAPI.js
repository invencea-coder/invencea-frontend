import api from './axiosClient.js';

export const listRooms = () => api.get('/rooms');
export const setRoomAvailability = (id, is_available) =>
  api.put(`/admin/rooms/${id}/availability`, { is_available });
