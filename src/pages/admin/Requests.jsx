// src/pages/admin/Requests.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  RefreshCw, Package, Scan, Camera, ChevronDown, ChevronUp, 
  Search, Clock, CheckCircle2, AlertCircle, Users, Box, Plus, Minus, Trash2, User, Copy, Check, X, Barcode
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
// FIX 1: Added getRequest so we can reload after approve before opening issue modal
import { listRequests, getRequest, getRequestByQR, issueRequest, approveRequest, rejectRequest } from '../../api/requestAPI.js';
import { listInventory } from '../../api/inventoryAPI.js';
import { useAuth } from '../../context/AuthContext.jsx'; 
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

function QrCameraScanner({ onResult }) {
  const containerRef = useRef(null);
  const html5QrcodeRef = useRef(null);
  const isRunningRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(async () => {
      if (!isMountedRef.current || !containerRef.current) return;
      let cameras;
      try {
        cameras = await Html5Qrcode.getCameras();
      } catch {
        if (isMountedRef.current) toast.error('Could not access camera. Please allow camera permissions.');
        return;
      }
      if (!cameras || cameras.length === 0) {
        if (isMountedRef.current) toast.error('No cameras found on this device.');
        return;
      }
      if (!isMountedRef.current || !containerRef.current) return;
      const camera = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[0];
      const scanner = new Html5Qrcode('qr-reader-cam');
      html5QrcodeRef.current = scanner;
      try {
        await scanner.start(
          camera.id,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => { if (isMountedRef.current) onResult(decodedText); },
          () => {}
        );
        isRunningRef.current = true;
      } catch {
        if (isMountedRef.current) toast.error('Could not start camera. Please allow camera permissions.');
        html5QrcodeRef.current = null;
      }
    }, 300);

    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
      if (html5QrcodeRef.current && isRunningRef.current) {
        isRunningRef.current = false;
        html5QrcodeRef.current.stop()
          .then(() => html5QrcodeRef.current?.clear())
          .catch(() => {})
          .finally(() => { html5QrcodeRef.current = null; });
      } else if (html5QrcodeRef.current) {
        html5QrcodeRef.current.clear().catch(() => {});
        html5QrcodeRef.current = null;
      }
    };
  }, []);

  return (
    <div id="qr-reader-cam" ref={containerRef}
      className="w-full overflow-hidden rounded-xl border-2 border-primary/20 bg-black/5 min-h-[300px]" />
  );
}

