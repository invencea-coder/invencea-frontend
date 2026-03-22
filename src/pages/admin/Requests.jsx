import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  RefreshCw, Package, Scan, Camera, ChevronDown, ChevronUp, 
  Search, Clock, CheckCircle2, AlertCircle, Users, Box, Plus, Minus, Trash2, User, Copy, Check, X, Barcode, History, Link as LinkIcon, Lock
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import api from '../../api/axiosClient.js'; // Needed to check room status
import { listRequests, getRequest, getRequestByQR, issueRequest, approveRequest, rejectRequest, createRequest } from '../../api/requestAPI.js';
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
      try { cameras = await Html5Qrcode.getCameras().catch(() => []); } catch { cameras = []; }
      if (!cameras || cameras.length === 0) {
        if (isMountedRef.current) toast.error('Could not access camera. Please allow camera permissions.');
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
  
  // --- LOCKDOWN STATE ---
  const [isRoomLocked, setIsRoomLocked] = useState(false);
  
  // Standard Issue Modal
  const [issueModal, setIssueModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [adjustedItems, setAdjustedItems] = useState([]);
  const [itemSearch, setItemSearch] = useState(''); 
  const [issuing, setIssuing] = useState(false);
  const [cameraModal, setCameraModal] = useState(false);

  // Manual Log Modal
  const [manualModal, setManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({ studentId: '', purpose: 'Manual / Offline Log', manualSearch: '' });
  const [manualItems, setManualItems] = useState([]);

  const scannerInputRef = useRef(null);
  const scannerBufferRef = useRef('');
  const issueModalOpenRef = useRef(false);
  const manualModalOpenRef = useRef(false);
  const inventoryRef = useRef([]);

  useEffect(() => { issueModalOpenRef.current = issueModal; }, [issueModal]);
  useEffect(() => { manualModalOpenRef.current = manualModal; }, [manualModal]);

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
      
      // Fetch Room Status + Requests + Inventory
      const [roomsRes, reqRes, invRes] = await Promise.all([
        api.get('/admin/rooms').catch(() => ({ data: { data: [] } })),
        listRequests({}), 
        listInventory(invParams)
      ]);
      
      const myRoom = (roomsRes.data?.data || roomsRes.data || []).find(r => String(r.id) === String(user?.room_id));
      if (myRoom) setIsRoomLocked(!myRoom.is_available);

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

  const handleApprove = async (id) => {
    if (isRoomLocked) return;
    try {
      toast.loading('Approving & reserving items…', { id: 'action' });
      await approveRequest(id);
      toast.success('Request Approved & Items Reserved!', { id: 'action' });
      load(true);
    } catch (e) { toast.error('Approval failed', { id: 'action' }); }
  };

  const handleReject = async (id) => {
    if (isRoomLocked) return;
    try {
      toast.loading('Rejecting…', { id: 'action' });
      await rejectRequest(id);
      toast.success('Request Denied.', { id: 'action' });
      load(true);
    } catch (e) { toast.error('Rejection failed', { id: 'action' }); }
  };

  const openIssueModal = (req) => {
    if (isRoomLocked) return;
    setSelectedRequest(req);
    setAdjustedItems(req.items.map((i, idx) => {
      let assignee = i.assigned_to || i.assignTo || 'Requester';
      if (assignee === 'Shared Group' || assignee === 'Shared') assignee = 'Requester';
      const isQtyMode = !!i.stock_id;
      return {
        ...i, id: i.id || `temp-${idx}`,
        actualQuantity: isQtyMode ? (i.qty_requested || i.quantity || 1) : (i.quantity || 1),
        assignTo: assignee, scannedPhysicalItems: [], isQtyMode,
      };
    }));
    setIssueModal(true);
  };

  const handleQRResult = useCallback(async (code) => {
    setCameraModal(false); setSearchQuery('');
    try {
      toast.loading('Processing QR…', { id: 'qrScan' });
      const { data } = await getRequestByQR(code);
      const req = data.data ?? data;

      if (isExpiredSameDay(req.created_at) && ['PENDING', 'APPROVED', 'PENDING APPROVAL'].includes(req.status)) {
        toast.error('This request has expired.', { id: 'qrScan' });
        setActiveTab('ARCHIVED'); setSearchQuery(String(req.id));
        return;
      }

      const type = String(req.requester_type).toLowerCase();

      if (['PENDING', 'PENDING APPROVAL'].includes(req.status)) {
        const label = type === 'faculty' ? 'Reserving items…' : 'Verifying request…';
        toast.loading(label, { id: 'qrScan' });
        await approveRequest(req.id);
        const { data: freshData } = await getRequest(req.id);
        const freshReq = freshData.data ?? freshData;
        toast.success(type === 'faculty' ? 'Items reserved! Scan barcodes to hand over.' : 'Verified! Scan item barcodes to issue.', { id: 'qrScan' });
        setActiveTab('APPROVED');
        openIssueModal(freshReq);
        return;
      }

      if (req.status === 'APPROVED') {
        toast.success('Ready to issue. Scan item barcodes.', { id: 'qrScan' });
        setActiveTab('APPROVED');
        openIssueModal(req);
        return;
      }

      toast.success(`Request #${req.id} — ${req.status}`, { id: 'qrScan' });
      setActiveTab(['ISSUED', 'PARTIALLY RETURNED'].includes(req.status) ? 'ISSUED' : req.status);
      setSearchQuery(String(req.id));
      setExpandedRow(req.id);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Invalid QR Code or Request Not Found', { id: 'qrScan' });
    }
  }, []);

  const handleItemScan = (barcode) => {
    const norm = (b) => String(b ?? '').trim().replace(/^0+(\d)/, '$1');
    const invItem = inventoryRef.current.find(i => norm(i.barcode) === norm(barcode));

    if (!invItem) { toast.error(`Barcode ${barcode} not found in this room.`); return; }
    if (invItem.inventory_mode === 'quantity' || invItem.kind === 'quantity') {
      toast(`${invItem.name} is qty-mode. Adjust quantity manually.`, { icon: 'ℹ️' }); return;
    }
    if (invItem.kind === 'consumable') { toast.success(`${invItem.name} verified.`); return; }

    const updateFn = (prev) => {
      const newItems = [...prev];
      const alreadyScanned = newItems.some(item => item.scannedPhysicalItems?.some(spi => spi.id === invItem.id));
      if (alreadyScanned) { toast.error('Already scanned this unit!'); return prev; }

      const matchIndex = newItems.findIndex(item =>
        !item.isQtyMode && String(item.inventory_type_id) === String(invItem.inventory_type_id) &&
        (item.scannedPhysicalItems?.length || 0) < item.actualQuantity
      );

      if (matchIndex >= 0) {
        const matched = newItems[matchIndex];
        newItems[matchIndex] = { ...matched, scannedPhysicalItems: [...(matched.scannedPhysicalItems || []), invItem] };
        toast.success(`Matched: ${invItem.barcode}`);
      } else {
        newItems.push({
          id: `new-${Date.now()}`, item_name: invItem.name, inventory_type_id: invItem.inventory_type_id,
          consumable_id: null, quantity: 1, actualQuantity: 1, isNew: true, assignTo: 'Requester',
          scannedPhysicalItems: [invItem], isQtyMode: false,
        });
        toast.success(`Added extra: ${invItem.name}`);
      }
      return newItems;
    };

    if (issueModalOpenRef.current) setAdjustedItems(updateFn);
    else if (manualModalOpenRef.current) setManualItems(updateFn);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (document.activeElement !== scannerInputRef.current && ['input', 'textarea', 'select'].includes(tag)) return;
      if (e.key === 'Enter') {
        const code = scannerBufferRef.current.trim();
        scannerBufferRef.current = '';
        if (code.length > 0) {
          if (issueModalOpenRef.current || manualModalOpenRef.current) handleItemScan(code);
          else if (!isRoomLocked) handleQRResult(code); // Protect global scan
        }
        return;
      }
      if (e.key.length === 1) scannerBufferRef.current += e.key;
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleQRResult, isRoomLocked]);

  const addNewItemToCart = (invItem, setFn) => {
    setFn(prev => {
      const existing = prev.find(i =>
        (invItem.kind === 'borrowable' && String(i.inventory_type_id) === String(invItem.inventory_type_id)) ||
        (invItem.kind === 'consumable' && String(i.consumable_id) === String(invItem.id))
      );
      if (existing) {
        return prev.map(p => p.id === existing.id ? {...p, actualQuantity: p.actualQuantity + 1} : p);
      } else {
        return [...prev, {
          id: `new-${Date.now()}`, item_name: invItem.name, inventory_type_id: invItem.inventory_type_id,
          consumable_id: invItem.kind === 'consumable' ? invItem.id : null,
          quantity: 1, actualQuantity: 1, isNew: true, assignTo: 'Requester', scannedPhysicalItems: []
        }];
      }
    });
    setItemSearch('');
    setManualForm(prev => ({...prev, manualSearch: ''}));
  };

  const isReadyToIssue = adjustedItems.length > 0 && adjustedItems.every(item => {
    if (item.actualQuantity <= 0) return true;
    if (item.consumable_id) return true;
    if (item.isQtyMode) return true;
    return (item.scannedPhysicalItems?.length || 0) === item.actualQuantity;
  });

  const isManualReady = manualItems.length > 0 && manualForm.studentId.trim() !== '' && manualItems.every(item => {
    if (item.actualQuantity <= 0) return true;
    if (item.consumable_id) return true;
    if (item.isQtyMode) return true;
    return (item.scannedPhysicalItems?.length || 0) === item.actualQuantity;
  });

  const handleIssue = async () => {
    if (!selectedRequest) return;
    setIssuing(true);
    try {
      const payloadItems = [];
      adjustedItems.forEach(item => {
        if (item.actualQuantity <= 0) { payloadItems.push({ id: item.id, quantity: 0 }); return; }
        if (item.isQtyMode) {
          payloadItems.push({ id: item.isNew ? null : item.id, inventory_type_id: item.inventory_type_id, stock_id: item.stock_id, qty_requested: item.actualQuantity, quantity: item.actualQuantity, assigned_to: item.assignTo });
          return;
        }
        const scanned = item.scannedPhysicalItems || [];
        if (!item.consumable_id) {
          scanned.forEach(spi => payloadItems.push({ id: item.isNew || String(item.id).startsWith('split-') ? null : item.id, inventory_type_id: item.inventory_type_id, consumable_id: null, quantity: 1, inventory_item_id: spi.id, assigned_to: item.assignTo }));
          return;
        }
        payloadItems.push({ id: item.isNew || String(item.id).startsWith('split-') ? null : item.id, inventory_type_id: item.inventory_type_id, consumable_id: item.consumable_id, quantity: item.actualQuantity, assigned_to: item.assignTo });
      });
      await issueRequest(selectedRequest.id, payloadItems);
      toast.success('Request issued successfully!');
      setIssueModal(false); setExpandedRow(null); setSearchQuery(''); load(true);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Issuance failed');
    } finally { setIssuing(false); }
  };

  const handleManualSync = async () => {
    if (!isManualReady) return;
    setIssuing(true);
    try {
      const createPayload = {
        room_id: user?.room_id,
        purpose: manualForm.purpose,
        companions: [{ name: 'Offline Borrower', student_id: manualForm.studentId }],
        items: manualItems.map(c => {
          if (c.isQtyMode) return { inventory_type_id: c.inventory_type_id, stock_id: c.stock_id, qty_requested: c.actualQuantity, assigned_to: 'Offline Borrower' };
          return { inventory_type_id: c.inventory_type_id, consumable_id: c.consumable_id, quantity: c.actualQuantity, assigned_to: 'Offline Borrower' };
        })
      };

      const createRes = await createRequest(createPayload);
      const newReqId = createRes.data.data.id || createRes.data.id;

      await approveRequest(newReqId);

      const payloadItems = [];
      manualItems.forEach(item => {
        if (item.isQtyMode) {
          payloadItems.push({ inventory_type_id: item.inventory_type_id, stock_id: item.stock_id, qty_requested: item.actualQuantity, quantity: item.actualQuantity, assigned_to: 'Offline Borrower' });
          return;
        }
        const scanned = item.scannedPhysicalItems || [];
        if (!item.consumable_id) {
          scanned.forEach(spi => payloadItems.push({ inventory_type_id: item.inventory_type_id, consumable_id: null, quantity: 1, inventory_item_id: spi.id, assigned_to: 'Offline Borrower' }));
          return;
        }
        payloadItems.push({ inventory_type_id: item.inventory_type_id, consumable_id: item.consumable_id, quantity: item.actualQuantity, assigned_to: 'Offline Borrower' });
      });

      await issueRequest(newReqId, payloadItems);
      
      toast.success('Offline Manual Log Synced Successfully!');
      setManualModal(false); setManualForm({ studentId: '', purpose: 'Manual / Offline Log', manualSearch: '' }); setManualItems([]); load(true);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Manual Sync Failed');
    } finally { setIssuing(false); }
  };

  const renderModalItemRow = (item, setFn, isManual = false) => {
    const validInventory = inventory.filter(inv => String(inv.inventory_type_id) === String(item.inventory_type_id) && !item.isQtyMode);
    const isSatisfied = item.actualQuantity <= 0 || !!item.consumable_id || !!item.isQtyMode || item.actualQuantity === (item.scannedPhysicalItems?.length || 0);

    return (
      <div key={item.id} className={`p-4 rounded-2xl border shadow-sm flex flex-col gap-3 transition-colors ${isSatisfied ? 'bg-green-50/50 border-green-200' : 'bg-white border-black/10'}`}>
        <div className="flex justify-between gap-3">
          <div className="flex-1">
            <span className="text-sm font-bold block">{item.item_name}
              {item.isNew && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded uppercase ml-1">Added</span>}
              {item.isQtyMode && <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded uppercase ml-1 inline-flex items-center gap-0.5">⊞ qty</span>}
            </span>
            {!item.consumable_id && !item.isQtyMode && item.actualQuantity > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] text-muted font-bold uppercase tracking-wider">Available Barcodes:</span>
                {validInventory.length > 0 ? validInventory.map(inv => {
                  const isScanned = item.scannedPhysicalItems?.some(spi => spi.id === inv.id);
                  return <span key={inv.id} className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-all ${isScanned ? 'bg-green-100 text-green-700 line-through opacity-50' : 'bg-black/5 text-gray-700'}`}>{String(inv.barcode)}</span>
                }) : <span className="text-[10px] text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded">Out of Stock</span>}
              </div>
            )}
          </div>
          <div className="flex items-start gap-1.5 bg-black/5 p-1 rounded-lg h-fit">
            <button onClick={() => setFn(prev => prev.map(p => p.id === item.id ? { ...p, actualQuantity: Math.max(0, p.actualQuantity - 1) } : p))} className="w-7 h-7 flex justify-center items-center bg-white rounded text-muted hover:text-primary"><Minus size={14} /></button>
            <span className="w-8 text-center text-sm font-bold">{item.actualQuantity}</span>
            <button onClick={() => setFn(prev => prev.map(p => p.id === item.id ? { ...p, actualQuantity: p.actualQuantity + 1 } : p))} className="w-7 h-7 flex justify-center items-center bg-white rounded text-muted hover:text-primary"><Plus size={14} /></button>
            <div className="w-[1px] h-4 bg-black/10 mx-1" />
            <button onClick={() => setFn(prev => prev.filter(p => p.id !== item.id))} className="w-7 h-7 flex justify-center items-center text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
          </div>
        </div>
        {!item.isQtyMode && (
          <div className="flex flex-wrap gap-2 mt-1">
            {item.scannedPhysicalItems?.map(spi => (
              <span key={spi.id} className="bg-green-100 text-green-800 border border-green-300 text-[10px] font-mono px-2 py-1 rounded flex items-center gap-1 shadow-sm">
                <Scan size={10} /> {spi.barcode}
                <button onClick={() => setFn(prev => prev.map(p => p.id !== item.id ? p : { ...p, scannedPhysicalItems: p.scannedPhysicalItems.filter(s => s.id !== spi.id) }))} className="hover:text-red-500 ml-1"><X size={10} /></button>
              </span>
            ))}
            {!item.consumable_id && item.actualQuantity > (item.scannedPhysicalItems?.length || 0) && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1 border border-amber-200">
                <Scan size={10} className="animate-pulse" /> Scan {item.actualQuantity - (item.scannedPhysicalItems?.length || 0)} more
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <input ref={scannerInputRef} type="text" className="absolute opacity-0 w-0 h-0"
        onBlur={() => setTimeout(() => scannerInputRef.current?.focus(), 50)} />

      {/* LOCKDOWN WARNING BANNER */}
      {isRoomLocked && (
        <div className="bg-red-50 border-2 border-red-200 p-4 rounded-2xl flex items-center gap-3 animate-fade-in">
          <div className="bg-red-100 text-red-600 p-2 rounded-xl flex-shrink-0">
            <Lock size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-red-800">Room is Unavailable</h3>
            <p className="text-xs text-red-700 mt-0.5">All request processing (Approve, Deny, Issue, Manual Log) is temporarily locked.</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Request Management</h1>
          <p className="text-xs text-muted">Manage, approve, assign, and issue requests</p>
        </div>
        <div className="flex gap-2">
          <NeumorphButton size="sm" variant="primary" onClick={() => setCameraModal(true)} disabled={isRoomLocked}>
            {isRoomLocked ? <Lock size={14} className="mr-2" /> : <Camera size={14} className="mr-2" />} 
            Scan Kiosk QR
          </NeumorphButton>
          <button onClick={() => load(false)} className="neu-btn px-3"><RefreshCw size={14} /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Col: Actions */}
        <div className="lg:col-span-1 space-y-4">
          <button disabled={isRoomLocked} onClick={() => setManualModal(true)} className={`flex items-start gap-3 p-4 w-full text-left bg-surface border border-black/10 rounded-xl transition-all group ${isRoomLocked ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:border-primary/30 hover:shadow-md'}`}>
            <div className={`mt-0.5 ${isRoomLocked ? 'text-gray-500' : 'text-primary opacity-80 group-hover:opacity-100'} transition-opacity`}>
              {isRoomLocked ? <Lock size={20} /> : <History size={20} />}
            </div>
            <div className="flex flex-col">
              <span className={`font-bold text-sm ${isRoomLocked ? 'text-gray-600' : 'text-gray-800 group-hover:text-primary'} transition-colors`}>
                Log Manual Borrowing
              </span>
              <span className="text-xs text-muted mt-0.5 leading-relaxed">
                Did someone borrow items while the internet was down? Enter the <span className="text-red-800 font-bold">Borrower's slip</span> here.
              </span>
            </div>
          </button>
        </div>

        {/* Right Col: Table & Tabs */}
        <div className="lg:col-span-3 space-y-6">
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
                      {['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired && (
                        <div className="hidden sm:flex items-center gap-2 mr-4">
                          {String(r.requester_type).toLowerCase() === 'faculty' ? (
                            <>
                              <button disabled={isRoomLocked} onClick={(e) => { e.stopPropagation(); handleApprove(r.id); }}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${isRoomLocked ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                                {isRoomLocked ? <Lock size={14}/> : <Check size={14} />} Approve & Reserve
                              </button>
                              <button disabled={isRoomLocked} onClick={(e) => { e.stopPropagation(); handleReject(r.id); }}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${isRoomLocked ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                                {isRoomLocked ? <Lock size={14}/> : <X size={14} />} Deny
                              </button>
                            </>
                          ) : (
                            <button disabled={isRoomLocked} onClick={(e) => { e.stopPropagation(); setCameraModal(true); }}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${isRoomLocked ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                              {isRoomLocked ? <Lock size={14}/> : <Camera size={14} />} Scan QR to Issue
                            </button>
                          )}
                        </div>
                      )}
                      {r.status === 'APPROVED' && !r.isExpired && (
                        <NeumorphButton size="sm" variant="primary" className="hidden sm:flex" disabled={isRoomLocked}
                          onClick={(e) => { e.stopPropagation(); openIssueModal(r); }}>
                          {isRoomLocked ? <Lock size={13} className="mr-1.5"/> : <Scan size={13} className="mr-1.5" />} Verify & Issue
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
                                  {displayAssignee && displayAssignee !== 'Requester' && <p className="text-[10px] text-muted">Assigned: {displayAssignee}</p>}
                                  {item.status && <span className={`text-[10px] font-bold uppercase ${item.status === 'RETURNED' ? 'text-emerald-500' : 'text-amber-500'}`}>{item.status}</span>}
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
        </div>
      </div>

      <NeumorphModal open={cameraModal} onClose={() => setCameraModal(false)} title="Scan Kiosk QR">
        {cameraModal && <QrCameraScanner onResult={handleQRResult} />}
      </NeumorphModal>

      {/* Manual Sync Modal */}
      <NeumorphModal open={manualModal} onClose={() => setManualModal(false)} title="Log Offline Transaction" size="lg">
        <div className="space-y-6">
          <div className="bg-amber-50 text-amber-800 p-3 rounded-xl text-sm border border-amber-200">
            <strong>Offline Sync:</strong> Scan items directly into this form. When you click sync, the system will instantly mark these items as Issued to this borrower.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NeumorphInput label="Student / Borrower ID" placeholder="e.g. 2021-00001" value={manualForm.studentId} onChange={(e) => setManualForm({...manualForm, studentId: e.target.value})} autoFocus />
            <NeumorphInput label="Purpose" value={manualForm.purpose} onChange={(e) => setManualForm({...manualForm, purpose: e.target.value})} />
          </div>
          
          <div className="bg-black/[0.02] p-4 rounded-xl border border-black/5">
            <label className="text-xs font-bold text-muted uppercase mb-2 block">Scan or Search Items Handed Out</label>
            <div className="relative">
              <NeumorphInput placeholder="Search inventory by name to add manually…"
                value={manualForm.manualSearch} onChange={(e) => setManualForm({...manualForm, manualSearch: e.target.value})} icon={<Search size={16}/>} className="w-full" />
              {manualForm.manualSearch && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-black/10 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {inventory.filter(i => i.name.toLowerCase().includes(manualForm.manualSearch.toLowerCase())).slice(0, 10).map(invItem => (
                    <button key={invItem.id} onClick={() => addNewItemToCart(invItem, setManualItems)}
                      className="w-full text-left px-4 py-3 hover:bg-primary/5 border-b border-black/5 flex justify-between items-center">
                      <span className="text-sm font-medium">{invItem.name} <span className="text-xs text-muted">({invItem.kind})</span></span>
                      <Plus size={16} className="text-primary"/>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {manualItems.length === 0 ? (
              <div className="p-8 text-center text-muted border-2 border-dashed border-black/10 rounded-xl">No items scanned yet.</div>
            ) : (
              manualItems.map((item) => renderModalItemRow(item, setManualItems, true))
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t border-black/5">
            <NeumorphButton variant="outline" className="flex-1" onClick={() => setManualModal(false)}>Cancel</NeumorphButton>
            <NeumorphButton variant="primary" className="flex-1 py-3" onClick={handleManualSync} loading={issuing} disabled={!isManualReady}>
              <LinkIcon size={16} className="mr-2" /> Sync to Database
            </NeumorphButton>
          </div>
        </div>
      </NeumorphModal>

      {/* Standard Issue Modal */}
      <NeumorphModal open={issueModal} onClose={() => setIssueModal(false)} title={`Issue Request #${selectedRequest?.id}`} size="lg">
        <div className="space-y-6">
          <div className="bg-blue-50 text-blue-800 p-3 rounded-xl text-sm border border-blue-200 flex items-center justify-between">
            <div><strong>Scanner Active.</strong> Scan each item's barcode to verify the exact unit being handed over.</div>
            <Barcode size={24} className="text-blue-400 animate-pulse" />
          </div>

          <div className="bg-black/[0.02] p-4 rounded-xl border border-black/5">
            <label className="text-xs font-bold text-muted uppercase mb-2 block">Manual Search & Add</label>
            <div className="relative">
              <NeumorphInput placeholder="Type to search inventory if scanner fails…"
                value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} icon={<Search size={16}/>} className="w-full" />
              {itemSearch && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-black/10 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {inventory.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase())).slice(0, 10).map(invItem => (
                    <button key={invItem.id} onClick={() => addNewItemToCart(invItem, setAdjustedItems)}
                      className="w-full text-left px-4 py-3 hover:bg-primary/5 border-b border-black/5 flex justify-between items-center">
                      <span className="text-sm font-medium">{invItem.name} <span className="text-xs text-muted">({invItem.kind})</span></span>
                      <Plus size={16} className="text-primary"/>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-muted uppercase mb-2 block">Review & Verify</label>
            <div className="space-y-4">
              {adjustedItems.map((item) => renderModalItemRow(item, setAdjustedItems, false))}
            </div>
          </div>

          {!isReadyToIssue && (
            <div className="bg-amber-50 text-amber-800 p-3 rounded-xl text-sm border border-amber-200">
              <strong>Action Required:</strong> Scan every equipment barcode before issuing. Use "−" to reduce quantity if missing.
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