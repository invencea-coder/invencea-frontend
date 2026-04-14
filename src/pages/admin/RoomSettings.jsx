import React, { useEffect, useState, useCallback } from 'react';
import { DoorOpen, DoorClosed, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import NeumorphModal from '../../components/ui/NeumorphModal.jsx';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';

export default function RoomSettings() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [reasonInput, setReasonInput] = useState('');
  const [pendingRoom, setPendingRoom] = useState(null);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/rooms');
      const allRooms = res.data?.data ?? res.data ?? [];
      setRooms(allRooms);
    } catch {
      toast.error('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const myRoom = rooms.find(r => r.id === user?.room_id);

  const handleToggleClick = (room) => {
    if (room.is_available) {
      setPendingRoom(room);
      setReasonInput('');
      setShowReasonModal(true);
    } else {
      performToggle(room, null);
    }
  };

  const performToggle = async (room, reason) => {
    setToggling(room.id);
    try {
      // Fixed: was /admin/rooms/:id/availability, correct path is /rooms/:id/availability
      await api.put(`/rooms/${room.id}/availability`, {
        is_available: !room.is_available,
        reason: reason,
      });
      toast.success(`${room.name ?? room.code} marked as ${!room.is_available ? 'available' : 'unavailable'}`);
      fetchRooms();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Update failed');
    } finally {
      setToggling(null);
      setShowReasonModal(false);
      setPendingRoom(null);
    }
  };

  const handleReasonSubmit = () => {
    if (!reasonInput.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    performToggle(pendingRoom, reasonInput);
  };

  if (!user?.room_id) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="neu-card py-16 text-center text-sm text-muted dark:text-darkMuted">
          You are not assigned to any room. Please contact an administrator.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary dark:text-darkText">Room Availability</h1>
          <p className="text-sm text-muted dark:text-darkMuted mt-0.5">
            Temporarily Close Room to Reservations.
          </p>
        </div>
        <button onClick={fetchRooms} className="neu-btn p-2.5" title="Refresh">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Room card */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : !myRoom ? (
        <div className="neu-card py-16 text-center text-sm text-muted dark:text-darkMuted">
          Room not found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <div
            key={myRoom.id}
            className={`neu-card p-5 flex items-center gap-4 transition-all ${!myRoom.is_available ? 'opacity-60' : ''}`}
          >
            <div className={`neu-card-sm w-12 h-12 flex items-center justify-center flex-shrink-0
              ${myRoom.is_available ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              {myRoom.is_available ? <DoorOpen size={22} /> : <DoorClosed size={22} />}
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-primary dark:text-darkText truncate">{myRoom.name ?? myRoom.code}</p>
              <p className="text-xs text-muted dark:text-darkMuted font-mono">{myRoom.code}</p>
              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium
                ${myRoom.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {myRoom.is_available ? 'Available' : 'Unavailable'}
              </span>
              {!myRoom.is_available && myRoom.unavailable_reason && (
                <p className="text-xs text-muted mt-1 italic">Reason: {myRoom.unavailable_reason}</p>
              )}
            </div>

            <button
              onClick={() => handleToggleClick(myRoom)}
              disabled={toggling === myRoom.id}
              className={`flex-shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                ${myRoom.is_available ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              title={myRoom.is_available ? 'Mark unavailable' : 'Mark available'}
            >
              {toggling === myRoom.id ? (
                <Loader2 size={12} className="animate-spin mx-auto text-white" />
              ) : (
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                    ${myRoom.is_available ? 'translate-x-6' : 'translate-x-1'}`}
                />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Reason Modal */}
      <NeumorphModal open={showReasonModal} onClose={() => setShowReasonModal(false)} title="Mark Room Unavailable">
        <div className="space-y-4 p-2">
          <p className="text-sm text-muted">Please provide a reason why the room is unavailable. This will be shown to students and faculties.</p>
          <NeumorphInput
            label="Reason"
            placeholder="e.g. Maintenance, cleaning, etc."
            value={reasonInput}
            onChange={(e) => setReasonInput(e.target.value)}
            className="w-full"
            multiline
            rows={3}
          />
          <div className="flex justify-end gap-2 pt-2">
            <NeumorphButton onClick={() => setShowReasonModal(false)} variant="outline" size="sm">Cancel</NeumorphButton>
            <NeumorphButton onClick={handleReasonSubmit} variant="primary" size="sm">Confirm</NeumorphButton>
          </div>
        </div>
      </NeumorphModal>

      {/* Info note */}
      <div className="neu-card p-4 flex gap-3 items-start">
        <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-blue-600 dark:text-blue-400 text-xs font-bold">i</span>
        </div>
        <p className="text-xs text-muted dark:text-darkMuted leading-relaxed">
  When your room is marked <strong className="text-primary dark:text-darkText">unavailable</strong>, new borrow requests for this room will be <strong className="text-primary dark:text-darkText">blocked</strong> and cannot be submitted. Existing approved requests are not affected.
</p>
      </div>
    </div>
  );
}