export default function AdminRequests() {
  const { user } = useAuth(); 
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
  const issueModalOpenRef = useRef(false);

  // inventoryRef mirrors the inventory state so that handleItemScan — which is
  // called from a keydown listener registered only once — always reads fresh
  // inventory data instead of the empty array from the first render.
  const inventoryRef = useRef([]);

  useEffect(() => { issueModalOpenRef.current = issueModal; }, [issueModal]);

  const isExpiredSameDay = (requestDate) => {
    if (!requestDate) return false;
    const endOfDay = new Date(requestDate);
    endOfDay.setHours(23, 59, 59, 999);
    return new Date() > endOfDay;
  };

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const invParams = user?.room_id ? { room_id: user.room_id } : {};
      const [reqRes, invRes] = await Promise.all([listRequests({}), listInventory(invParams)]);
      const enrichedData = reqRes.data.data.map(r => ({
        ...r, isExpired: isExpiredSameDay(r.created_at) && ['PENDING', 'APPROVED', 'PENDING APPROVAL'].includes(r.status)
      }));
      setRequests(enrichedData);
      const borrowables = (invRes.data?.data?.items || [])
        .filter(i => ['available', 'reserved'].includes(i.status))
        .map(i => ({...i, kind: 'borrowable'}));
      const consumables = (invRes.data?.data?.consumables || []).map(i => ({...i, kind: 'consumable'}));
      const combined = [...borrowables, ...consumables];
      setInventory(combined);
      inventoryRef.current = combined;
    } catch {
      if (!silent) toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.room_id]); 

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
      const matchesSearch = !query
        || String(r.id).includes(query)
        || String(r.requester_id).toLowerCase().includes(query)
        || String(r.room_code || '').toLowerCase().includes(query);
      if (!matchesSearch) return false;
      if (activeTab === 'ARCHIVED') return r.status === 'REJECTED' || r.status === 'RETURNED' || r.status === 'CANCELLED' || r.isExpired;
      if (activeTab === 'PENDING')  return (r.status === 'PENDING' || r.status === 'PENDING APPROVAL') && !r.isExpired;
      if (activeTab === 'APPROVED') return r.status === 'APPROVED' && !r.isExpired;
      if (activeTab === 'ISSUED')   return ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status);
      return true;
    });
  }, [requests, activeTab, searchQuery]);

  const counts = {
    PENDING:  requests.filter(r => (r.status === 'PENDING' || r.status === 'PENDING APPROVAL') && !r.isExpired).length,
    APPROVED: requests.filter(r => r.status === 'APPROVED' && !r.isExpired).length,
    ISSUED:   requests.filter(r => ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status)).length,
    ARCHIVED: requests.filter(r => r.status === 'REJECTED' || r.status === 'RETURNED' || r.status === 'CANCELLED' || r.isExpired).length,
  };

  // Approve only (used by faculty Approve button — reserves items, does NOT issue)
  const handleApprove = async (id) => {
    try {
      toast.loading('Approving & reserving items…', { id: 'action' });
      await approveRequest(id);
      toast.success('Request Approved & Items Reserved!', { id: 'action' });
      load(true);
    } catch (e) { toast.error('Approval failed', { id: 'action' }); }
  };

  const handleReject = async (id) => {
    try {
      toast.loading('Rejecting…', { id: 'action' });
      await rejectRequest(id);
      toast.success('Request Denied.', { id: 'action' });
      load(true);
    } catch (e) { toast.error('Rejection failed', { id: 'action' }); }
  };

  const openIssueModal = (req) => {
    setSelectedRequest(req);
    setAdjustedItems(req.items.map((i, idx) => {
      let assignee = i.assigned_to || i.assignTo || 'Requester';
      if (assignee === 'Shared Group' || assignee === 'Shared') assignee = 'Requester';
      return { ...i, id: i.id || `temp-${idx}`, actualQuantity: i.quantity, assignTo: assignee, scannedPhysicalItems: [] };
    }));
    setIssueModal(true);
  };

  // ─── FIX 1 & 4: Correct QR scan flows ────────────────────────────────────────
  // STUDENT: approve first (no item reserve) → reload → open issue modal
  // FACULTY: approve first (reserves items)  → reload → open issue modal immediately
  // Both flows now end at the barcode-scan issue modal in one step.
  const handleQRResult = useCallback(async (code) => {
    setCameraModal(false);
    setSearchQuery('');
    try {
      toast.loading('Processing QR…', { id: 'qrScan' });
      const { data } = await getRequestByQR(code);
      const req = data.data ?? data;

      // Expired check
      if (isExpiredSameDay(req.created_at) && ['PENDING', 'APPROVED', 'PENDING APPROVAL'].includes(req.status)) {
        toast.error('This request has expired.', { id: 'qrScan' });
        setActiveTab('ARCHIVED');
        setSearchQuery(String(req.id));
        return;
      }

      const type = String(req.requester_type).toLowerCase();

      if (['PENDING', 'PENDING APPROVAL'].includes(req.status)) {
        // FIX 1 (student) + FIX 4 (faculty): both approve then immediately open issue modal
        const label = type === 'faculty' ? 'Reserving items…' : 'Verifying request…';
        toast.loading(label, { id: 'qrScan' });
        await approveRequest(req.id);

        // Reload so the modal has the post-approval item state (reserved IDs etc.)
        const { data: freshData } = await getRequest(req.id);
        const freshReq = freshData.data ?? freshData;

        const successMsg = type === 'faculty'
          ? 'Items reserved! Scan barcodes to hand over.'
          : 'Verified! Scan item barcodes to issue.';
        toast.success(successMsg, { id: 'qrScan' });
        setActiveTab('APPROVED');
        openIssueModal(freshReq);
        return;
      }

      if (req.status === 'APPROVED') {
        // Already approved (admin scanned QR a second time, or faculty walked in after approval)
        toast.success('Ready to issue. Scan item barcodes.', { id: 'qrScan' });
        setActiveTab('APPROVED');
        openIssueModal(req);
        return;
      }

      // Any other status (ISSUED, RETURNED, REJECTED, etc.) — just highlight the row
      toast.success(`Request #${req.id} — ${req.status}`, { id: 'qrScan' });
      setActiveTab(['ISSUED', 'PARTIALLY RETURNED'].includes(req.status) ? 'ISSUED' : req.status);
      setSearchQuery(String(req.id));
      setExpandedRow(req.id);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Invalid QR Code or Request Not Found', { id: 'qrScan' });
    }
  }, []);

  const handleItemScan = (barcode) => {
    // Read from inventoryRef.current (not the `inventory` state) — this function
    // is called inside the keydown listener which is registered once at mount.
    // Without the ref, it would forever see the empty inventory from first render.
    const norm = (b) => String(b ?? '').trim().replace(/^0+(\d)/, '$1');
    const invItem = inventoryRef.current.find(i => norm(i.barcode) === norm(barcode));
    if (!invItem) { toast.error(`Barcode ${barcode} not found in this room.`); return; }
    if (invItem.kind === 'consumable') { toast.success(`${invItem.name} verified.`); return; }

    setAdjustedItems(prev => {
      const newItems = [...prev];
      const alreadyScanned = newItems.some(item => item.scannedPhysicalItems?.some(spi => spi.id === invItem.id));
      if (alreadyScanned) { toast.error('Already scanned this unit!'); return prev; }

      const matchIndex = newItems.findIndex(item =>
        String(item.inventory_type_id) === String(invItem.inventory_type_id) &&
        (item.scannedPhysicalItems?.length || 0) < item.actualQuantity
      );

      if (matchIndex >= 0) {
        const matched = newItems[matchIndex];
        newItems[matchIndex] = { ...matched, scannedPhysicalItems: [...(matched.scannedPhysicalItems || []), invItem] };
        toast.success(`Matched: ${invItem.barcode}`);
      } else {
        newItems.push({
          id: `new-${Date.now()}`, item_name: invItem.name, inventory_type_id: invItem.inventory_type_id,
          consumable_id: null, quantity: 1, actualQuantity: 1, isNew: true, assignTo: 'Requester', scannedPhysicalItems: [invItem]
        });
        toast.success(`Added extra: ${invItem.name}`);
      }
      return newItems;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (document.activeElement !== scannerInputRef.current && ['input', 'textarea', 'select'].includes(tag)) return;
      if (e.key === 'Enter') {
        const code = scannerBufferRef.current.trim();
        scannerBufferRef.current = '';
        if (code.length > 0) {
          if (issueModalOpenRef.current) handleItemScan(code);
          else handleQRResult(code);
        }
        return;
      }
      if (e.key.length === 1) scannerBufferRef.current += e.key;
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleQRResult]);

  const addNewItemToCart = (invItem) => {
    const existing = adjustedItems.find(i =>
      (invItem.kind === 'borrowable' && String(i.inventory_type_id) === String(invItem.inventory_type_id)) ||
      (invItem.kind === 'consumable' && String(i.consumable_id) === String(invItem.id))
    );
    if (existing) {
      setAdjustedItems(prev => prev.map(p => p.id === existing.id ? {...p, actualQuantity: p.actualQuantity + 1} : p));
    } else {
      setAdjustedItems(prev => [...prev, {
        id: `new-${Date.now()}`, item_name: invItem.name, inventory_type_id: invItem.inventory_type_id,
        consumable_id: invItem.kind === 'consumable' ? invItem.id : null,
        quantity: 1, actualQuantity: 1, isNew: true, assignTo: 'Requester', scannedPhysicalItems: []
      }]);
    }
    setItemSearch('');
  };

  const updateQty          = (id, v) => setAdjustedItems(prev => prev.map(p => p.id === id ? { ...p, actualQuantity: Math.max(0, v) } : p));
  const removeAdjustedItem = (id)    => setAdjustedItems(prev => prev.filter(p => p.id !== id));
  const removeScannedItem  = (rowId, physId) =>
    setAdjustedItems(prev => prev.map(p =>
      p.id !== rowId ? p : { ...p, scannedPhysicalItems: p.scannedPhysicalItems.filter(s => s.id !== physId) }
    ));
  const setAssignTo = (id, target) => setAdjustedItems(prev => prev.map(p => p.id === id ? { ...p, assignTo: target } : p));

  const handleSplitItem = (index) => {
    setAdjustedItems(prev => {
      const arr = [...prev];
      if (arr[index].actualQuantity > 1) {
        arr[index].actualQuantity -= 1;
        arr.splice(index + 1, 0, {
          ...arr[index], id: `split-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          actualQuantity: 1, assignTo: 'Requester', scannedPhysicalItems: []
        });
      }
      return arr;
    });
  };

  const isReadyToIssue = adjustedItems.length > 0 && adjustedItems.every(item => {
    if (item.actualQuantity <= 0) return true;
    if (item.consumable_id) return true;
    return (item.scannedPhysicalItems?.length || 0) === item.actualQuantity;
  });

  const handleIssue = async () => {
    if (!selectedRequest) return;
    setIssuing(true);
    try {
      const payloadItems = [];
      adjustedItems.forEach(item => {
        if (item.actualQuantity <= 0) { payloadItems.push({ id: item.id, quantity: 0 }); return; }
        const scanned = item.scannedPhysicalItems || [];
        if (!item.consumable_id) {
          scanned.forEach(spi => payloadItems.push({
            id: item.isNew || String(item.id).startsWith('split-') ? null : item.id,
            inventory_type_id: item.inventory_type_id, consumable_id: null,
            quantity: 1, inventory_item_id: spi.id, assigned_to: item.assignTo
          }));
        } else {
          payloadItems.push({
            id: item.isNew || String(item.id).startsWith('split-') ? null : item.id,
            inventory_type_id: item.inventory_type_id, consumable_id: item.consumable_id,
            quantity: item.actualQuantity, assigned_to: item.assignTo
          });
        }
      });
      await issueRequest(selectedRequest.id, payloadItems);
      toast.success('Request issued successfully!');
      setIssueModal(false);
      setExpandedRow(null);
      setSearchQuery('');
      load(true);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Issuance failed');
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <input ref={scannerInputRef} type="text" className="absolute opacity-0 w-0 h-0"
        onBlur={() => setTimeout(() => scannerInputRef.current?.focus(), 50)} />

      {/* Header */}
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

      {/* Search + Tabs */}
      <NeumorphCard className="p-4 space-y-4">
        <NeumorphInput icon={<Search size={16} />} placeholder="Search by ID, Name, Room…"
          value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full" />
        <div className="flex overflow-x-auto gap-2 pb-1 hide-scrollbar">
          {['PENDING', 'APPROVED', 'ISSUED', 'ARCHIVED'].map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setExpandedRow(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === tab ? 'bg-primary text-white shadow-md' : 'neu-btn text-muted hover:text-primary'
              }`}>
              {tab === 'PENDING'  && <Clock size={14} />}
              {tab === 'APPROVED' && <CheckCircle2 size={14} />}
              {tab === 'ISSUED'   && <Package size={14} />}
              {tab === 'ARCHIVED' && <AlertCircle size={14} />}
              {tab}
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${activeTab === tab ? 'bg-white/20' : 'bg-black/5'}`}>
                {counts[tab]}
              </span>
            </button>
          ))}
        </div>
      </NeumorphCard>

      {/* Request list */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-10"><div className="neu-spinner" /></div>
        ) : filteredRequests.length === 0 ? (
          <NeumorphCard className="p-10 text-center text-muted"><p className="font-medium">No requests found.</p></NeumorphCard>
        ) : (
          filteredRequests.map(r => (
            <NeumorphCard key={r.id} className={`p-0 overflow-hidden transition-all ${r.isExpired ? 'opacity-70 grayscale' : ''}`}>
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-black/[0.02]"
                onClick={() => setExpandedRow(prev => prev === r.id ? null : r.id)}>
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-black/5 flex items-center justify-center font-mono font-bold text-primary">#{r.id}</div>
                  <div>
                    <p className="font-bold text-gray-800">{r.requester_type.toUpperCase()} ID: {r.requester_id}</p>
                    <div className="flex items-center gap-3 text-xs text-muted mt-1">
                      <span>Room: {r.room_code || 'Global'}</span><span>•</span>
                      <span>{r.items?.length || 0} Items</span>
                      {r.isExpired && <span className="text-red-500 font-bold">• Expired</span>}
                      {r.status === 'PARTIALLY RETURNED' && <span className="text-orange-500 font-bold">• Partial Return</span>}
                      {r.status === 'PENDING APPROVAL' && <span className="text-amber-500 font-bold">• Awaiting Approval</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* PENDING row actions */}
                  {['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired && (
                    <div className="hidden sm:flex items-center gap-2 mr-4">
                      {String(r.requester_type).toLowerCase() === 'faculty' ? (
                        <>
                          {/* Faculty: Approve & Reserve only — barcode scan happens when they physically arrive */}
                          <button onClick={(e) => { e.stopPropagation(); handleApprove(r.id); }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg text-xs font-bold transition-colors">
                            <Check size={14} /> Approve & Reserve
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleReject(r.id); }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-xs font-bold transition-colors">
                            <X size={14} /> Deny
                          </button>
                        </>
                      ) : (
                        // Student: must physically show QR — scan triggers approve + issue modal
                        <button onClick={(e) => { e.stopPropagation(); setCameraModal(true); }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-xs font-bold transition-colors">
                          <Camera size={14} /> Scan QR to Issue
                        </button>
                      )}
                    </div>
                  )}

                  {/* APPROVED: Verify & Issue opens the barcode-scan modal */}
                  {r.status === 'APPROVED' && !r.isExpired && (
                    <NeumorphButton size="sm" variant="primary" className="hidden sm:flex"
                      onClick={(e) => { e.stopPropagation(); openIssueModal(r); }}>
                      <Scan size={13} className="mr-1.5" /> Verify & Issue
                    </NeumorphButton>
                  )}

                  <button className="text-muted p-2">
                    {expandedRow === r.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>
              </div>

              {expandedRow === r.id && (
                <div className="p-4 bg-black/[0.01] grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-black/5">
                  <div className="space-y-4">
                    <div className="neu-inset p-3 rounded-lg text-sm">
                      <p className="text-xs text-muted uppercase tracking-wider mb-1">Details</p>
                      <p><strong>Purpose:</strong> {r.purpose || '—'}</p>
                      <p><strong>Return Deadline:</strong> {r.return_deadline ? fmtDateTime(r.return_deadline) : 'Walk-in / End of Day'}</p>

                      {/* Mobile pending actions */}
                      {['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired && (
                        <div className="flex sm:hidden items-center gap-2 mt-4 pt-4 border-t border-black/10">
                          {String(r.requester_type).toLowerCase() === 'faculty' ? (
                            <>
                              <button onClick={() => handleApprove(r.id)} className="flex-1 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-bold">Approve & Reserve</button>
                              <button onClick={() => handleReject(r.id)} className="flex-1 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-bold">Deny</button>
                            </>
                          ) : (
                            <button onClick={() => setCameraModal(true)} className="flex-1 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-bold">Scan QR to Issue</button>
                          )}
                        </div>
                      )}

                      {/* Mobile approved action */}
                      {r.status === 'APPROVED' && !r.isExpired && (
                        <div className="flex sm:hidden mt-4 pt-4 border-t border-black/10">
                          <button onClick={() => openIssueModal(r)}
                            className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                            <Scan size={13} /> Verify & Issue
                          </button>
                        </div>
                      )}
                    </div>

                    {r.members && r.members.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-muted uppercase mb-2"><Users size={14} className="inline mr-1"/> Companions</p>
                        <div className="space-y-2">
                          {r.members.map((m, idx) => (
                            <div key={idx} className="flex justify-between text-sm bg-white p-2 rounded-lg border border-black/5">
                              <span className="font-medium">{m.full_name}</span>
                              <span className="text-muted font-mono text-xs">{m.student_id !== 'N/A' ? m.student_id : 'Faculty'}</span>
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
                              {item.status && (
                                <span className={`text-[10px] font-bold uppercase ${item.status === 'RETURNED' ? 'text-emerald-500' : 'text-amber-500'}`}>
                                  {item.status}
                                </span>
                              )}
                            </div>
                            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full font-bold">×{item.quantity}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </NeumorphCard>
          ))
        )}
      </div>

      {/* Camera modal */}
      <NeumorphModal open={cameraModal} onClose={() => setCameraModal(false)} title="Scan Kiosk QR">
        {cameraModal && <QrCameraScanner onResult={handleQRResult} />}
      </NeumorphModal>

      {/* Issue modal */}
      <NeumorphModal
        open={issueModal}
        onClose={() => setIssueModal(false)}
        title={`Issue Request #${selectedRequest?.id}${selectedRequest ? ` — ${selectedRequest.requester_type?.toUpperCase()}` : ''}`}
        size="lg"
      >
        <div className="space-y-6">
          <div className="bg-blue-50 text-blue-800 p-3 rounded-xl text-sm border border-blue-200 flex items-center justify-between">
            <div><strong>Scanner Active.</strong> Scan each item's barcode to verify the exact unit being handed over.</div>
            <Barcode size={24} className="text-blue-400 animate-pulse" />
          </div>

          {/* Manual search */}
          <div className="bg-black/[0.02] p-4 rounded-xl border border-black/5">
            <label className="text-xs font-bold text-muted uppercase mb-2 block">Manual Search & Add</label>
            <div className="relative">
              <NeumorphInput placeholder="Type to search inventory if scanner fails…"
                value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} icon={<Search size={16}/>} className="w-full" />
              {itemSearch && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-black/10 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {inventory.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase())).slice(0, 10).map(invItem => (
                    <button key={invItem.id} onClick={() => addNewItemToCart(invItem)}
                      className="w-full text-left px-4 py-3 hover:bg-primary/5 border-b border-black/5 flex justify-between items-center">
                      <span className="text-sm font-medium">{invItem.name} <span className="text-xs text-muted">({invItem.kind})</span></span>
                      <Plus size={16} className="text-primary"/>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Items */}
          <div>
            <label className="text-xs font-bold text-muted uppercase mb-2 block">Review & Verify</label>
            <div className="space-y-4">
              {adjustedItems.map((item, index) => {
                const validInventory = inventory.filter(inv => String(inv.inventory_type_id) === String(item.inventory_type_id));
                const isSatisfied = item.actualQuantity > 0 &&
                  (item.consumable_id ? true : item.actualQuantity === (item.scannedPhysicalItems?.length || 0));

                return (
                  <div key={item.id}
                    className={`p-4 rounded-2xl border shadow-sm flex flex-col gap-3 transition-colors ${
                      isSatisfied ? 'bg-green-50/50 border-green-200' : 'bg-white border-black/10'
                    }`}>
                    <div className="flex justify-between gap-3">
                      <div className="flex-1">
                        <span className="text-sm font-bold block">
                          {item.item_name}
                          {item.isNew && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded uppercase ml-1">Added</span>}
                        </span>

                        {!item.consumable_id && item.actualQuantity > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                            <span className="text-[10px] text-muted font-bold uppercase tracking-wider">Available Barcodes:</span>
                            {validInventory.length > 0 ? validInventory.map(inv => {
                              const isScanned = item.scannedPhysicalItems?.some(spi => spi.id === inv.id);
                              return (
                                <span key={inv.id} className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-all ${
                                  isScanned ? 'bg-green-100 text-green-700 line-through opacity-50' : 'bg-black/5 text-gray-700'
                                }`}>{String(inv.barcode)}</span>
                              );
                            }) : (
                              <span className="text-[10px] text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded">Out of Stock</span>
                            )}
                          </div>
                        )}

                        {item.consumable_id && item.actualQuantity > 0 && (
                          <div className="mt-2 text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded w-fit">
                            Consumable — No scan needed
                          </div>
                        )}
                      </div>

                      <div className="flex items-start gap-1.5 bg-black/5 p-1 rounded-lg h-fit">
                        <button onClick={() => updateQty(item.id, item.actualQuantity - 1)} className="w-7 h-7 flex justify-center items-center bg-white rounded text-muted hover:text-primary"><Minus size={14}/></button>
                        <span className="w-8 text-center text-sm font-bold">{item.actualQuantity}</span>
                        <button onClick={() => updateQty(item.id, item.actualQuantity + 1)} className="w-7 h-7 flex justify-center items-center bg-white rounded text-muted hover:text-primary"><Plus size={14}/></button>
                        <div className="w-[1px] h-4 bg-black/10 mx-1"></div>
                        <button onClick={() => removeAdjustedItem(item.id)} className="w-7 h-7 flex justify-center items-center text-red-500 hover:bg-red-50 rounded"><Trash2 size={14}/></button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-1">
                      {item.scannedPhysicalItems?.map(spi => (
                        <span key={spi.id} className="bg-green-100 text-green-800 border border-green-300 text-[10px] font-mono px-2 py-1 rounded flex items-center gap-1 shadow-sm">
                          <Scan size={10}/> {spi.barcode}
                          <button onClick={() => removeScannedItem(item.id, spi.id)} className="hover:text-red-500 ml-1"><X size={10}/></button>
                        </span>
                      ))}
                      {!item.consumable_id && item.actualQuantity > (item.scannedPhysicalItems?.length || 0) && (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1 border border-amber-200">
                          <Scan size={10} className="animate-pulse"/>
                          Scan {item.actualQuantity - (item.scannedPhysicalItems?.length || 0)} more
                        </span>
                      )}
                    </div>

                    <div className="pt-2 border-t border-black/5">
                      <div className="flex justify-between mb-2">
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Assign To:</span>
                        {item.actualQuantity > 1 && selectedRequest?.members?.length > 0 && (
                          <button onClick={() => handleSplitItem(index)}
                            className="text-[10px] flex items-center gap-1 text-primary bg-primary/10 px-2 py-0.5 rounded font-bold uppercase">
                            <Copy size={10}/> Split Item
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <AssignChip active={item.assignTo === 'Requester'} onClick={() => setAssignTo(item.id, 'Requester')} label="Requester" icon={<User size={12}/>} />
                        {selectedRequest?.members?.map((m, mIdx) => (
                          <AssignChip key={mIdx} active={item.assignTo === m.full_name} onClick={() => setAssignTo(item.id, m.full_name)} label={m.full_name} icon={<User size={12}/>} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {!isReadyToIssue && (
            <div className="bg-amber-50 text-amber-800 p-3 rounded-xl text-sm border border-amber-200">
              <strong>Action Required:</strong> Scan every equipment barcode before issuing.
              Use "−" to reduce quantity if an item is damaged or missing.
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-black/5">
            <NeumorphButton variant="outline" className="flex-1" onClick={() => setIssueModal(false)}>Cancel</NeumorphButton>
            <NeumorphButton variant="primary" className="flex-1 py-3" onClick={handleIssue} loading={issuing} disabled={!isReadyToIssue}>
              <Package size={16} className="mr-2" /> Lock & Issue Items
            </NeumorphButton>
          </div>
        </div>
      </NeumorphModal>
    </div>
  );
}
