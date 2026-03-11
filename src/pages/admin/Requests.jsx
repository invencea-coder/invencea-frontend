// src/pages/admin/Requests.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  RefreshCw, Package, Scan, Camera, ChevronDown, ChevronUp, 
  Search, Clock, CheckCircle2, AlertCircle, Users, Box, Plus, Minus, Trash2, User, Copy, Check, X
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { listRequests, getRequestByQR, issueRequest, approveRequest, rejectRequest } from '../../api/requestAPI.js';
import { listInventory } from '../../api/inventoryAPI.js';
import { useAuth } from '../../context/AuthContext.jsx'; // Import useAuth to get user room
import NeumorphCard from '../../components/ui/NeumorphCard.jsx';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';
import NeumorphModal from '../../components/ui/NeumorphModal.jsx';
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';
import { fmtDateTime } from '../../utils/date.js';

const AssignChip = ({ active, onClick, label, icon }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
      active ? 'bg-primary text-white border-primary shadow-md scale-[1.02]' : 'bg-black/5 text-muted border-transparent hover:bg-black/10'
    }`}
  >
    {icon} <span className="truncate max-w-[150px]">{label}</span>
  </button>
);

export default function AdminRequests() {
  const { user } = useAuth(); // Get user context for room filtering
  const [requests, setRequests] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('PENDING'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);

  const [issueModal, setIssueModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [adjustedItems, setAdjustedItems] = useState([]);
  const [itemSearch, setItemSearch] = useState(''); 
  const [issuing, setIssuing] = useState(false);

  const [cameraModal, setCameraModal] = useState(false);
  const scannerInputRef = useRef(null);
  const scannerBufferRef = useRef('');

  const isExpiredSameDay = (requestDate) => {
    if (!requestDate) return false;
    const endOfDay = new Date(requestDate);
    endOfDay.setHours(23, 59, 59, 999);
    return new Date() > endOfDay;
  };

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // FIXED: Safely pass room_id to filter inventory
      const invParams = user?.room_id ? { room_id: user.room_id } : {};
      const [reqRes, invRes] = await Promise.all([
        listRequests({}), 
        listInventory(invParams) 
      ]);
      
      const enrichedData = reqRes.data.data.map(r => ({
        ...r, isExpired: isExpiredSameDay(r.created_at) && ['PENDING', 'APPROVED', 'PENDING APPROVAL'].includes(r.status)
      }));
      setRequests(enrichedData);
      
      const borrowables = (invRes.data?.data?.items || []).filter(i => i.status === 'available').map(i => ({...i, kind: 'borrowable'}));
      const consumables = (invRes.data?.data?.consumables || []).map(i => ({...i, kind: 'consumable'}));
      setInventory([...borrowables, ...consumables]);
    } catch {
      if (!silent) toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.room_id]); // Re-run if user context changes

  // Socket Auto-Refresh 
  useEffect(() => {
    const socketURL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';
    const socket = io(socketURL);
    
    socket.on('inventory-updated', () => load(true));
    socket.on('request-issued', () => load(true));
    
    return () => socket.disconnect();
  }, []);

  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = !query || String(r.id).includes(query) || String(r.requester_id).toLowerCase().includes(query) || String(r.room_code || '').toLowerCase().includes(query);
      if (!matchesSearch) return false;

      if (activeTab === 'ARCHIVED') return r.status === 'REJECTED' || r.status === 'RETURNED' || r.status === 'CANCELLED' || r.isExpired;
      if (activeTab === 'PENDING') return (r.status === 'PENDING' || r.status === 'PENDING APPROVAL') && !r.isExpired;
      if (activeTab === 'APPROVED') return r.status === 'APPROVED' && !r.isExpired;
      if (activeTab === 'ISSUED') return ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status);
      return true;
    });
  }, [requests, activeTab, searchQuery]);

  const counts = {
    PENDING: requests.filter(r => (r.status === 'PENDING' || r.status === 'PENDING APPROVAL') && !r.isExpired).length,
    APPROVED: requests.filter(r => r.status === 'APPROVED' && !r.isExpired).length,
    ISSUED: requests.filter(r => ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status)).length,
    ARCHIVED: requests.filter(r => r.status === 'REJECTED' || r.status === 'RETURNED' || r.status === 'CANCELLED' || r.isExpired).length,
  };

  const handleApprove = async (id) => {
    try {
      toast.loading('Approving...', { id: 'action' });
      await approveRequest(id);
      toast.success('Request Approved!', { id: 'action' });
      load(true);
    } catch (e) { toast.error('Approval failed', { id: 'action' }); }
  };

  const handleReject = async (id) => {
    try {
      toast.loading('Rejecting...', { id: 'action' });
      await rejectRequest(id);
      toast.success('Request Denied.', { id: 'action' });
      load(true);
    } catch (e) { toast.error('Rejection failed', { id: 'action' }); }
  };

  const handleQRResult = async (code) => {
    setCameraModal(false);
    setSearchQuery('');
    try {
      toast.loading('Processing QR...', { id: 'qrScan' });
      const { data } = await getRequestByQR(code);
      const req = data.data;

      setRequests(prev => {
        const exists = prev.find(r => r.id === req.id);
        return exists ? prev.map(r => r.id === req.id ? { ...req, isExpired: isExpiredSameDay(req.created_at) } : r) 
                      : [{ ...req, isExpired: isExpiredSameDay(req.created_at) }, ...prev];
      });

      if (isExpiredSameDay(req.created_at)) {
        toast.error('This request expired at 12:00 AM', { id: 'qrScan' });
        setActiveTab('ARCHIVED');
      } else {
        toast.success(`Request #${req.id} Scanned`, { id: 'qrScan' });
        setActiveTab(req.status === 'PENDING APPROVAL' ? 'PENDING' : req.status);
        if (req.status === 'APPROVED' || req.status === 'PENDING') openIssueModal(req);
      }
      setSearchQuery(String(req.id));
      setExpandedRow(req.id);
    } catch {
      toast.error('Invalid QR Code or Request Not Found', { id: 'qrScan' });
    }
  };

  const openIssueModal = (req) => {
    setSelectedRequest(req);
    // FIXED: Default rigidly to 'Requester'. 'Shared Group' is completely dead.
    setAdjustedItems(req.items.map((i, idx) => {
      let assignee = i.assigned_to || i.assignTo || 'Requester';
      if (assignee === 'Shared Group' || assignee === 'Shared') assignee = 'Requester';
      
      return { 
        ...i, 
        id: i.id || `temp-${idx}`,
        actualQuantity: i.quantity, 
        assignTo: assignee 
      };
    }));
    setIssueModal(true);
  };

  useEffect(() => {
    let scanner = null;
    if (cameraModal) {
      setTimeout(() => {
        try {
          scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
          scanner.render((result) => { scanner.pause(true); handleQRResult(result); }, () => {});
        } catch (error) { toast.error("Could not access camera."); }
      }, 150);
    }
    return () => { if (scanner) scanner.clear().catch(()=>{}); };
  }, [cameraModal]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (document.activeElement !== scannerInputRef.current && ['input', 'textarea', 'select'].includes(tag)) return;
      if (e.key === 'Enter') {
        const code = scannerBufferRef.current.trim();
        scannerBufferRef.current = '';
        if (code.length > 0) handleQRResult(code);
        return;
      }
      if (e.key.length === 1) scannerBufferRef.current += e.key;
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const addNewItemToCart = (invItem) => {
    const existing = adjustedItems.find(i => 
      (invItem.kind === 'borrowable' && i.inventory_type_id === invItem.inventory_type_id) ||
      (invItem.kind === 'consumable' && i.consumable_id === invItem.id)
    );
    if (existing) {
      setAdjustedItems(prev => prev.map(p => p.id === existing.id ? {...p, actualQuantity: p.actualQuantity + 1} : p));
    } else {
      setAdjustedItems(prev => [...prev, {
        id: `new-${Date.now()}`, item_name: invItem.name, inventory_type_id: invItem.inventory_type_id,
        consumable_id: invItem.kind === 'consumable' ? invItem.id : null, quantity: 1, actualQuantity: 1, isNew: true, assignTo: 'Requester'
      }]);
    }
    setItemSearch('');
  };

  const updateQty = (id, newQty) => setAdjustedItems(prev => prev.map(p => p.id === id ? { ...p, actualQuantity: Math.max(1, newQty) } : p));
  const removeAdjustedItem = (id) => setAdjustedItems(prev => prev.filter(p => p.id !== id));
  const setAssignTo = (id, target) => setAdjustedItems(prev => prev.map(p => p.id === id ? { ...p, assignTo: target } : p));

  const handleSplitItem = (index) => {
    setAdjustedItems(prev => {
      const newArr = [...prev];
      if (newArr[index].actualQuantity > 1) {
        newArr[index].actualQuantity -= 1;
        newArr.splice(index + 1, 0, { 
          ...newArr[index], 
          id: `split-${Date.now()}-${Math.floor(Math.random() * 1000)}`, 
          actualQuantity: 1, 
          assignTo: 'Requester' 
        });
      }
      return newArr;
    });
  };

  const handleIssue = async () => {
    if (!selectedRequest) return;
    setIssuing(true);
    try {
      const payloadItems = adjustedItems.map(item => ({
        id: item.isNew || String(item.id).startsWith('split-') ? null : item.id, 
        inventory_type_id: item.inventory_type_id,
        consumable_id: item.consumable_id,
        quantity: item.actualQuantity,
        assigned_to: item.assignTo 
      }));
      await issueRequest(selectedRequest.id, payloadItems);
      toast.success('Request issued successfully!');
      setIssueModal(false);
      setExpandedRow(null);
      setSearchQuery('');
      load(true);
    } catch (e) { toast.error(e?.response?.data?.message || 'Issuance failed'); } 
    finally { setIssuing(false); }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <input ref={scannerInputRef} type="text" className="absolute opacity-0 w-0 h-0" onBlur={() => setTimeout(() => scannerInputRef.current?.focus(), 50)} />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Requests Triage</h1>
          <p className="text-xs text-muted">Manage, approve, assign, and issue requests</p>
        </div>
        <div className="flex gap-2">
          <NeumorphButton size="sm" variant="primary" onClick={() => setCameraModal(true)}>
            <Camera size={14} className="mr-2" /> Scan Kiosk QR
          </NeumorphButton>
          <button onClick={() => load(false)} className="neu-btn px-3"><RefreshCw size={14} /></button>
        </div>
      </div>

      <NeumorphCard className="p-4 space-y-4">
        <NeumorphInput icon={<Search size={16} />} placeholder="Search by ID, Name, Room..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full" />
        <div className="flex overflow-x-auto gap-2 pb-1 hide-scrollbar">
          {['PENDING', 'APPROVED', 'ISSUED', 'ARCHIVED'].map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setExpandedRow(null); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab ? 'bg-primary text-white shadow-md' : 'neu-btn text-muted hover:text-primary'}`}>
              {tab === 'PENDING' && <Clock size={14} />} {tab === 'APPROVED' && <CheckCircle2 size={14} />} {tab === 'ISSUED' && <Package size={14} />} {tab === 'ARCHIVED' && <AlertCircle size={14} />}
              {tab} <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${activeTab === tab ? 'bg-white/20' : 'bg-black/5'}`}>{counts[tab]}</span>
            </button>
          ))}
        </div>
      </NeumorphCard>

      <div className="space-y-3">
        {loading ? <div className="flex justify-center py-10"><div className="neu-spinner" /></div> : filteredRequests.length === 0 ? (
          <NeumorphCard className="p-10 text-center text-muted"><p className="font-medium">No requests found.</p></NeumorphCard>
        ) : (
          filteredRequests.map(r => (
            <NeumorphCard key={r.id} className={`p-0 overflow-hidden transition-all ${r.isExpired ? 'opacity-70 grayscale' : ''}`}>
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-black/[0.02]" onClick={() => setExpandedRow(prev => prev === r.id ? null : r.id)}>
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-black/5 flex items-center justify-center font-mono font-bold text-primary">#{r.id}</div>
                  <div>
                    <p className="font-bold text-gray-800">{r.requester_type.toUpperCase()} ID: {r.requester_id}</p>
                    <div className="flex items-center gap-3 text-xs text-muted mt-1">
                      <span>Room: {r.room_code || 'Global'}</span><span>•</span><span>{r.items?.length || 0} Items</span>
                      {r.isExpired && <span className="text-red-500 font-bold">• Expired</span>}
                      {r.status === 'PARTIALLY RETURNED' && <span className="text-orange-500 font-bold">• Partial Return</span>}
                      {r.status === 'PENDING APPROVAL' && <span className="text-amber-500 font-bold">• Awaiting Approval</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired && (
                    <div className="hidden sm:flex items-center gap-2 mr-4">
                      <button onClick={(e) => { e.stopPropagation(); handleApprove(r.id); }} className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg text-xs font-bold transition-colors">
                        <Check size={14} /> Approve
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleReject(r.id); }} className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-xs font-bold transition-colors">
                        <X size={14} /> Deny
                      </button>
                    </div>
                  )}
                  {r.status === 'APPROVED' && !r.isExpired && (
                    <NeumorphButton size="sm" variant="primary" className="hidden sm:flex" onClick={(e) => { e.stopPropagation(); openIssueModal(r); }}>
                      Verify & Issue
                    </NeumorphButton>
                  )}
                  <button className="text-muted p-2">{expandedRow === r.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>
                </div>
              </div>
              {expandedRow === r.id && (
                <div className="p-4 bg-black/[0.01] grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-black/5">
                  <div className="space-y-4">
                    <div className="neu-inset p-3 rounded-lg text-sm">
                      <p className="text-xs text-muted uppercase tracking-wider mb-1">Details</p>
                      <p><strong>Purpose:</strong> {r.purpose || '—'}</p>
                      <p><strong>Return Deadline:</strong> {r.return_deadline ? fmtDateTime(r.return_deadline) : 'Walk-in / End of Day'}</p>
                      
                      {['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired && (
                        <div className="flex sm:hidden items-center gap-2 mt-4 pt-4 border-t border-black/10">
                          <button onClick={() => handleApprove(r.id)} className="flex-1 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-bold">Approve</button>
                          <button onClick={() => handleReject(r.id)} className="flex-1 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-bold">Deny</button>
                        </div>
                      )}
                    </div>
                    {r.members && r.members.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-muted uppercase mb-2"><Users size={14} className="inline mr-1"/> Companions</p>
                        <div className="space-y-2">
                          {r.members.map((m, idx) => (
                            <div key={idx} className="flex justify-between text-sm bg-white p-2 rounded-lg border border-black/5">
                              <span className="font-medium">{m.full_name}</span><span className="text-muted font-mono text-xs">{m.student_id !== 'N/A' ? m.student_id : 'Faculty'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted uppercase mb-2"><Box size={14} className="inline mr-1"/> Requested Items</p>
                    <div className="space-y-2">
                      {r.items?.map((item, idx) => {
                         const displayAssignee = item.assigned_to === 'Shared Group' ? 'Requester' : item.assigned_to;
                         return (
                          <div key={idx} className="flex justify-between text-sm bg-white p-3 rounded-lg border border-black/5">
                            <div>
                              <p className="font-medium">{item.item_name}</p>
                              {displayAssignee && displayAssignee !== 'Requester' && (
                                <p className="text-[10px] text-muted">Assigned: {displayAssignee}</p>
                              )}
                              {item.status && <span className={`text-[10px] font-bold uppercase ${item.status === 'RETURNED' ? 'text-emerald-500' : 'text-amber-500'}`}>{item.status}</span>}
                            </div>
                            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full font-bold">×{item.quantity}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </NeumorphCard>
          ))
        )}
      </div>

      <NeumorphModal open={cameraModal} onClose={() => setCameraModal(false)} title="Scan Kiosk QR">
        <div id="reader" className="w-full overflow-hidden rounded-xl border-2 border-primary/20 bg-black/5"></div>
      </NeumorphModal>

      <NeumorphModal open={issueModal} onClose={() => setIssueModal(false)} title={`Verify Request #${selectedRequest?.id}`} size="lg">
        <div className="space-y-6">
          <div className="bg-blue-50 text-blue-800 p-3 rounded-xl text-sm border border-blue-200">
            <strong>Check Physical IDs.</strong> Adjust quantities below if they want to change their request before you issue it.
          </div>

          <div className="bg-black/[0.02] p-4 rounded-xl border border-black/5">
            <label className="text-xs font-bold text-muted uppercase mb-2 block">Search & Add Items</label>
            <div className="relative">
              <NeumorphInput placeholder="Type to search inventory..." value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} icon={<Search size={16}/>} className="w-full" />
              {itemSearch && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-black/10 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {inventory.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase())).slice(0, 10).map(invItem => (
                    <button key={invItem.id} onClick={() => addNewItemToCart(invItem)} className="w-full text-left px-4 py-3 hover:bg-primary/5 border-b border-black/5 flex justify-between items-center">
                      <span className="text-sm font-medium">{invItem.name} <span className="text-xs text-muted">({invItem.kind})</span></span>
                      <Plus size={16} className="text-primary"/>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-muted uppercase mb-2 block">Review Cart & Assignments</label>
            <div className="space-y-4">
              {adjustedItems.map((item, index) => (
                <div key={item.id} className="p-4 bg-white rounded-2xl border border-black/10 shadow-sm flex flex-col gap-3">
                  <div className="flex justify-between gap-3">
                    <div>
                      <span className="text-sm font-bold block">{item.item_name} {item.isNew && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded uppercase ml-1">New</span>}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-black/5 p-1 rounded-lg w-fit">
                      <button onClick={() => updateQty(item.id, item.actualQuantity - 1)} className="w-7 h-7 flex justify-center items-center bg-white rounded text-muted hover:text-primary"><Minus size={14}/></button>
                      <span className="w-8 text-center text-sm font-bold">{item.actualQuantity}</span>
                      <button onClick={() => updateQty(item.id, item.actualQuantity + 1)} className="w-7 h-7 flex justify-center items-center bg-white rounded text-muted hover:text-primary"><Plus size={14}/></button>
                      <div className="w-[1px] h-4 bg-black/10 mx-1"></div>
                      <button onClick={() => removeAdjustedItem(item.id)} className="w-7 h-7 flex justify-center items-center text-red-500 hover:bg-red-50 rounded"><Trash2 size={14}/></button>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-black/5">
                    <div className="flex justify-between mb-2">
                      <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Assign To:</span>
                      {item.actualQuantity > 1 && selectedRequest?.members?.length > 0 && (
                         <button onClick={() => handleSplitItem(index)} className="text-[10px] flex items-center gap-1 text-primary bg-primary/10 px-2 py-0.5 rounded font-bold uppercase"><Copy size={10}/> Split Item</button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {/* FIXED: Shared Group is gone. Default is Requester. */}
                      <AssignChip active={item.assignTo === 'Requester'} onClick={() => setAssignTo(item.id, 'Requester')} label="Requester" icon={<User size={12}/>} />
                      {selectedRequest?.members?.map((m, mIdx) => (
                         <AssignChip key={mIdx} active={item.assignTo === m.full_name} onClick={() => setAssignTo(item.id, m.full_name)} label={m.full_name} icon={<User size={12}/>} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-black/5">
            <NeumorphButton variant="outline" className="flex-1" onClick={() => setIssueModal(false)}>Cancel</NeumorphButton>
            <NeumorphButton variant="primary" className="flex-1 py-3" onClick={handleIssue} loading={issuing} disabled={adjustedItems.length === 0}>
              <Package size={16} className="mr-2" /> Issue & Lock Request
            </NeumorphButton>
          </div>
        </div>
      </NeumorphModal>
    </div>
  );
}