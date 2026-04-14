import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { Bell } from 'lucide-react';
import { listRequests } from '../../api/requestAPI';

const titleMap = {
  '/admin': 'Dashboard',
  '/admin/inventory': 'Inventory',
  '/admin/requests': 'Requests',
  '/admin/reports': 'Reports',
  '/admin/rooms': 'Room Settings',
  '/admin/return-scanner': 'Return Scanner',
  '/faculty': 'Dashboard',
  '/faculty/new-request': 'New Request',
  '/faculty/my-requests': 'My Requests',
  '/student': 'Dashboard',
  '/student/new-request': 'New Request',
  '/student/my-requests': 'My Requests',
};

export default function DashboardLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  
  const pageTitle = titleMap[location.pathname] || 'InvenCEA';
  const isAdmin = user?.role === 'admin';

  // Fetch count of items requiring attention (Pending/Pending Approval)
  const fetchPendingCount = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await listRequests({ status: 'PENDING,PENDING APPROVAL' });
      const data = res.data?.data || [];
      setPendingCount(data.length);
    } catch (err) {
      console.error("Error fetching pending count:", err);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchPendingCount();
  }, [fetchPendingCount, location.pathname]);

  // Global Socket Listener
  useEffect(() => {
    if (!isAdmin) return;

    const socketURL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';
    const socket = io(socketURL);

    socket.on('new-request', (newReq) => {
      // 1. Play Sound (Requires notification.mp3 in /public folder)
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => console.log("Audio playback blocked by browser"));

      // 2. Update Badge
      setPendingCount(prev => prev + 1);

      // 3. Show Clickable Toast
      toast.custom((t) => (
        <div
          onClick={() => {
            toast.dismiss(t.id);
            navigate('/admin/requests');
          }}
          className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-black/5 cursor-pointer border-l-4 border-primary`}
        >
          <div className="flex-1 w-0 p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Bell size={20} className="animate-bounce" />
                </div>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-bold text-gray-900">New Request Alert!</p>
                <p className="mt-1 text-xs text-gray-500">
                  Request #{newReq.id} received in {newReq.room_code || 'your room'}. Click to view.
                </p>
              </div>
            </div>
          </div>
        </div>
      ), { position: 'top-right', duration: 5000 });
    });

    // Listen for updates to decrement badge when admin approves/rejects
    socket.on('request-updated', () => fetchPendingCount());

    return () => socket.disconnect();
  }, [isAdmin, navigate, fetchPendingCount]);

  return (
    <div className="flex min-h-screen bg-surface w-full overflow-hidden">
      <Sidebar 
        pendingCount={pendingCount} 
        isOpen={isMobileMenuOpen} 
        setIsOpen={setIsMobileMenuOpen} 
      />

      <div className="flex-1 flex flex-col min-h-screen w-full min-w-0">
        <Navbar 
          pageTitle={pageTitle} 
          onMenuClick={() => setIsMobileMenuOpen(true)} 
        />
        <main className="flex-1 px-4 md:px-6 pb-8 overflow-y-auto page-enter">
          <Outlet />
        </main>
      </div>
    </div>
  );
}