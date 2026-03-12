// src/components/admin/RetroactiveLogModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { History, Trash2, ZapOff, Hash, GraduationCap, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosClient';
import { useAuth } from '../../context/AuthContext';
import NeumorphModal from '../ui/NeumorphModal';
import NeumorphInput from '../ui/NeumorphInput';
import NeumorphButton from '../ui/NeumorphButton';

export default function RetroactiveLogModal({ isOpen, onClose, onSuccess }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const [requesterType, setRequesterType] = useState('student');
  const [fullName, setFullName] = useState('');
  const [purpose, setPurpose] = useState('Blackout Manual Log');
  const [studentId, setStudentId] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [requestedAt, setRequestedAt] = useState('');
  const [approvedAt, setApprovedAt]   = useState('');
  const [issuedAt, setIssuedAt]       = useState('');
  const [returnedAt, setReturnedAt]   = useState('');
  const [barcodes, setBarcodes]             = useState([]);
  const [currentBarcode, setCurrentBarcode] = useState('');
  const barcodeInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => document.getElementById('retro-student-id')?.focus(), 100);
    } else {
      setRequesterType('student');
      setStudentId('');
      setFacultyId('');
      setFullName('');
      setPurpose('Blackout Manual Log');
      setRequestedAt('');
      setApprovedAt('');
      setIssuedAt('');
      setReturnedAt('');
      setBarcodes([]);
      setCurrentBarcode('');
    }
  }, [isOpen]);

  useEffect(() => {
    setStudentId('');
    setFacultyId('');
  }, [requesterType]);

  const handleRequestedTimeChange = (e) => {
    const time = e.target.value;
    setRequestedAt(time);
    if (!approvedAt) setApprovedAt(time);
    if (!issuedAt)   setIssuedAt(time);
  };

  const handleBarcodeKeyDown = (e) => {
    if (e.key === 'Enter' && currentBarcode.trim() !== '') {
      e.preventDefault();
      const code = currentBarcode.trim();
      if (barcodes.includes(code)) {
        toast.error('Barcode already added!');
      } else {
        setBarcodes([...barcodes, code]);
      }
      setCurrentBarcode('');
    }
  };

  const removeBarcode = (index) => setBarcodes(barcodes.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!fullName) return toast.error('Full name is required');
    if (requesterType === 'student' && !studentId) return toast.error('Student ID is required');
    if (!user?.room_id || user.room_id === 'null') return toast.error('You are not assigned to a room.');
    if (!requestedAt || !approvedAt || !issuedAt) return toast.error('Requested, Approved, and Issued times are required.');
    if (barcodes.length === 0) return toast.error('Please scan at least one item');

    setLoading(true);
    try {
      const payload = {
        student_id_number: requesterType === 'student' ? studentId : (facultyId || 'N/A'),
        full_name:      fullName,
        room_id:        user.room_id,
        purpose,
        barcodes,
        requester_type: requesterType,
        requested_time: new Date(requestedAt).toISOString(),
        approved_time:  new Date(approvedAt).toISOString(),
        issued_time:    new Date(issuedAt).toISOString(),
        returned_time:  returnedAt ? new Date(returnedAt).toISOString() : null,
      };

      await api.post('/admin/requests/retroactive', payload);
      toast.success('Paper log successfully injected!');
      if (onSuccess) onSuccess();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to inject manual log');
    } finally {
      setLoading(false);
    }
  };

  const isFaculty = requesterType === 'faculty';

  return (
    <NeumorphModal open={isOpen} onClose={onClose} title="Blackout Recovery Log">
      {/* Scrollable container — caps height so it never overflows the viewport */}
      <div>
        <div className="space-y-4 p-1">

          {/* Warning banner — compact */}
          <div className="bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg flex gap-2 text-amber-800">
            <ZapOff size={16} className="flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong>Power Outage Recovery:</strong> Encode paper records. Fill "Returned At" if the item was already returned to skip affecting stock.
            </p>
          </div>

          {/* Requester Type Toggle */}
          <div className="flex gap-1.5 p-1 bg-black/5 rounded-xl">
            <button
              onClick={() => setRequesterType('student')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                !isFaculty ? 'bg-white shadow text-primary' : 'text-muted hover:text-gray-700'
              }`}
            >
              <GraduationCap size={13} /> Student
            </button>
            <button
              onClick={() => setRequesterType('faculty')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                isFaculty ? 'bg-white shadow text-primary' : 'text-muted hover:text-gray-700'
              }`}
            >
              <BookOpen size={13} /> Faculty
            </button>
          </div>

          {/* Requester Info — single row */}
          <div className="grid grid-cols-2 gap-3">
            {!isFaculty ? (
              <NeumorphInput
                id="retro-student-id"
                label="Student ID *"
                placeholder="2021-00710"
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
              />
            ) : (
              <NeumorphInput
                id="retro-student-id"
                label="Faculty ID (optional)"
                placeholder="FAC-001"
                value={facultyId}
                onChange={e => setFacultyId(e.target.value)}
              />
            )}
            <NeumorphInput
              label="Full Name *"
              placeholder={isFaculty ? 'Prof. Maria Santos' : 'Juan Dela Cruz'}
              value={fullName}
              onChange={e => setFullName(e.target.value)}
            />
          </div>

          {/* Timestamps — 2x2 compact grid */}
          <div className="p-3 bg-primary/5 rounded-xl border border-primary/10">
            <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2">Historical Timeline</p>
            <div className="grid grid-cols-2 gap-2">
              <NeumorphInput label="Requested At *" type="datetime-local" value={requestedAt} onChange={handleRequestedTimeChange} className="w-full bg-white" />
              <NeumorphInput label="Approved At *"  type="datetime-local" value={approvedAt}  onChange={e => setApprovedAt(e.target.value)}  className="w-full bg-white" />
              <NeumorphInput label="Issued At *"    type="datetime-local" value={issuedAt}    onChange={e => setIssuedAt(e.target.value)}    className="w-full bg-white" />
              <NeumorphInput label="Returned At"    type="datetime-local" value={returnedAt}  onChange={e => setReturnedAt(e.target.value)}  className="w-full bg-white" />
            </div>
            <p className="text-[9px] text-muted mt-1.5 italic">Leave "Returned At" blank if item is still borrowed.</p>
          </div>

          {/* Purpose */}
          <NeumorphInput label="Purpose" value={purpose} onChange={e => setPurpose(e.target.value)} />

          {/* Barcode Scanner */}
          <div className="p-3 bg-black/5 rounded-xl border border-black/5 space-y-2">
            <div className="relative">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Scan barcode and press Enter..."
                className="neu-input w-full pl-8 text-sm bg-white"
                value={currentBarcode}
                onChange={e => setCurrentBarcode(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
              />
              <button
                onClick={() => handleBarcodeKeyDown({ key: 'Enter', preventDefault: () => {} })}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-primary/10 text-primary text-xs font-bold rounded-lg hover:bg-primary hover:text-white transition-colors"
              >
                Add
              </button>
            </div>

            <div className="space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar">
              {barcodes.length === 0 ? (
                <p className="text-center text-xs text-muted italic py-2">No barcodes scanned yet.</p>
              ) : (
                barcodes.map((code, idx) => (
                  <div key={idx} className="flex justify-between items-center px-3 py-2 bg-white rounded-lg shadow-sm border border-black/5">
                    <span className="font-mono text-sm text-gray-800">{code}</span>
                    <button onClick={() => removeBarcode(idx)} className="text-red-500 hover:bg-red-50 p-1 rounded-lg transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-black/5">
            <NeumorphButton variant="outline" onClick={onClose} disabled={loading}>Cancel</NeumorphButton>
            <NeumorphButton variant="primary" onClick={handleSubmit} loading={loading}>
              <History size={14} className="mr-1.5" /> Inject Past Record
            </NeumorphButton>
          </div>

        </div>
      </div>
    </NeumorphModal>
  );
}
