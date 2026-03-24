// src/pages/faculty/FacultyDashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, FileText, Clock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { listRequests } from '../../api/requestAPI.js';
import NeumorphCard from '../../components/ui/NeumorphCard.jsx';
import { statusColor } from '../../utils/format.js';
import { fmtDateTime } from '../../utils/date.js';

export default function FacultyDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // FIX: Only fetch if we have a user, and filter by their ID
    if (user?.id) {
      listRequests({ user_id: user.id })
        .then(r => setRequests(r.data.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [user]); // Added user to the dependency array

  // Because 'requests' is now filtered, these counts will also be personalized!
  const pending = requests.filter(r => r.status === 'PENDING').length;
  const issued  = requests.filter(r => r.status === 'ISSUED').length;

  return (
    <div className="space-y-6">
      <div className="neu-card-lg p-6">
        <p className="text-xs text-muted dark:text-darkMuted uppercase tracking-widest mb-1">Welcome back</p>
        <h2 className="font-display text-2xl font-bold text-primary dark:text-darkText">{user?.name}</h2>
        <p className="text-sm text-muted dark:text-darkMuted mt-1">{user?.email}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NeumorphCard className="p-5 text-center">
          <p className="text-3xl font-display font-bold text-primary dark:text-darkText">{pending}</p>
          <p className="text-xs text-muted dark:text-darkMuted mt-1">Pending</p>
        </NeumorphCard>
        <NeumorphCard className="p-5 text-center">
          <p className="text-3xl font-display font-bold text-info">{issued}</p>
          <p className="text-xs text-muted dark:text-darkMuted mt-1">Currently Issued</p>
        </NeumorphCard>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NeumorphCard hover className="p-6 flex flex-col items-center gap-3 cursor-pointer" onClick={() => navigate('/faculty/new-request')}>
          <PlusCircle size={28} className="text-primary dark:text-darkText" />
          <span className="text-sm font-semibold text-primary dark:text-darkText">New Request</span>
        </NeumorphCard>
        <NeumorphCard hover className="p-6 flex flex-col items-center gap-3 cursor-pointer" onClick={() => navigate('/faculty/my-requests')}>
          <FileText size={28} className="text-muted dark:text-darkMuted" />
          <span className="text-sm font-semibold text-primary dark:text-darkText">My Requests</span>
        </NeumorphCard>
      </div>

      <NeumorphCard className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={15} className="text-muted" />
          <h3 className="font-display font-semibold text-primary dark:text-darkText">Recent</h3>
        </div>
        {loading ? <div className="flex justify-center py-6"><div className="neu-spinner" /></div> : (
          <div className="flex flex-col gap-2">
            {requests.slice(0, 5).map(r => (
              <div key={r.id} className="flex items-center justify-between neu-card-sm p-3">
                <div>
                  <p className="text-xs font-mono text-muted">#{r.id}</p>
                  <p className="text-xs text-primary dark:text-darkText mt-0.5">{r.room_code || 'No room'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`badge ${statusColor(r.status)}`}>{r.status}</span>
                  <span className="text-[10px] text-muted">{fmtDateTime(r.requested_time)}</span>
                </div>
              </div>
            ))}
            {requests.length === 0 && <p className="text-sm text-center text-muted py-4">No requests yet</p>}
          </div>
        )}
      </NeumorphCard>
    </div>
  );
}