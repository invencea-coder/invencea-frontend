import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from './useAuth.js';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

let socket = null;

export const useSocket = (onEvent) => {
  const { user } = useAuth();
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!user) return;

    if (!socket || !socket.connected) {
      socket = io(SOCKET_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: { token: localStorage.getItem('invencea_token') },
      });

      socket.on('connect', () => {
        socket.emit('join', user.id);
      });
    }

    const handleEvent = (event, data) => {
      if (callbackRef.current) callbackRef.current(event, data);
    };

    const events = ['request-approved', 'request-issued', 'inventory-updated', 'reminder', 'request-expired'];

    events.forEach((evt) => {
      socket.on(evt, (data) => {
        handleEvent(evt, data);
        // Show toast for user-relevant events
        const labels = {
          'request-approved': '✅ Request approved!',
          'request-issued': '📦 Items issued',
          'inventory-updated': '🔄 Inventory updated',
          'reminder': '⏰ Overdue reminder',
          'request-expired': '⚠️ Request expired',
        };
        if (labels[evt]) toast(labels[evt], { duration: 4000 });
      });
    });

    return () => {
      events.forEach((evt) => socket?.off(evt));
    };
  }, [user]);

  return socket;
};
