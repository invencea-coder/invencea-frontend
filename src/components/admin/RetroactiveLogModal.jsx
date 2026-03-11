// src/components/admin/RetroactiveLogModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { History, Trash2, ZapOff, Hash } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosClient';
import { useAuth } from '../../context/AuthContext';
import NeumorphModal from '../ui/NeumorphModal';
import NeumorphInput from '../ui/NeumorphInput';
import NeumorphButton from '../ui/NeumorphButton';

export default function RetroactiveLogModal({ isOpen, onClose, onSuccess }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [studentId, setStudentId] = useState('');
  const [fullName, setFullName] = useState('');
  const [purpose, setPurpose] = useState('Blackout Manual Log');
  
  // The 4 Timestamps
  const [requestedAt, setRequestedAt] = useState('');
  const [approvedAt, setApprovedAt] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [returnedAt, setReturnedAt] = useState('');
  
  // Barcode State
  const [barcodes, setBarcodes] = useState([]);
  const [currentBarcode, setCurrentBarcode] = useState('');
  const barcodeInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => document.getElementById('retro-student-id')?.focus(), 100);
    } else {
      setStudentId('');
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

  // UX Trick: Auto-fill Approved and Issued when Requested is chosen
  const handleRequestedTimeChange = (e) => {
    const time = e.target.value;
    setRequestedAt(time);
    if (!approvedAt) setApprovedAt(time);
    if (!issuedAt) setIssuedAt(time);
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
    if (!studentId || !fullName) return toast.error('Student ID and Name are required');
    if (!user?.room_id || user.room_id === 'null') return toast.error('You are not assigned to a room.');
    if (!requestedAt || !approvedAt || !issuedAt) return toast.error('Requested, Approved, and Issued times are required.');
    if (barcodes.length === 0) return toast.error('Please scan at least one item');

    setLoading(true);
    try {
      const payload = {
        student_id_number: studentId,
        full_name: fullName,
        room_id: user.room_id,
        purpose,
        barcodes,
        requested_time: new Date(requestedAt).toISOString(),
        approved_time: new Date(approvedAt).toISOString(),
        issued_time: new Date(issuedAt).toISOString(),
        returned_time: returnedAt ? new Date(returnedAt).toISOString() : null
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

  return (
    <NeumorphModal open={isOpen} onClose={onClose} title="Blackout Recovery Log">
      <div className="space-y-6 p-2">
        
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3 text-amber-800">
          <ZapOff size={24} className="flex-shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">
            <strong>Power Outage Recovery:</strong> Encode paper records. If the student already returned the item, fill out "Returned At" to immediately close the request without affecting current stock.
          </p>
        </div>

        {/* User Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NeumorphInput id="retro-student-id" label="Student ID Number" placeholder="e.g. 2021-00710" value={studentId} onChange={e => setStudentId(e.target.value)} />
          <NeumorphInput label="Student Full Name" placeholder="e.g. Juan Dela Cruz" value={fullName} onChange={e => setFullName(e.target.value)} />
        </div>

        {/* Timestamps Grid */}
        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
          <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-3">Historical Timeline</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NeumorphInput label="Requested At *" type="datetime-local" value={requestedAt} onChange={handleRequestedTimeChange} className="w-full bg-white" />
            <NeumorphInput label="Approved At *" type="datetime-local" value={approvedAt} onChange={e => setApprovedAt(e.target.value)} className="w-full bg-white" />
            <NeumorphInput label="Issued At *" type="datetime-local" value={issuedAt} onChange={e => setIssuedAt(e.target.value)} className="w-full bg-white" />
            <NeumorphInput label="Returned At (Leave blank if still borrowed)" type="datetime-local" value={returnedAt} onChange={e => setReturnedAt(e.target.value)} className="w-full bg-white" />
          </div>
        </div>

        <NeumorphInput label="Purpose" value={purpose} onChange={e => setPurpose(e.target.value)} />

        {/* Barcode Scanner Section */}
        <div className="p-4 bg-black/5 rounded-2xl border border-black/5 space-y-4">
          <div className="relative">
            <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input 
              ref={barcodeInputRef}
              type="text" 
              placeholder="Scan Barcode here and press Enter..." 
              className="neu-input w-full pl-9 text-sm bg-white"
              value={currentBarcode}
              onChange={e => setCurrentBarcode(e.target.value)}
              onKeyDown={handleBarcodeKeyDown}
            />
            <button 
              onClick={() => handleBarcodeKeyDown({ key: 'Enter', preventDefault: () => {} })}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-lg hover:bg-primary hover:text-white transition-colors"
            >
              Add
            </button>
          </div>

          <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
            {barcodes.length === 0 ? (
              <p className="text-center text-xs text-muted italic py-4">No barcodes scanned yet.</p>
            ) : (
              barcodes.map((code, idx) => (
                <div key={idx} className="flex justify-between items-center p-2.5 bg-white rounded-xl shadow-sm border border-black/5">
                  <span className="font-mono text-sm text-gray-800">{code}</span>
                  <button onClick={() => removeBarcode(idx)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors">
                    <Trash2 size={14}/>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-black/5">
          <NeumorphButton variant="outline" onClick={onClose} disabled={loading}>Cancel</NeumorphButton>
          <NeumorphButton variant="primary" onClick={handleSubmit} loading={loading}>
            <History size={16} className="mr-2" /> Inject Past Record
          </NeumorphButton>
        </div>

      </div>
    </NeumorphModal>
  );
}