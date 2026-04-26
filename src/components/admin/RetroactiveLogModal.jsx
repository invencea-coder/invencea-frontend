// src/components/admin/RetroactiveLogModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { History, Trash2, ZapOff, GraduationCap, BookOpen, Search, UserCheck, Loader2, X, Plus, Package } from 'lucide-react';
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
  const [purpose, setPurpose] = useState('Blackout Manual Log');
  
  // --- Timestamps ---
  const [requestedAt, setRequestedAt] = useState('');
  const [approvedAt, setApprovedAt]   = useState('');
  const [issuedAt, setIssuedAt]       = useState('');
  const [returnDeadline, setReturnDeadline] = useState('');
  const [returnedAt, setReturnedAt]   = useState('');
  
  // --- Barcodes & Inventory ---
  const [barcodes, setBarcodes]             = useState([]);
  const [currentBarcode, setCurrentBarcode] = useState('');
  const [inventory, setInventory]           = useState([]);
  const barcodeInputRef = useRef(null);

  // --- Autocomplete State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedBorrower, setSelectedBorrower] = useState(null);

  // Reset modal and fetch inventory on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => document.getElementById('borrower-search-input')?.focus(), 100);
      
      // Fetch Room Inventory for the Dropdown
      if (user?.room_id && user.room_id !== 'null') {
        api.get('/admin/inventory', { params: { room_id: user.room_id } })
          .then(res => {
            // We only need physical items with barcodes for retroactive logging
            const items = res.data?.data?.items || [];
            setInventory(items.filter(i => i.barcode));
          })
          .catch(err => console.error("Failed to fetch inventory", err));
      }
    } else {
      setPurpose('Blackout Manual Log');
      setRequestedAt('');
      setApprovedAt('');
      setIssuedAt('');
      setReturnDeadline('');
      setReturnedAt('');
      setBarcodes([]);
      setCurrentBarcode('');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedBorrower(null);
    }
  }, [isOpen, user?.room_id]);

  // Handle Unified Debounced Borrower Search (Students & Faculty)
  useEffect(() => {
    if (selectedBorrower) return;
    
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true);
        try {
          // The same endpoint used in Walk-ins which searches both students and faculty
          const res = await api.get(`/admin/students/search?q=${encodeURIComponent(searchQuery)}`);
          setSearchResults(res.data?.data || res.data || []);
        } catch (error) {
          console.error('Failed to search borrowers:', error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, selectedBorrower]);

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
      addBarcodeToList(code);
    }
  };

  const addBarcodeToList = (code) => {
    if (barcodes.includes(code)) {
      toast.error('Barcode already added!');
    } else {
      setBarcodes([...barcodes, code]);
    }
    setCurrentBarcode('');
    barcodeInputRef.current?.focus();
  };

  const removeBarcode = (index) => setBarcodes(barcodes.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!selectedBorrower) return toast.error('Please search and select a borrower.');
    if (!user?.room_id || user.room_id === 'null') return toast.error('You are not assigned to a room.');
    if (!requestedAt || !approvedAt || !issuedAt) return toast.error('Requested, Approved, and Issued times are required.');
    if (barcodes.length === 0) return toast.error('Please scan or select at least one item.');

    setLoading(true);
    try {
      const isFaculty = selectedBorrower.role === 'faculty';
      const payload = {
        student_id_number: selectedBorrower.student_id || selectedBorrower.email || 'N/A',
        full_name:      selectedBorrower.full_name || selectedBorrower.name,
        room_id:        user.room_id,
        purpose,
        barcodes,
        requester_type: isFaculty ? 'faculty' : 'student',
        
        // 👇 1. FIX: Changed requested_time to created_at
        created_at:     new Date(requestedAt).toISOString(), 
        approved_time:  new Date(approvedAt).toISOString(),
        issued_time:    new Date(issuedAt).toISOString(),
        return_deadline: returnDeadline ? new Date(returnDeadline).toISOString() : null,
        returned_time:  returnedAt ? new Date(returnedAt).toISOString() : null,
      };

      // 👇 2. FIX: Removed "/admin" from the URL path
      await api.post('/requests/retroactive', payload);
      
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
      <div>
        <div className="space-y-4 p-1">

          {/* Warning banner */}
          <div className="bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg flex gap-2 text-amber-800 shadow-sm">
            <ZapOff size={16} className="flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong>Power Outage Recovery:</strong> Encode paper records. Leave "Actual Returned At" blank if the item is still out with the borrower.
            </p>
          </div>

          {/* ─── UNIFIED BORROWER SEARCH ─── */}
          <div className="relative z-20">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Borrower Search *</label>
            
            {selectedBorrower ? (
              <div className="flex items-center justify-between bg-blue-50 border-2 border-blue-200 p-3 rounded-xl shadow-inner">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-200 text-blue-700 p-2 rounded-full"><UserCheck size={18} /></div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-blue-900 leading-tight">{selectedBorrower.full_name || selectedBorrower.name}</p>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${selectedBorrower.role === 'faculty' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {selectedBorrower.role || 'student'}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-blue-700">{selectedBorrower.student_id || selectedBorrower.email || 'N/A'}</p>
                  </div>
                </div>
                <button onClick={() => { setSelectedBorrower(null); setSearchQuery(''); }} className="p-2 text-blue-600 hover:bg-blue-200 rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    id="borrower-search-input"
                    type="text"
                    className="neu-input w-full pl-9 pr-10 py-2.5 text-sm font-bold bg-white"
                    placeholder="Search Name, Student ID, or Faculty..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoComplete="off"
                  />
                  {isSearching && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary" />}
                </div>

                {searchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
                    {searchResults.map((u) => (
                      <div
                        key={`${u.id}-${u.role || 'student'}`}
                        onClick={() => {
                          setSelectedBorrower(u);
                          setSearchResults([]);
                        }}
                        className="px-4 py-2.5 hover:bg-primary/5 cursor-pointer border-b border-gray-100 last:border-0 transition-colors flex justify-between items-center"
                      >
                        <div>
                          <p className="text-sm font-bold text-gray-800">{u.full_name || u.name}</p>
                          <p className="text-xs font-mono text-gray-500">{u.student_id || u.email}</p>
                        </div>
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${u.role === 'faculty' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {u.role || 'student'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Timestamps */}
          <div className="p-3 bg-primary/5 rounded-xl border border-primary/10 mt-2 z-0 relative">
            <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-1"><History size={12}/> Historical Timeline</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <NeumorphInput label="Requested At *" type="datetime-local" value={requestedAt} onChange={handleRequestedTimeChange} className="w-full bg-white" />
              <NeumorphInput label="Approved At *"  type="datetime-local" value={approvedAt}  onChange={e => setApprovedAt(e.target.value)}  className="w-full bg-white" />
              <NeumorphInput label="Issued At *"    type="datetime-local" value={issuedAt}    onChange={e => setIssuedAt(e.target.value)}    className="w-full bg-white" />
              <NeumorphInput label="Expected Return" type="datetime-local" value={returnDeadline} onChange={e => setReturnDeadline(e.target.value)} className="w-full bg-white" />
              
              <div className="sm:col-span-2 pt-2 border-t border-primary/10 mt-1">
                <NeumorphInput label="Actual Returned At" type="datetime-local" value={returnedAt}  onChange={e => setReturnedAt(e.target.value)}  className="w-full bg-white" />
              </div>
            </div>
          </div>

          <NeumorphInput label="Purpose" value={purpose} onChange={e => setPurpose(e.target.value)} />

          {/* Barcode Scanner / Inventory Search */}
          <div className="p-3 bg-black/5 rounded-xl border border-black/5 space-y-2 z-30 relative">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5"><Package size={12}/> Items to Log</label>
            
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Search inventory by name or scan barcode..."
                className="neu-input w-full pl-8 pr-14 text-sm bg-white"
                value={currentBarcode}
                onChange={e => setCurrentBarcode(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
              />
              <button 
                onClick={() => handleBarcodeKeyDown({ key: 'Enter', preventDefault: () => {} })} 
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded hover:bg-primary hover:text-white transition-colors"
              >
                ADD
              </button>

              {/* Inventory Autocomplete Dropdown */}
              {currentBarcode.trim() && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
                  {inventory.filter(i => 
                    (i.name || '').toLowerCase().includes(currentBarcode.toLowerCase()) || 
                    (i.barcode || '').toLowerCase().includes(currentBarcode.toLowerCase())
                  ).slice(0, 10).map(inv => (
                    <button 
                      key={inv.id} 
                      type="button"
                      onClick={() => addBarcodeToList(inv.barcode)} 
                      className="w-full text-left px-4 py-2.5 hover:bg-primary/5 border-b border-black/5 flex justify-between items-center text-sm transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-gray-800 truncate">{inv.name}</p>
                        <p className="text-[10px] font-mono text-gray-500 truncate">{inv.barcode}</p>
                      </div>
                      <Plus size={14} className="text-primary shrink-0" />
                    </button>
                  ))}
                  {inventory.filter(i => (i.name || '').toLowerCase().includes(currentBarcode.toLowerCase()) || (i.barcode || '').toLowerCase().includes(currentBarcode.toLowerCase())).length === 0 && (
                    <p className="px-4 py-3 text-xs text-gray-400">No items match "{currentBarcode}"</p>
                  )}
                </div>
              )}
            </div>

            {/* Selected Barcodes List */}
            <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar mt-2">
              {barcodes.length === 0 ? (
                <p className="text-center text-xs text-muted italic py-3 bg-white/50 rounded-lg border border-dashed border-gray-300">No items added yet.</p>
              ) : (
                barcodes.map((code, idx) => {
                  // Try to find the item name for better display
                  const matchedItem = inventory.find(i => i.barcode === code);
                  return (
                    <div key={idx} className="flex justify-between items-center px-3 py-2 bg-white rounded-lg shadow-sm border border-black/5">
                      <div className="min-w-0 pr-2">
                        {matchedItem && <p className="text-xs font-bold text-gray-800 truncate">{matchedItem.name}</p>}
                        <p className="font-mono text-[10px] text-gray-500">{code}</p>
                      </div>
                      <button onClick={() => removeBarcode(idx)} className="text-red-400 hover:bg-red-50 hover:text-red-600 p-1.5 rounded-lg transition-colors flex-shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })
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