// src/components/admin/RetroactiveLogModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { History, Trash2, ZapOff, Hash, GraduationCap, BookOpen, Search, UserCheck, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosClient';
import { useAuth } from '../../context/AuthContext';
import NeumorphModal from '../ui/NeumorphModal';
import NeumorphInput from '../ui/NeumorphInput';
import NeumorphButton from '../ui/NeumorphButton';

export default function RetroactiveLogModal({ isOpen, onClose, onSuccess }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // --- Core Form State ---
  const [requesterType, setRequesterType] = useState('student');
  const [purpose, setPurpose] = useState('Blackout Manual Log');
  const [facultyId, setFacultyId] = useState('');
  const [facultyName, setFacultyName] = useState('');
  
  // --- Timestamps ---
  const [requestedAt, setRequestedAt] = useState('');
  const [approvedAt, setApprovedAt]   = useState('');
  const [issuedAt, setIssuedAt]       = useState('');
  const [returnDeadline, setReturnDeadline] = useState(''); // 🔥 NEW EXPECTED RETURN DEADLINE
  const [returnedAt, setReturnedAt]   = useState('');
  
  // --- Barcodes ---
  const [barcodes, setBarcodes]             = useState([]);
  const [currentBarcode, setCurrentBarcode] = useState('');
  const barcodeInputRef = useRef(null);

  // --- Autocomplete State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Reset modal on open/close
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => document.getElementById('student-search-input')?.focus(), 100);
    } else {
      setRequesterType('student');
      setFacultyId('');
      setFacultyName('');
      setPurpose('Blackout Manual Log');
      setRequestedAt('');
      setApprovedAt('');
      setIssuedAt('');
      setReturnDeadline(''); // 🔥 Reset new field
      setReturnedAt('');
      setBarcodes([]);
      setCurrentBarcode('');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedStudent(null);
    }
  }, [isOpen]);

  // Handle Debounced Student Search
  useEffect(() => {
    if (requesterType !== 'student' || selectedStudent) return;
    
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true);
        try {
          const res = await api.get(`/admin/students/search?q=${encodeURIComponent(searchQuery)}`);
          setSearchResults(res.data?.data || []);
        } catch (error) {
          console.error('Failed to search students:', error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, requesterType, selectedStudent]);

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
    if (requesterType === 'student' && !selectedStudent) return toast.error('Please search and select a student.');
    if (requesterType === 'faculty' && !facultyName) return toast.error('Faculty Name is required.');
    if (!user?.room_id || user.room_id === 'null') return toast.error('You are not assigned to a room.');
    if (!requestedAt || !approvedAt || !issuedAt) return toast.error('Requested, Approved, and Issued times are required.');
    if (barcodes.length === 0) return toast.error('Please scan at least one item');

    setLoading(true);
    try {
      const payload = {
        student_id_number: requesterType === 'student' ? selectedStudent.student_id : (facultyId || 'N/A'),
        full_name:      requesterType === 'student' ? selectedStudent.full_name : facultyName,
        room_id:        user.room_id,
        purpose,
        barcodes,
        requester_type: requesterType,
        requested_time: new Date(requestedAt).toISOString(),
        approved_time:  new Date(approvedAt).toISOString(),
        issued_time:    new Date(issuedAt).toISOString(),
        return_deadline: returnDeadline ? new Date(returnDeadline).toISOString() : null, // 🔥 Included in payload
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
      <div>
        <div className="space-y-4 p-1">

          {/* Warning banner */}
          <div className="bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg flex gap-2 text-amber-800">
            <ZapOff size={16} className="flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong>Power Outage Recovery:</strong> Encode paper records. Leave "Returned At" blank if the item is still out with the borrower.
            </p>
          </div>

          {/* Requester Type Toggle */}
          <div className="flex gap-1.5 p-1 bg-black/5 rounded-xl">
            <button onClick={() => setRequesterType('student')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${!isFaculty ? 'bg-white shadow text-primary' : 'text-muted hover:text-gray-700'}`}>
              <GraduationCap size={13} /> Student
            </button>
            <button onClick={() => setRequesterType('faculty')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${isFaculty ? 'bg-white shadow text-primary' : 'text-muted hover:text-gray-700'}`}>
              <BookOpen size={13} /> Faculty
            </button>
          </div>

          {/* ─── DYNAMIC REQUESTER INPUT ─── */}
          {!isFaculty ? (
            <div className="relative">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Student Search *</label>
              
              {selectedStudent ? (
                <div className="flex items-center justify-between bg-green-50 border-2 border-green-200 p-3 rounded-xl shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-200 text-green-700 p-2 rounded-full"><UserCheck size={18} /></div>
                    <div>
                      <p className="text-sm font-bold text-green-900 leading-tight">{selectedStudent.full_name}</p>
                      <p className="text-xs font-mono text-green-700">{selectedStudent.student_id}</p>
                    </div>
                  </div>
                  <button onClick={() => { setSelectedStudent(null); setSearchQuery(''); }} className="p-2 text-green-600 hover:bg-green-200 rounded-lg transition-colors">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      id="student-search-input"
                      type="text"
                      className="neu-input w-full pl-9 pr-10 py-2.5 text-sm font-bold"
                      placeholder="Search by Name or Student ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoComplete="off"
                    />
                    {isSearching && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary" />}
                  </div>

                  {searchResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto custom-scrollbar">
                      {searchResults.map((student) => (
                        <div
                          key={student.id}
                          onClick={() => {
                            setSelectedStudent(student);
                            setSearchResults([]);
                          }}
                          className="px-4 py-2.5 hover:bg-primary/5 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                        >
                          <p className="text-sm font-bold text-gray-800">{student.full_name}</p>
                          <p className="text-xs font-mono text-gray-500">{student.student_id}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <NeumorphInput label="Faculty ID (optional)" placeholder="FAC-001" value={facultyId} onChange={e => setFacultyId(e.target.value)} />
              <NeumorphInput label="Full Name *" placeholder="Prof. Maria Santos" value={facultyName} onChange={e => setFacultyName(e.target.value)} />
            </div>
          )}

          {/* Timestamps */}
          <div className="p-3 bg-primary/5 rounded-xl border border-primary/10 mt-2">
            <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2">Historical Timeline</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <NeumorphInput label="Requested At *" type="datetime-local" value={requestedAt} onChange={handleRequestedTimeChange} className="w-full bg-white" />
              <NeumorphInput label="Approved At *"  type="datetime-local" value={approvedAt}  onChange={e => setApprovedAt(e.target.value)}  className="w-full bg-white" />
              <NeumorphInput label="Issued At *"    type="datetime-local" value={issuedAt}    onChange={e => setIssuedAt(e.target.value)}    className="w-full bg-white" />
              
              {/* 🔥 NEW EXPECTED RETURN FIELD */}
              <NeumorphInput label="Expected Return" type="datetime-local" value={returnDeadline} onChange={e => setReturnDeadline(e.target.value)} className="w-full bg-white" />
              
              <div className="sm:col-span-2 pt-2 border-t border-primary/10 mt-1">
                <NeumorphInput label="Actual Returned At" type="datetime-local" value={returnedAt}  onChange={e => setReturnedAt(e.target.value)}  className="w-full bg-white" />
              </div>
            </div>
            <p className="text-[9px] text-muted mt-1.5 italic">Leave "Actual Returned At" blank if item is still borrowed and out with the student.</p>
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
              <button onClick={() => handleBarcodeKeyDown({ key: 'Enter', preventDefault: () => {} })} className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-primary/10 text-primary text-xs font-bold rounded-lg hover:bg-primary hover:text-white transition-colors">
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