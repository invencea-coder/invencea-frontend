import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useSocket } from '../../hooks/useSocket.js';

export default function Navbar({ pageTitle }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);

  useSocket((event, data) => {
    setNotifications((prev) => [{ id: Date.now(), event, ...data }, ...prev.slice(0, 19)]);
  });

  const unread = notifications.length;

  return (
    <header className="flex items-center justify-between px-6 py-4 neu-card rounded-none rounded-b-2xl mb-6">
      <div>
        <h1 className="font-display font-semibold text-xl text-primary">{pageTitle}</h1>
        <p className="text-xs text-muted">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotif(!showNotif)}
            className="neu-btn w-9 h-9 flex items-center justify-center text-muted hover:text-primary"
          >
            <Bell size={16} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-warning text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {showNotif && (
            <div className="absolute right-0 top-12 w-72 neu-card-lg z-40 animate-fade-in">
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-primary">Notifications</p>
                <button onClick={() => setNotifications([])} className="text-xs text-muted hover:text-primary">Clear all</button>
              </div>
              <hr className="neu-divider mx-3" />
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-xs text-center text-muted py-6">No notifications</p>
                ) : notifications.map((n) => (
                  <div key={n.id} className="px-4 py-2.5 hover:bg-shadow/30">
                    <p className="text-xs font-semibold text-primary">{n.title || n.event}</p>
                    <p className="text-xs text-muted mt-0.5">{n.message || ''}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}