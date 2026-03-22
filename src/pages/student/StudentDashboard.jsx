import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, FileText, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth.js';
import { listRequests } from '../../api/requestAPI.js';
import { changeStudentPin } from '../../api/authAPI.js';
import NeumorphCard from '../../components/ui/NeumorphCard.jsx';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';
import NeumorphModal from '../../components/ui/NeumorphModal.jsx';
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';
import { statusColor } from '../../utils/format.js';
import { fmtDateTime } from '../../utils/date.js';

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Change PIN State ---
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinForm, setPinForm] = useState({ current_pin: '', new_pin: '', confirm_pin: '' });
  const [changingPin, setChangingPin] = useState(false);

  useEffect(() => {
    listRequests({})
      .then(r => setRequests(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // --- Change PIN Handlers ---
  const handlePinChangeInput = (field, value) => {
    const onlyNums = value.replace(/\D/g, '');
    if (onlyNums.length <= 4) setPinForm({ ...pinForm, [field]: onlyNums });
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    if (pinForm.new_pin.length !== 4) return toast.error('New PIN must be exactly 4 digits.');
    if (pinForm.new_pin !== pinForm.confirm_pin) return toast.error('New PINs do not match.');

    setChangingPin(true);
    try {
      await changeStudentPin({ current_pin: pinForm.current_pin, new_pin: pinForm.new_pin });
      toast.success('Security PIN changed successfully!');
      setIsPinModalOpen(false);
      setPinForm({ current_pin: '', new_pin: '', confirm_pin: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change PIN');
    } finally {
      setChangingPin(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* User info card - compact with Change PIN button */}
      <NeumorphCard className="p-4 flex justify-between items-start">
        <div>
          <p className="text-xs text-muted uppercase tracking-wider">Logged in as</p>
          <p className="text-xl font-display font-bold text-primary">{user?.full_name}</p>
          <p className="text-sm font-mono text-muted">{user?.student_id}</p>
        </div>
        <NeumorphButton 
          variant="outline" 
          size="sm" 
          onClick={() => setIsPinModalOpen(true)} 
          className="flex items-center gap-2 text-xs"
        >
          <KeyRound size={14} /> Change PIN
        </NeumorphButton>
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

      {/* Change PIN Modal */}
      <NeumorphModal open={isPinModalOpen} onClose={() => setIsPinModalOpen(false)} title="Change Your Security PIN">
        <form onSubmit={handlePinSubmit} className="space-y-4 p-2 mt-2">
          <NeumorphInput
            label="Current PIN"
            type="password"
            inputMode="numeric"
            placeholder="••••"
            value={pinForm.current_pin}
            onChange={e => handlePinChangeInput('current_pin', e.target.value)}
            autoFocus
          />
          <NeumorphInput
            label="New 4-Digit PIN"
            type="password"
            inputMode="numeric"
            placeholder="••••"
            value={pinForm.new_pin}
            onChange={e => handlePinChangeInput('new_pin', e.target.value)}
          />
          <NeumorphInput
            label="Confirm New PIN"
            type="password"
            inputMode="numeric"
            placeholder="••••"
            value={pinForm.confirm_pin}
            onChange={e => handlePinChangeInput('confirm_pin', e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-4 border-t mt-4">
            <NeumorphButton variant="outline" type="button" onClick={() => setIsPinModalOpen(false)}>Cancel</NeumorphButton>
            <NeumorphButton variant="primary" type="submit" loading={changingPin}>Update PIN</NeumorphButton>
          </div>
        </form>
      </NeumorphModal>
    </div>
  );
}