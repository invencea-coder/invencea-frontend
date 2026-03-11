import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, FileText } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { listRequests } from '../../api/requestAPI.js';
import NeumorphCard from '../../components/ui/NeumorphCard.jsx';
import { statusColor } from '../../utils/format.js';
import { fmtDateTime } from '../../utils/date.js';

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRequests({})
      .then(r => setRequests(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* User info card - compact */}
      <NeumorphCard className="p-4">
        <p className="text-xs text-muted uppercase tracking-wider">Logged in as</p>
        <p className="text-xl font-display font-bold text-primary">{user?.full_name}</p>
        <p className="text-sm font-mono text-muted">{user?.student_id}</p>
      </NeumorphCard>

      {/* Action buttons - touch friendly */}
      <div className="grid grid-cols-2 gap-4">
        <NeumorphCard
          hover
          className="p-5 flex flex-col items-center gap-3 cursor-pointer"
          onClick={() => navigate('/student/new-request')}
        >
          <PlusCircle size={32} className="text-primary" />
          <span className="text-sm font-semibold text-primary">New Request</span>
        </NeumorphCard>
        <NeumorphCard
          hover
          className="p-5 flex flex-col items-center gap-3 cursor-pointer"
          onClick={() => navigate('/student/my-requests')}
        >
          <FileText size={32} className="text-muted" />
          <span className="text-sm font-semibold text-primary">My Requests</span>
        </NeumorphCard>
      </div>

      {/* Recent requests - compact list */}
      <NeumorphCard className="p-4">
        <h3 className="font-display font-semibold text-primary mb-3">Recent Requests</h3>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="neu-spinner w-6 h-6" />
          </div>
        ) : requests.length === 0 ? (
          <p className="text-sm text-center text-muted py-4">No requests yet</p>
        ) : (
          <div className="space-y-2">
            {requests.slice(0, 5).map(r => (
              <div key={r.id} className="neu-card-sm p-3 flex items-center justify-between">
                <div>
                  <span className="font-mono text-xs text-muted">#{r.id}</span>
                  <p className="text-xs text-primary mt-0.5">{r.room_code || 'No room'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`badge ${statusColor(r.status)}`}>{r.status}</span>
                  <span className="text-[10px] text-muted">{fmtDateTime(r.requested_time)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </NeumorphCard>
    </div>
  );
}