// src/pages/admin/Requests.jsx
import React, {
  useState, useEffect, useRef, useMemo, useCallback,
} from 'react';
import {
  RefreshCw, Package, Scan, Camera, Search, Clock, CheckCircle2,
  AlertCircle, Plus, Minus, Trash2, X, Barcode,
  Lock, Bell, BellRing, ChevronDown, ChevronUp,
  Timer, Check, Flame, CalendarRange, AlertTriangle,
  UserCheck, CalendarClock, Zap, Menu, CalendarDays,
  ListTodo,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { addHours, startOfTomorrow } from 'date-fns';

import api from '../../api/axiosClient.js';
import {
  listRequests, getRequestByQR,
  issueRequest, approveRequest, rejectRequest, createRequest,
} from '../../api/requestAPI.js';
import { listInventory } from '../../api/inventoryAPI.js';
import { useAuth } from '../../context/AuthContext.jsx';

import NeumorphCard    from '../../components/ui/NeumorphCard.jsx';
import NeumorphButton  from '../../components/ui/NeumorphButton.jsx';
import NeumorphModal   from '../../components/ui/NeumorphModal.jsx';
import NeumorphInput   from '../../components/ui/NeumorphInput.jsx';
import AvailabilityCalendar from '../../components/AvailabilityCalendar.jsx';

const SOCKET_URL =
  import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';

const getPHTDateObj = () => {
  const str = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
  return new Date(str); 
};

const getPHTDateStringFromDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getPHTTimeStringFromDate = (d) => {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

const toPHTime = (d) => {
  if (!d) return null;
  let str = typeof d === 'string' ? d : String(d);
  if (str.includes('T') && !str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
    str += 'Z';
  }
  return new Date(str);
};

const fmtDateTimeFull = (d) => {
  if (!d) return '—';
  try {
    return toPHTime(d)
      .toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
      .replace(' at ', ', ');
  } catch { return '—'; }
};

const fmtTime = (d) => {
  if (!d) return null;
  try {
    return toPHTime(d).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return null; }
};

const getPHTDateString = (d) => {
  if (!d) return '';
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const parts = fmt.formatToParts(toPHTime(d));
    const get = (t) => parts.find(p => p.type === t)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch { return ''; }
};

const getPHTTimeString = (d) => {
  if (!d) return '';
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(toPHTime(d));
    const h = parts.find(p => p.type === 'hour')?.value ?? '00';
    const m = parts.find(p => p.type === 'minute')?.value ?? '00';
    return `${h === '24' ? '00' : h}:${m}`;
  } catch { return ''; }
};

const getSlotTime = (r) =>
  r.issued_time || r.pickup_datetime || r.scheduled_time || r.pickup_start || null;

const getTimeRange = (r) => {
  const start = getSlotTime(r);
  const end   = r.return_deadline || r.pickup_end;
  if (!start && !end) return null;
  if (start && end)  return `${fmtTime(start)} – ${fmtTime(end)}`;
  if (start)         return `From ${fmtTime(start)}`;
  return `Until ${fmtTime(end)}`;
};

const isExpiredRow = (r) => {
  if (!['PENDING', 'APPROVED', 'PENDING APPROVAL'].includes(r.status?.toUpperCase())) return false;
  const now = Date.now();
  if (r.pickup_datetime) {
    return now > toPHTime(r.pickup_datetime).getTime() + 15 * 60_000;
  }
  if (r.pickup_start) {
    const e = toPHTime(r.pickup_start); e.setHours(23, 59, 59, 999);
    return now > e.getTime();
  }
  if (r.created_at) {
    const e = toPHTime(r.created_at); e.setHours(23, 59, 59, 999);
    return now > e.getTime();
  }
  return false;
};

const getRequestUrgency = (req) => {
  if (['RETURNED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(req.status)) return null;
  const now = Date.now();

  if (['PENDING', 'APPROVED', 'PENDING APPROVAL'].includes(req.status)) {
    if (req.pickup_datetime) {
      const start = toPHTime(req.pickup_datetime).getTime();
      const expiresAt = start + 15 * 60_000; 
      if (now >= start && now <= expiresAt) return 'pickup_active';
      if (now > expiresAt) return 'void';
    }
    return null;
  }

  if (['ISSUED', 'PARTIALLY RETURNED'].includes(req.status) && req.return_deadline) {
    const minsLeft = Math.ceil((toPHTime(req.return_deadline).getTime() - now) / 60_000);
    if (minsLeft <= 0) return 'overdue';
    if (minsLeft <= 15) return 'critical';
    if (minsLeft <= 60) return 'warning';
  }
  return null;
};

const getRequestTypeLabel = (r) => {
  if (r.pickup_start)                          return 'Multiple Days';
  if (r.pickup_datetime || r.scheduled_time)   return 'Reserved Slot';
  return 'Walk-in';
};

const getRequestRelevantDate = (r) =>
  getPHTDateString(
    r.pickup_datetime || r.pickup_start ||
    r.issued_time     || r.scheduled_time ||
    r.created_at      || null,
  );

const fmtDateLabel = (dateStr) => {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return dateStr; }
};

const STATUS_TEXT_CLS = {
  ISSUED:             'text-emerald-800',
  APPROVED:           'text-blue-800',
  PENDING:            'text-amber-800',
  'PENDING APPROVAL': 'text-amber-800',
  overdue:            'text-red-800',
  'PARTIALLY RETURNED': 'text-orange-800',
};

const ALL_TABS = ['PENDING', 'APPROVED', 'ISSUED', 'OVERDUE', 'ARCHIVED'];

function QrCameraScanner({ onResult }) {
  const mountedRef  = useRef(true);
  const scannerRef  = useRef(null);
  const scanLockRef = useRef(false); 

  useEffect(() => {
    mountedRef.current = true;

    const start = async () => {
      if (!mountedRef.current) return;

      let cameras = [];
      try { cameras = await Html5Qrcode.getCameras(); } catch { /* none */ }
      if (!cameras?.length) { toast.error('No camera found'); return; }

      const cam = cameras.find(c => /back|rear|environment/i.test(c.label)) ?? cameras[0];
      const scanner = new Html5Qrcode('qr-reader-adm');
      scannerRef.current = scanner;

      try {
        await scanner.start(
          cam.id,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (text) => { 
            if (mountedRef.current && !scanLockRef.current) {
              scanLockRef.current = true; 
              setTimeout(() => onResult(text), 0); 
              setTimeout(() => { scanLockRef.current = false; }, 1500); 
            } 
          },
          () => {},
        );
      } catch {
        if (mountedRef.current) {
          toast.error('Cannot start camera');
          scannerRef.current = null;
        }
      }
    };

    const tid = setTimeout(start, 300);

    return () => {
      mountedRef.current = false;
      clearTimeout(tid);
      if (scannerRef.current) {
        const sc = scannerRef.current;
        scannerRef.current = null;
        try {
          const state = sc.getState();
          if (state === 2 || state === 3) {
             sc.stop().catch(()=>{}).finally(() => { try { sc.clear(); } catch {} });
          } else {
             sc.clear();
          }
        } catch(e) {}
      }
    };
  }, [onResult]);

  return (
    <div
      id="qr-reader-adm"
      className="w-full rounded-xl border-2 border-primary/20 bg-black/5 min-h-[300px] overflow-hidden"
    />
  );
}

function DeadlineBadge({ req, compact = false }) {
  const urgency = getRequestUrgency(req);
  if (!urgency) return null;

  const now = Date.now();
  let minsLeft = 0;

  if (['pickup_active', 'void'].includes(urgency)) {
    let start = req.pickup_datetime ? toPHTime(req.pickup_datetime).getTime() : toPHTime(req.created_at).getTime();
    const expiresAt = start + 15 * 60_000;
    minsLeft = Math.ceil((expiresAt - now) / 60_000);
  } else {
    minsLeft = Math.ceil((toPHTime(req.return_deadline).getTime() - now) / 60_000);
  }

  if (urgency === 'void') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest bg-red-100 text-red-700 border-red-200">
        <Flame size={9} /> VOID
      </span>
    );
  }
  if (urgency === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest bg-red-100 text-red-700 border-red-200">
        <Flame size={9} /> OVERDUE
      </span>
    );
  }
  if (urgency === 'critical') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest bg-red-50 text-red-600 border-red-200 animate-pulse">
        <AlertCircle size={9} /> {compact ? `${minsLeft}m` : `${minsLeft}m left`}
      </span>
    );
  }
  if (urgency === 'pickup_active') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest bg-orange-50 text-orange-600 border-orange-200 animate-pulse">
        <Timer size={9} /> {compact ? `${minsLeft}m` : `Pickup: ${minsLeft}m`}
      </span>
    );
  }
  if (urgency === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest bg-amber-50 text-amber-700 border-amber-200">
        <Timer size={9} /> {compact ? `${minsLeft}m` : `${minsLeft}m left`}
      </span>
    );
  }

  return null;
}

function ItemRow({ item, inventory, currentList, setFn }) {
  const isFungible = !!item.isQtyMode || !!item.consumable_id;
  const relatedInv = inventory.filter(
    inv => String(inv.inventory_type_id) === String(item.inventory_type_id) && !inv.isQtyMode && !inv.consumable_id
  );
  
  const scannedCount = item.scannedPhysicalItems?.length ?? 0;
  
  const isComplete   =
    item.actualQuantity <= 0 ||
    (isFungible && item.hasBeenScanned) ||
    (!isFungible && item.actualQuantity === scannedCount);

  const adjust = (delta) => {
    const idx = currentList.findIndex(x => x.id === item.id);
    if (idx !== -1) {
      const x = currentList[idx];
      if (delta > 0 && x.actualQuantity + delta > x.maxAvail) {
        setTimeout(() => toast.error(`Only ${x.maxAvail} available in inventory.`), 0);
        return;
      }
      const nextList = [...currentList];
      nextList[idx] = { ...x, actualQuantity: Math.max(0, x.actualQuantity + delta) };
      setFn(nextList);
    }
  };

  const remove = () => setFn(currentList.filter(x => x.id !== item.id));

  const removeScanned = (sId) => {
    const idx = currentList.findIndex(x => x.id === item.id);
    if (idx !== -1) {
      const nextList = [...currentList];
      nextList[idx] = { ...nextList[idx], scannedPhysicalItems: nextList[idx].scannedPhysicalItems.filter(s => s.id !== sId) };
      setFn(nextList);
    }
  };

  return (
    <div className={`p-3.5 rounded-2xl border transition-colors ${isComplete ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-black/10'}`}>
      <div className="flex justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">
            {item.item_name || item.name}
            {item.isNew && <span className="ml-1 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded uppercase">Added</span>}
            {isFungible && <span className="ml-1 text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded uppercase">{item.consumable_id ? 'consumable' : 'qty'}</span>}
          </p>
          {!isFungible && item.actualQuantity > 0 && relatedInv.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {relatedInv.map(inv => {
                const scanned = item.scannedPhysicalItems?.some(s => s.id === inv.id);
                return (
                  <span
                    key={inv.id}
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      scanned ? 'bg-green-100 text-green-700 line-through opacity-60' : 'bg-black/5 text-gray-600'
                    }`}
                  >
                    {inv.barcode}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-start gap-1 bg-black/5 p-1 rounded-xl h-fit flex-shrink-0" role="group" aria-label="Quantity controls">
          <button aria-label="Decrease" onClick={() => adjust(-1)} className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-muted hover:text-primary transition-colors"><Minus size={13} /></button>
          <span className="w-7 text-center text-sm font-bold leading-7">{item.actualQuantity}</span>
          
          {!isFungible && (
             <button aria-label="Increase" onClick={() => adjust(1)}  className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-muted hover:text-primary transition-colors"><Plus size={13} /></button>
          )}
          
          <div className="w-px h-4 bg-black/10 mx-0.5 self-center" />
          <button aria-label="Remove item" onClick={remove} className="w-7 h-7 flex items-center justify-center text-red-400 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13} /></button>
        </div>
      </div>

      {!isFungible && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {item.scannedPhysicalItems?.map(s => (
            <span
              key={s.id}
              className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1"
            >
              <Scan size={9} />{s.barcode}
              <button aria-label={`Remove ${s.barcode}`} onClick={() => removeScanned(s.id)} className="hover:text-red-500 ml-1"><X size={9} /></button>
            </span>
          ))}
          {item.actualQuantity > scannedCount && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded flex items-center gap-1 border border-amber-200">
              <Scan size={9} className="animate-pulse" />
              Scan {item.actualQuantity - scannedCount} more
            </span>
          )}
        </div>
      )}

      {isFungible && !item.hasBeenScanned && item.actualQuantity > 0 && (
         <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded flex items-center gap-1 border border-amber-200">
              <Scan size={9} className="animate-pulse" />
              Scan Barcode to Verify
            </span>
         </div>
      )}

      {isFungible && item.hasBeenScanned && item.actualQuantity > 0 && (
         <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1">
              <CheckCircle2 size={9} /> Verified & Scanned
            </span>
         </div>
      )}
    </div>
  );
}

function buildIssuePayload(items) {
  const payload = [];
  items.forEach(item => {
    if (item.isQtyMode) {
      payload.push({ inventory_type_id: item.inventory_type_id, stock_id: item.stock_id, qty_requested: item.actualQuantity, quantity: item.actualQuantity, assigned_to: 'Requester' });
      return;
    }
    if (item.consumable_id || item.kind === 'consumable') {
      payload.push({ inventory_type_id: item.inventory_type_id, consumable_id: item.consumable_id || item.id, quantity: item.actualQuantity, assigned_to: 'Requester' });
      return;
    }
    if (item.scannedPhysicalItems?.length > 0) {
      item.scannedPhysicalItems.forEach(s =>
        payload.push({ inventory_type_id: item.inventory_type_id, quantity: 1, inventory_item_id: s.id, assigned_to: 'Requester' }),
      );
      return;
    }
    payload.push({ inventory_type_id: item.inventory_type_id, quantity: item.actualQuantity, assigned_to: 'Requester' });
  });
  return payload;
}

export default function AdminRequests() {
  const { user } = useAuth();

  const [requests,     setRequests]     = useState([]);
  const [inventory,    setInventory]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [isRoomLocked, setIsRoomLocked] = useState(false);

  const [viewMode,     setViewMode]     = useState('calendar');
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [expandedRow,  setExpandedRow]  = useState(null);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [activeTab,    setActiveTab]    = useState('PENDING');
  const [selectedDate, setSelectedDate] = useState(null);

  const [notifications, setNotifications] = useState([]);
  const [notifOpen,     setNotifOpen]     = useState(false);
  const notifRef = useRef(null);
  const unreadCount = notifications.filter(n => !n.read).length;

  const [cameraModal,  setCameraModal]  = useState(false);
  const [issueModal,   setIssueModal]   = useState(false);
  const [approveModal, setApproveModal] = useState(false);
  const [manualModal,  setManualModal]  = useState(false);

  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [selectedReq,    setSelectedReq]    = useState(null);
  const [adjustedItems,  setAdjustedItems]  = useState([]);
  const [itemSearch,     setItemSearch]     = useState('');
  const [issueDate,      setIssueDate]      = useState('');
  const [issueTime,      setIssueTime]      = useState('');
  const [timeToOpen,     setTimeToOpen]     = useState(null); 
  const [issuing,        setIssuing]        = useState(false);

  const [approveReq, setApproveReq] = useState(null);

  const [manualForm,      setManualForm]      = useState({
    studentId: '', purpose: 'Walk-in', search: '',
    retDate: getPHTDateStringFromDate(getPHTDateObj()), 
    retTime: '17:00',
  });
  const [manualItems,     setManualItems]     = useState([]);
  const [walkInConflicts, setWalkInConflicts] = useState([]);

  const [borrowerSearch, setBorrowerSearch] = useState('');
  const [borrowerResults, setBorrowerResults] = useState([]);
  const [isSearchingBorrower, setIsSearchingBorrower] = useState(false);
  const [showBorrowerDropdown, setShowBorrowerDropdown] = useState(false);
  const borrowerDropdownRef = useRef(null);
  const skipBorrowerSearch = useRef(false);

  const barcodeBufferRef = useRef('');
  const issueModalOpenRef  = useRef(false);
  const manualModalOpenRef = useRef(false);
  const invRef             = useRef([]);            
  const roomIdRef          = useRef(user?.room_id);
  const isProcessingQR     = useRef(false);
  const adjustedItemsRef   = useRef(adjustedItems);
  const manualItemsRef     = useRef(manualItems);

  useEffect(() => { adjustedItemsRef.current = adjustedItems; }, [adjustedItems]);
  useEffect(() => { manualItemsRef.current = manualItems; }, [manualItems]);

  useEffect(() => { issueModalOpenRef.current  = issueModal;  }, [issueModal]);
  useEffect(() => { manualModalOpenRef.current = manualModal; }, [manualModal]);
  useEffect(() => { roomIdRef.current = user?.room_id; },        [user?.room_id]);

  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (borrowerDropdownRef.current && !borrowerDropdownRef.current.contains(e.target)) {
        setShowBorrowerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (skipBorrowerSearch.current) {
      skipBorrowerSearch.current = false;
      return;
    }

    if (borrowerSearch.trim().length < 2) {
      setBorrowerResults([]);
      setShowBorrowerDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingBorrower(true);
      try {
        const { data } = await api.get('/admin/students/search', { params: { q: borrowerSearch } });
        setBorrowerResults(data.data || data || []);
        setShowBorrowerDropdown(true);
      } catch (err) {
        console.error("Borrower search failed", err);
      } finally {
        setIsSearchingBorrower(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [borrowerSearch]);

  useEffect(() => { setExpandedRow(null); }, [activeTab]);

  useEffect(() => {
    if (!issueModal || !selectedReq) return;
    const isReservation = !!(selectedReq.pickup_start || selectedReq.pickup_datetime);
    if (!isReservation) { setTimeToOpen(null); return; }

    const startMs = toPHTime(selectedReq.pickup_start || selectedReq.pickup_datetime).getTime();

    const tick = () => {
      const diff = startMs - Date.now();
      if (diff <= 0) { setTimeToOpen(null); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setTimeToOpen(`Opens in ${h}h ${m}m`);
    };

    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [issueModal, selectedReq]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const roomParam = user?.room_id ? { room_id: user.room_id } : {};
      const [rmsRes, reqRes, invRes] = await Promise.all([
        api.get('/admin/rooms').catch(() => ({ data: { data: [] } })),
        listRequests(roomParam),
        listInventory(roomParam),
      ]);

      const rooms   = rmsRes.data?.data || rmsRes.data || [];
      const myRoom  = rooms.find(r => String(r.id) === String(user?.room_id));
      if (myRoom) setIsRoomLocked(!myRoom.is_available);

      let fetchedReqs = reqRes.data?.data ?? reqRes.data ?? [];
      if (user?.room_id) {
        fetchedReqs = fetchedReqs.filter(
          r => String(r.room_id) === String(user.room_id) || !r.room_id,
        );
      }
      setRequests(fetchedReqs.map(r => ({ ...r, isExpired: isExpiredRow(r) })));

      const invData = invRes.data?.data || {};
      
      const combined = [
        ...(invData.items ?? [])
          .filter(i => ['available', 'reserved'].includes(i.status))
          .map(i => ({ ...i, kind: 'borrowable', maxAvail: 1 })),
        ...(invData.consumables ?? [])
          .map(i => ({ ...i, kind: 'consumable', maxAvail: parseInt(i.quantity_available || 0) })),
        ...(invData.quantityItems ?? [])
          .map(i => ({ ...i, kind: 'quantity', maxAvail: parseInt(i.qty_available || 0) })),
      ];
      setInventory(combined);
      invRef.current = combined;
    } catch {
      setTimeout(() => toast.error('Failed to load data'), 0);
    } finally {
      setLoading(false);
    }
  }, [user?.room_id]);

  useEffect(() => { load(); }, [load]);

  // ⚡ FIX: Added 100ms delay to disconnect to prevent React Strict Mode console errors
  useEffect(() => {
    const socket = io(SOCKET_URL);

    const cooldownRef = { current: false };
    const debouncedLoad = () => {
      if (cooldownRef.current) return;
      cooldownRef.current = true;
      load(true);
      setTimeout(() => { cooldownRef.current = false; }, 5_000);
    };

    const belongsToMyRoom = (payload) => {
      if (!roomIdRef.current) return true;
      const target = payload?.room_id || payload?.roomId;
      return !!target && String(target) === String(roomIdRef.current);
    };

    socket.on('inventory-updated', (p) => { if (belongsToMyRoom(p)) debouncedLoad(); });
    socket.on('request-issued',    (p) => { if (belongsToMyRoom(p)) debouncedLoad(); });
    socket.on('new-request', (p) => {
      if (!belongsToMyRoom(p)) return;
      toast.success(`New request #${p.id} submitted!`, { icon: '🔔', duration: 6_000, id: `new-req-${p.id}` });
      debouncedLoad();
    });
    socket.on('deadline-warning', (p) => {
      if (!belongsToMyRoom(p)) return;
      setNotifications(prev => [{ id: Date.now(), ...p, read: false, ts: new Date() }, ...prev.slice(0, 49)]);
      if (['overdue', 'critical'].includes(p.level)) {
        toast.error(p.message, { id: `dl-${p.requestId}`, duration: 8_000 });
      } else {
        toast(p.message, { id: `dl-${p.requestId}`, duration: 6_000, icon: '⏰' });
      }
    });

    return () => {
      setTimeout(() => socket.disconnect(), 100);
    };
  }, [load]);

  useEffect(() => {
    const voidedIds = new Set(); 

    const tick = async () => {
      const toVoid = requests.filter(r => {
        if (voidedIds.has(r.id)) return false;         
        if (r.isExpired) return false;                 
        return isExpiredRow(r);                        
      });

      if (toVoid.length === 0) return;

      setRequests(prev =>
        prev.map(r =>
          toVoid.some(v => v.id === r.id) ? { ...r, isExpired: true } : r,
        ),
      );

      for (const r of toVoid) {
        voidedIds.add(r.id);
        try { await rejectRequest(r.id); } catch { /* best-effort */ }
      }

      load(true);
    };

    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [requests, load]); 

  const requestCountByDate = useMemo(() => {
    const map = {};
    requests.forEach(r => {
      const actionable =
        (['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired) ||
        (r.status === 'APPROVED' && !r.isExpired) ||
        ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status);
      if (!actionable) return;
      const d = getRequestRelevantDate(r);
      if (d) map[d] = (map[d] || 0) + 1;
    });
    return map;
  }, [requests]);

  const counts = useMemo(() => {
    const inDate = (r) => !selectedDate || getRequestRelevantDate(r) === selectedDate;
    return {
      PENDING:  requests.filter(r => ['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired && inDate(r)).length,
      APPROVED: requests.filter(r => r.status === 'APPROVED' && !r.isExpired && inDate(r)).length,
      ISSUED:   requests.filter(r => ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status) && inDate(r)).length,
      OVERDUE:  requests.filter(r => ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status) && getRequestUrgency(r) === 'overdue' && inDate(r)).length,
      ARCHIVED: requests.filter(r => (['REJECTED', 'RETURNED', 'CANCELLED'].includes(r.status) || r.isExpired) && inDate(r)).length,
    };
  }, [requests, selectedDate]);

  const visibleRequests = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return requests.filter(r => {
      if (q &&
        !String(r.id).includes(q) &&
        !String(r.requester_name).toLowerCase().includes(q) &&
        !String(r.student_id).toLowerCase().includes(q)
      ) return false;

      switch (activeTab) {
        case 'PENDING':  if (!(['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired)) return false; break;
        case 'APPROVED': if (!(r.status === 'APPROVED' && !r.isExpired)) return false; break;
        case 'ISSUED':   if (!['ISSUED', 'PARTIALLY RETURNED'].includes(r.status)) return false; break;
        case 'OVERDUE':  if (!(['ISSUED', 'PARTIALLY RETURNED'].includes(r.status) && getRequestUrgency(r) === 'overdue')) return false; break;
        case 'ARCHIVED': if (!(['REJECTED', 'RETURNED', 'CANCELLED'].includes(r.status) || r.isExpired)) return false; break;
        default: break;
      }

      if (selectedDate && getRequestRelevantDate(r) !== selectedDate) return false;

      return true;
    });
  }, [requests, activeTab, searchQuery, selectedDate]);

  const overdueQueue = useMemo(() =>
    requests.filter(r =>
      ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status) &&
      getRequestUrgency(r) === 'overdue',
    ), [requests]);

  const pendingQueue = useMemo(() =>
    requests.filter(r =>
      ['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired,
    ), [requests]);

  const isReadyToIssue = useMemo(() => {
    if (!issueDate || !issueTime) return false;
    if (!adjustedItems || adjustedItems.length === 0) return false;
    
    return adjustedItems.every(i => {
      const needed = Number(i.actualQuantity || 0);
      if (needed <= 0) return true;
      if (i.isQtyMode || !!i.consumable_id) return !!i.hasBeenScanned;
      
      const scanned = Number(i.scannedPhysicalItems?.length || 0);
      return needed === scanned;
    });
  }, [issueDate, issueTime, adjustedItems]);

  const isManualReady = useMemo(() => {
    if (!manualForm.retDate || !manualForm.retTime) return false;
    if (!manualForm.studentId || String(manualForm.studentId).trim() === '') return false;
    if (!manualItems || manualItems.length === 0) return false;
    
    return manualItems.every(i => {
      const needed = Number(i.actualQuantity || 0);
      if (needed <= 0) return true;
      if (i.isQtyMode || !!i.consumable_id) return !!i.hasBeenScanned;
      
      const scanned = Number(i.scannedPhysicalItems?.length || 0);
      return needed === scanned;
    });
  }, [manualForm.retDate, manualForm.retTime, manualForm.studentId, manualItems]);

  const handleCalendarDateSelect = useCallback((dateStr) => {
    if (!dateStr) { setSelectedDate(null); return; }
    setSelectedDate(prev => prev === dateStr ? null : dateStr);
  }, []);

  const clearDateFilter = useCallback(() => setSelectedDate(null), []);

  const handleApproveClick = useCallback((req, e) => {
    e?.stopPropagation();
    if (isRoomLocked) return;
    if (req.pickup_datetime || req.pickup_start) {
      setApproveReq(req);
      setApproveModal(true);
    } else {
      handleApproveSubmit(req.id, req.requester_email);
    }
  }, [isRoomLocked]);

  const handleApproveSubmit = useCallback(async (id, email = null) => {
    try {
      toast.loading('Approving…', { id: 'act' });
      await approveRequest(id, email ? { email } : {});
      toast.success('Approved!', { id: 'act' });
      setApproveModal(false);
      load(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Approval failed', { id: 'act' });
    }
  }, [load]);

  const handleRejectClick = useCallback((req, e) => {
    e?.stopPropagation();
    if (isRoomLocked) return;
    setApproveReq(req);
    setRejectReason('');
    setRejectModal(true);
  }, [isRoomLocked]);

  const handleRejectSubmit = useCallback(async (id, email) => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a reason for denial.');
      return;
    }
    try {
      toast.loading('Denying…', { id: 'act' });
      await rejectRequest(id, { email, reason: rejectReason });
      toast.success('Request denied.', { id: 'act' });
      setRejectModal(false);
      load(true);
    } catch {
      toast.error('Failed to deny request', { id: 'act' });
    }
  }, [isRoomLocked, load, rejectReason]);

  const openIssueModal = useCallback(async (req) => {
    if (isRoomLocked) return;

    if (isExpiredRow(req)) {
      setTimeout(() => toast.error('Request VOID: the pickup window has passed.', { duration: 5_000, icon: '🛑' }), 0);
      try { await rejectRequest(req.id); load(true); } catch { /* already handled */ }
      return;
    }

    setSelectedReq(req);

    if (req.return_deadline) {
      setIssueDate(getPHTDateString(req.return_deadline));
      setIssueTime(getPHTTimeString(req.return_deadline));
    } else if (req.pickup_end) {
      setIssueDate(getPHTDateString(req.pickup_end));
      setIssueTime('17:00');
    } else {
      const d = getPHTDateObj();
      setIssueDate(getPHTDateStringFromDate(d));
      setIssueTime('22:00');
    }

    setAdjustedItems(
      (req.items || []).map((item, idx) => {
        const isQtyMode = !!item.stock_id;
        let assignedTo = item.assigned_to || 'Requester';
        if (['Shared Group', 'Shared'].includes(assignedTo)) assignedTo = 'Requester';
        
        const invMatch = invRef.current.find(i => 
          (isQtyMode && String(i.id) === String(item.stock_id)) ||
          (item.consumable_id && String(i.id) === String(item.consumable_id))
        );

        return {
          ...item,
          id: item.id || `tmp-${idx}`,
          actualQuantity: isQtyMode ? (item.qty_requested || item.quantity || 1) : (item.quantity || 1),
          assignTo: assignedTo,
          scannedPhysicalItems: [],
          isQtyMode,
          kind: item.consumable_id ? 'consumable' : isQtyMode ? 'quantity' : 'borrowable',
          maxAvail: invMatch ? invMatch.maxAvail : 999,
          hasBeenScanned: false 
        };
      }),
    );

    setIssueModal(true);
  }, [isRoomLocked, load]);

  const handleQR = useCallback(async (code) => {
    if (isProcessingQR.current) return;
    isProcessingQR.current = true;
    
    setCameraModal(false); 
    
    try {
      toast.loading('Locating request…', { id: 'qr' });
      const { data } = await getRequestByQR(code);
      const req = data.data ?? data;

      if (isExpiredRow(req)) {
        toast.error('Request VOID: the pickup window has passed.', { id: 'qr', duration: 5_000, icon: '🛑' });
        try { await rejectRequest(req.id); load(true); } catch { /* */ }
        return;
      }

      if (user?.room_id && req.room_id && String(req.room_id) !== String(user.room_id)) {
        toast.error(
          `This request belongs to a different room (${req.room_code || req.room_id}).`,
          { id: 'qr', duration: 5_000 },
        );
        return;
      }

      setSelectedDate(null);
      setViewMode('list');

      let targetTab = 'ARCHIVED';
      if (!isExpiredRow(req)) {
        if (['PENDING', 'PENDING APPROVAL'].includes(req.status)) targetTab = 'PENDING';
        else if (req.status === 'APPROVED')                       targetTab = 'APPROVED';
        else if (['ISSUED', 'PARTIALLY RETURNED'].includes(req.status)) targetTab = 'ISSUED';
      }
      setActiveTab(targetTab);
      setSearchQuery(String(req.id));
      setExpandedRow(req.id);

      setTimeout(() => {
        if (req.status === 'APPROVED') {
          toast.success('Request found — ready to issue.', { id: 'qr' });
          openIssueModal(req);
        } else if (['PENDING', 'PENDING APPROVAL'].includes(req.status)) {
          toast.success('Request found — please review.', { id: 'qr', duration: 4_000 });
          handleApproveClick(req);
        } else {
          toast.success(`Request #${req.id} — ${req.status}`, { id: 'qr' });
        }
      }, 400); 

    } catch (e) {
      toast.error(e?.response?.data?.message || 'Invalid QR code', { id: 'qr' });
    } finally {
      setTimeout(() => { isProcessingQR.current = false; }, 1000);
    }
  }, [load, user?.room_id, openIssueModal, handleApproveClick]);

  const handleScan = useCallback((barcode) => {
    const norm = (b) => String(b ?? '').trim().replace(/^0+(\d)/, '$1');
    const inv  = invRef.current.find(i => norm(i.barcode) === norm(barcode));

    if (!inv) { setTimeout(() => toast.error(`Barcode "${barcode}" not found in inventory.`), 0); return; }
    
    if (manualModalOpenRef.current && inv.status && inv.status !== 'available' && inv.kind === 'borrowable') {
      setTimeout(() => toast.error(`Barcode "${barcode}" is currently ${inv.status.toUpperCase()}. Walk-ins require 'available' items.`), 0);
      return;
    }

    const isFungible = inv.kind === 'quantity' || inv.kind === 'consumable';
    
    const currentList = issueModalOpenRef.current ? adjustedItemsRef.current : manualItemsRef.current;
    const setFn = issueModalOpenRef.current ? setAdjustedItems : setManualItems;
    
    const existingIdx = currentList.findIndex(it => 
      (inv.kind === 'quantity' && String(it.stock_id) === String(inv.id)) ||
      (inv.kind === 'consumable' && String(it.consumable_id) === String(inv.id)) ||
      (it.isQtyMode && String(it.inventory_type_id) === String(inv.inventory_type_id))
    );

    if (isFungible) {
      if (existingIdx >= 0) {
        const it = currentList[existingIdx];
        if (!it.hasBeenScanned) {
          setTimeout(() => toast.success(`${inv.name} verified.`), 0);
          const newList = [...currentList];
          newList[existingIdx] = { ...it, hasBeenScanned: true };
          setFn(newList);
        } else {
          if (it.actualQuantity + 1 > inv.maxAvail) {
             setTimeout(() => toast.error(`Only ${inv.maxAvail} available in inventory.`), 0);
          } else {
             setTimeout(() => toast.success(`Increased ${inv.name} quantity to ${it.actualQuantity + 1}.`), 0);
             const newList = [...currentList];
             newList[existingIdx] = { ...it, actualQuantity: it.actualQuantity + 1 };
             setFn(newList);
          }
        }
      } else {
        if (inv.maxAvail < 1) {
           setTimeout(() => toast.error(`Out of stock.`), 0);
        } else {
           setTimeout(() => toast.success(`Added: ${inv.name}`), 0);
           setFn([
             ...currentList,
             {
               id: `new-${Date.now()}`,
               item_name: inv.name,
               inventory_type_id: inv.inventory_type_id,
               stock_id: inv.kind === 'quantity' ? inv.id : null,
               consumable_id: inv.kind === 'consumable' ? inv.id : null,
               quantity: 1,
               actualQuantity: 1,
               isNew: true,
               assignTo: 'Requester',
               scannedPhysicalItems: [],
               isQtyMode: inv.kind === 'quantity',
               kind: inv.kind,
               maxAvail: inv.maxAvail,
               hasBeenScanned: true 
             },
           ]);
        }
      }
    } else {
      if (currentList.some(it => it.scannedPhysicalItems?.some(s => s.id === inv.id))) {
        setTimeout(() => toast.error('Already scanned!'), 0);
      } else {
        const idx = currentList.findIndex(it => !it.isQtyMode && !it.consumable_id && String(it.inventory_type_id) === String(inv.inventory_type_id) && (it.scannedPhysicalItems?.length ?? 0) < it.actualQuantity);
        if (idx >= 0) {
           setTimeout(() => toast.success(`Matched: ${inv.barcode}`), 0);
           const newList = [...currentList];
           newList[idx] = { ...newList[idx], scannedPhysicalItems: [...(newList[idx].scannedPhysicalItems ?? []), inv] };
           setFn(newList);
        } else {
           if (inv.kind === 'consumable') setTimeout(() => toast.success(`${inv.name} verified.`), 0);
           else setTimeout(() => toast.success(`Added: ${inv.name}`), 0);
           setFn([
             ...currentList,
             {
               id: `new-${Date.now()}`,
               item_name: inv.name,
               inventory_type_id: inv.inventory_type_id,
               quantity: 1,
               actualQuantity: 1,
               isNew: true,
               assignTo: 'Requester',
               scannedPhysicalItems: [inv],
               isQtyMode: false,
             },
           ]);
        }
      }
    }
  }, []);

  useEffect(() => {
    let lastKeyTime = Date.now();
    const onKey = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;

      const now = Date.now();
      if (now - lastKeyTime > 50) barcodeBufferRef.current = '';
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length > 2) {
          e.preventDefault();
          e.stopPropagation();
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          
          const code = barcodeBufferRef.current.trim();
          barcodeBufferRef.current = '';
          
          if (issueModalOpenRef.current || manualModalOpenRef.current) {
            handleScan(code);
          } else if (!isRoomLocked) {
            handleQR(code);
          }
        } else {
          barcodeBufferRef.current = '';
        }
        return;
      }
      if (e.key.length === 1) barcodeBufferRef.current += e.key;
    };

    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [isRoomLocked, handleQR, handleScan]);

  const handleIssue = async () => {
    if (!selectedReq) return;
    if (!issueDate || !issueTime) {
      toast.error('Please set a return deadline before issuing.');
      return;
    }

    const deadlinePHT  = `${issueDate}T${issueTime}:00+08:00`;
    const deadlineDate = new Date(deadlinePHT);
    if (deadlineDate <= new Date()) {
      toast.error('Return deadline must be in the future.');
      return;
    }

    setIssuing(true);
    try {
      const payload = [];
      adjustedItems.forEach(item => {
        if (item.actualQuantity <= 0) { payload.push({ id: item.id, quantity: 0 }); return; }
        if (item.isQtyMode) {
          payload.push({ id: item.isNew ? null : item.id, inventory_type_id: item.inventory_type_id, stock_id: item.stock_id, qty_requested: item.actualQuantity, quantity: item.actualQuantity, assigned_to: item.assignTo });
          return;
        }
        if (!item.consumable_id) {
          (item.scannedPhysicalItems || []).forEach(s =>
            payload.push({ id: (item.isNew || String(item.id).startsWith('split-')) ? null : item.id, inventory_type_id: item.inventory_type_id, quantity: 1, inventory_item_id: s.id, assigned_to: item.assignTo }),
          );
          return;
        }
        payload.push({ id: item.isNew ? null : item.id, inventory_type_id: item.inventory_type_id, consumable_id: item.consumable_id, quantity: item.actualQuantity, assigned_to: item.assignTo });
      });

      await issueRequest(selectedReq.id, { items: payload, return_deadline: deadlinePHT });
      toast.success('Items successfully issued!');
      setIssueModal(false);
      load(true);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Issuance failed');
    } finally {
      setIssuing(false);
    }
  };

  // ⚡ FIX: Smart Bulk Quantity Check for Walk in conflicts
  const checkWalkInConflicts = useCallback(async (items, retDate, retTime) => {
    if (!retDate || !retTime || items.length === 0) return [];
    try {
      const { data } = await api.get('/requests/calendar', { params: { room_id: user?.room_id } });
      const events = data?.data || [];
      const now    = new Date();
      const retEnd = new Date(`${retDate}T${retTime}:00+08:00`);

      const conflicts = [];
      items.forEach(item => {
        const physIds = (item.scannedPhysicalItems || []).map(s => s.id);
        const isFungible = item.isQtyMode || !!item.consumable_id || item.kind === 'consumable';
        
        let conflictingEvents = [];

        events.forEach(ev => {
          if (!['APPROVED', 'PENDING', 'PENDING APPROVAL'].includes(ev.status?.toUpperCase())) return;
          const evStart = toPHTime(ev.pickup_datetime || ev.pickup_start);
          const evEnd   = ev.return_deadline
            ? toPHTime(ev.return_deadline)
            : new Date(evStart.getTime() + 3_600_000);

          if (now >= evEnd || retEnd <= evStart) return;

          let qtyInEv = 0;
          const hasMatch = (ev.items || []).some(evItem => {
            if (item.isQtyMode && evItem.stock_id && String(evItem.stock_id) === String(item.stock_id || item.id)) {
              qtyInEv = evItem.quantity || evItem.qty_requested || 1;
              return true;
            }
            if (item.kind === 'consumable' && String(evItem.consumable_id) === String(item.consumable_id || item.id)) {
              qtyInEv = evItem.quantity || evItem.qty_requested || 1;
              return true;
            }
            if (!isFungible) {
              if (physIds.length > 0 && physIds.includes(evItem.inventory_item_id)) return true;
              if (physIds.length === 0 && String(evItem.inventory_type_id) === String(item.inventory_type_id)) return true;
            }
            return false;
          });

          if (hasMatch) {
            conflictingEvents.push({ ev, evStart, evEnd, qtyInEv });
          }
        });

        // ⚡ If it's a quantity item, mathematically check if we have enough to fulfill both
        if (isFungible && conflictingEvents.length > 0) {
          const currentAvailable = item.maxAvail || 0;
          const walkInQty = item.actualQuantity || 1;
          let hasDefiniteConflict = false;

          for (const ce of conflictingEvents) {
            let simultaneousQty = 0;
            for (const other of conflictingEvents) {
              if (ce.evStart < other.evEnd && ce.evEnd > other.evStart) {
                simultaneousQty += other.qtyInEv;
              }
            }
            // Deficit exists if current stock minus walk-in demand cannot fulfill the reservations
            if (currentAvailable - walkInQty < simultaneousQty) {
              hasDefiniteConflict = true;
              break;
            }
          }

          if (hasDefiniteConflict) {
            conflictingEvents.forEach(ce => {
              conflicts.push({
                itemName:  item.item_name || item.name,
                requestId: ce.ev.id,
                requester: ce.ev.requester_name || ce.ev.student_id || `#${ce.ev.id}`,
                pickupAt:  fmtTime(ce.evStart),
                returnAt:  fmtTime(ce.evEnd),
              });
            });
          }
        } else if (!isFungible && conflictingEvents.length > 0) {
          conflictingEvents.forEach(ce => {
            conflicts.push({
              itemName:  item.item_name || item.name,
              requestId: ce.ev.id,
              requester: ce.ev.requester_name || ce.ev.student_id || `#${ce.ev.id}`,
              pickupAt:  fmtTime(ce.evStart),
              returnAt:  fmtTime(ce.evEnd),
            });
          });
        }
      });

      const uniqueConflicts = [];
      const seen = new Set();
      conflicts.forEach(c => {
          const k = `${c.requestId}-${c.itemName}`;
          if (!seen.has(k)) {
              seen.add(k);
              uniqueConflicts.push(c);
          }
      });

      return uniqueConflicts;
    } catch { return []; }
  }, [user?.room_id]);

  const processWalkIn = useCallback(async (skipConflicts = false) => {
    if (!manualForm.retDate || !manualForm.retTime) {
      toast.error('Please set a return deadline.'); return;
    }

    const retDeadlinePHT  = `${manualForm.retDate}T${manualForm.retTime}:00+08:00`;
    const retDeadlineDate = new Date(retDeadlinePHT);
    if (retDeadlineDate <= new Date()) {
      toast.error('Return deadline must be in the future.'); return;
    }

    if (!skipConflicts) {
      setIssuing(true);
      const conflicts = await checkWalkInConflicts(manualItems, manualForm.retDate, manualForm.retTime);
      if (conflicts.length > 0) {
        setWalkInConflicts(conflicts);
        setIssuing(false);
        toast.error(`${conflicts.length} item(s) have upcoming reservations — review below.`, { duration: 6_000 });
        return;
      }
    }

    setIssuing(true);
    const createPayload = [];
    manualItems.forEach(c => {
      if (c.isQtyMode) {
        createPayload.push({ inventory_type_id: c.inventory_type_id, stock_id: c.stock_id, qty_requested: c.actualQuantity, assigned_to: 'Requester' });
      } else if (c.consumable_id || c.kind === 'consumable') {
        createPayload.push({ inventory_type_id: c.inventory_type_id, consumable_id: c.consumable_id || c.id, quantity: c.actualQuantity, assigned_to: 'Requester' });
      } else if (c.scannedPhysicalItems?.length > 0) {
        c.scannedPhysicalItems.forEach(s => 
          createPayload.push({ inventory_type_id: c.inventory_type_id, quantity: 1, inventory_item_id: s.id, assigned_to: 'Requester' })
        );
      } else {
        createPayload.push({ inventory_type_id: c.inventory_type_id, quantity: c.actualQuantity, assigned_to: 'Requester' });
      }
    });

    let newRequestId = null;
    let newRequestItems = [];

    try {
      const cr = await createRequest({
        room_id: user?.room_id, purpose: manualForm.purpose,
        borrower_id: manualForm.studentId, items: createPayload,
      });
      newRequestId = cr.data.data?.id || cr.data?.id;
      newRequestItems = cr.data.data?.items || cr.data?.items || [];
      if (!newRequestId) throw new Error('No request ID returned.');
    } catch (e) {
      toast.error(`Create failed: ${e?.response?.data?.message || e.message}`);
      setIssuing(false); return;
    }

    try { await approveRequest(newRequestId); }
    catch { toast.error('Auto-approve failed — request created but not approved.'); setIssuing(false); load(true); return; }

    try {
      const issuePayload = buildIssuePayload(manualItems);
      
      issuePayload.forEach(p => {
        const match = newRequestItems.find(nri => 
          String(nri.inventory_type_id) === String(p.inventory_type_id) &&
          (p.inventory_item_id ? String(nri.inventory_item_id) === String(p.inventory_item_id) : true) &&
          (p.stock_id ? String(nri.stock_id) === String(p.stock_id) : true) &&
          (p.consumable_id ? String(nri.consumable_id) === String(p.consumable_id) : true)
        );
        if (match) {
          p.id = match.id;
          newRequestItems = newRequestItems.filter(nri => nri.id !== match.id);
        }
      });

      await issueRequest(newRequestId, { items: issuePayload, return_deadline: retDeadlinePHT });
    } catch { toast.error('Issue step failed.'); setIssuing(false); load(true); return; }

    toast.success(skipConflicts ? 'Walk-in processed (conflict overridden).' : 'Walk-in fully processed!');
    setManualModal(false);
    setWalkInConflicts([]);
    setManualForm({ studentId: '', purpose: 'Walk-in', search: '', retDate: getPHTDateStringFromDate(getPHTDateObj()), retTime: '17:00' });
    setManualItems([]);
    setBorrowerSearch('');
    setIssuing(false);
    load(true);
  }, [manualForm, manualItems, checkWalkInConflicts, load, user?.room_id]);

  const addToModal = useCallback((inv, setFn, currentList) => {
    const existing = currentList.find(p => String(p.inventory_type_id) === String(inv.inventory_type_id));
    if (existing) {
      setTimeout(() => toast.error('Item already in list. Scan barcode to increase quantity or verify.'), 0);
      return;
    }
    const isQtyMode = inv.kind === 'quantity' || !!inv.stock_id;
    setFn([
      ...currentList,
      {
        id: `new-${Date.now()}`,
        item_name: inv.name,
        inventory_type_id: inv.inventory_type_id,
        stock_id: inv.kind === 'quantity' ? inv.id : null,
        consumable_id: inv.kind === 'consumable' ? inv.id : null,
        quantity: 1,
        actualQuantity: 1,
        isNew: true,
        assignTo: 'Requester',
        scannedPhysicalItems: [],
        isQtyMode,
        kind: inv.kind,
        maxAvail: inv.maxAvail,
        hasBeenScanned: false
      },
    ]);
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-gray-50/40 relative">

      {viewMode === 'list' && (
        <aside
          className={`flex-shrink-0 bg-white border-r border-black/8 flex flex-col shadow-sm z-20 transition-all duration-300 ${sidebarOpen ? 'w-72' : 'w-72 -ml-72'}`}
          aria-label="Action queue"
        >
          <div className="p-4 border-b border-black/8 space-y-2.5 bg-gray-50/50">
            <button
              onClick={(e) => { e.currentTarget.blur(); setCameraModal(true); }}
              disabled={isRoomLocked}
              className="w-full flex items-center justify-center gap-2 text-sm font-black py-4 px-4 bg-primary text-white rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 active:translate-y-0 disabled:opacity-40 transition-all hover:-translate-y-0.5"
            >
              {isRoomLocked ? <Lock size={18} /> : <Camera size={18} />}
              Scan Request QR
            </button>
            <button
              onClick={(e) => { e.currentTarget.blur(); setManualModal(true); setWalkInConflicts([]); }}
              disabled={isRoomLocked}
              className="w-full flex items-center justify-center gap-2 text-sm font-black py-3 px-4 bg-white border-2 border-amber-400 text-amber-600 rounded-xl hover:bg-amber-50 disabled:opacity-40 transition-all hover:-translate-y-0.5"
            >
              <Zap size={16} /> Walk-in / Direct Issue
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-gray-50/30 custom-scrollbar">
            <div className="sticky top-0 bg-gray-100/90 backdrop-blur-sm border-b border-black/5 px-4 py-2 flex items-center justify-between z-10">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Needs Action</span>
              <span className="text-[10px] font-black bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                {overdueQueue.length + pendingQueue.length}
              </span>
            </div>

            <div className="p-3 space-y-2">
              {overdueQueue.length === 0 && pendingQueue.length === 0 && (
                <div className="py-10 text-center text-gray-400">
                  <CheckCircle2 size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-bold">Queue is clear</p>
                  <p className="text-[10px] mt-1">All caught up!</p>
                </div>
              )}

              {overdueQueue.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setActiveTab('OVERDUE'); setSelectedDate(null); setSearchQuery(String(r.id)); setExpandedRow(r.id); }}
                  className="w-full text-left bg-red-50 border border-red-200 rounded-xl p-3 hover:border-red-400 transition-colors shadow-sm"
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-xs font-black text-red-800">#{r.id}</span>
                    <span className="text-[9px] font-black bg-red-100 text-red-700 px-1.5 py-0.5 rounded flex items-center gap-1"><Flame size={10} /> OVERDUE</span>
                  </div>
                  <p className="text-xs font-bold text-gray-800 truncate">{r.requester_name || r.student_id}</p>
                  <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1"><Timer size={10} /> Due {fmtTime(r.return_deadline)}</p>
                </button>
              ))}

              {pendingQueue.map(r => (
                <div
                  key={r.id}
                  className="bg-white border border-amber-200 rounded-xl p-3 shadow-sm relative overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400" />
                  <button
                    onClick={() => { setActiveTab('PENDING'); setSelectedDate(null); setSearchQuery(String(r.id)); setExpandedRow(r.id); }}
                    className="w-full text-left pl-2"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-xs font-black text-gray-800">#{r.id}</span>
                      <span className="text-[9px] font-bold text-amber-600">{fmtTime(r.created_at)}</span>
                    </div>
                    <p className="text-xs font-bold text-gray-800 truncate">{r.requester_name || r.student_id}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{r.items?.length ?? 0} items requested</p>
                  </button>
                  <div className="flex gap-1.5 mt-2 pl-2">
                    <button disabled={isRoomLocked} onClick={e => handleApproveClick(r, e)} className="flex-1 text-[10px] font-bold py-1.5 rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-40 transition-colors">Approve</button>
                    <button disabled={isRoomLocked} onClick={e => handleRejectClick(r, e)}  className="flex-1 text-[10px] font-bold py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-40 transition-colors">Deny</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 relative z-10 bg-gray-50/40">

        <div className="bg-white border-b border-black/8 px-4 md:px-6 py-3 flex items-center gap-3 flex-shrink-0 shadow-sm z-20">
          {viewMode === 'list' && (
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="p-2 hover:bg-black/5 rounded-xl text-gray-500 transition-colors"
              aria-label="Toggle sidebar"
            >
              <Menu size={20} />
            </button>
          )}

          <h1 className="text-lg font-black text-primary leading-none hidden sm:block flex-shrink-0">
            Request Management
          </h1>

          <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />

          <div className="flex bg-gray-100 p-1 rounded-xl flex-shrink-0 border border-black/5" role="group" aria-label="View mode">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === 'list' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <ListTodo size={14} /> List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === 'calendar' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <CalendarDays size={14} /> Calendar
            </button>
          </div>

          <div className="flex-1" />

          <button onClick={() => load(false)} className="p-2 hover:bg-black/5 rounded-xl transition-colors text-muted flex-shrink-0" aria-label="Refresh">
            <RefreshCw size={16} />
          </button>

          <div className="relative flex-shrink-0" ref={notifRef}>
            <button
              onClick={() => {
                setNotifOpen(o => {
                  if (!o) setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                  return !o;
                });
              }}
              className="relative p-2 hover:bg-black/5 rounded-xl transition-colors"
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            >
              {unreadCount > 0 ? <BellRing size={18} className="text-amber-500" /> : <Bell size={18} className="text-muted" />}
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] font-black flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-black/10 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/5 bg-gray-50/60">
                  <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Deadline Alerts</span>
                  <button onClick={() => setNotifications([])} className="text-[10px] font-bold text-muted hover:text-red-500">Clear all</button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-10 text-center">
                      <Bell size={24} className="mx-auto mb-2 text-gray-200" />
                      <p className="text-xs text-muted">No alerts</p>
                    </div>
                  ) : notifications.map(n => (
                    <div key={n.id} className={`px-4 py-3 border-b border-black/5 ${n.level === 'overdue' ? 'bg-red-50' : n.level === 'critical' ? 'bg-orange-50' : 'bg-amber-50/60'}`}>
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 ${n.level === 'overdue' ? 'text-red-500' : 'text-amber-500'}`}>
                          {n.level === 'overdue' ? <Flame size={13} /> : <Timer size={13} />}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-gray-800 leading-snug">{n.message}</p>
                          <p className="text-[10px] text-muted mt-0.5">{fmtTime(n.ts)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {isRoomLocked && (
          <div className="bg-red-50 border-b border-red-200/60 px-6 py-2 flex items-center gap-2 flex-shrink-0 z-10" role="alert">
            <Lock size={12} className="text-red-600" />
            <span className="text-xs font-bold text-red-800">Room is locked — all actions are disabled.</span>
          </div>
        )}

        {viewMode === 'list' ? (
          <div className="flex-1 overflow-y-auto flex flex-col custom-scrollbar">

            <div className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-black/8 px-4 md:px-6 py-3 space-y-3 z-10">
              <NeumorphInput
                icon={<Search size={14} />}
                placeholder="Search by ID, name, or student number…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full"
                aria-label="Search requests"
              />

              <div className="flex gap-2 overflow-x-auto hide-scrollbar" role="tablist">
                {ALL_TABS.map(tab => {
                  const count = counts[tab] ?? 0;
                  const active = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveTab(tab)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all whitespace-nowrap ${
                        active
                          ? 'bg-primary text-white shadow-sm border-primary'
                          : 'bg-white border border-black/10 text-gray-600 hover:text-primary hover:border-primary/30'
                      }`}
                    >
                      {tab}
                      {tab !== 'ARCHIVED' && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedDate && (
                <div className="flex items-center gap-2 animate-fade-in">
                  <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-blue-200 shadow-sm">
                    <CalendarRange size={14} />
                    {fmtDateLabel(selectedDate)}
                    <button onClick={clearDateFilter} aria-label="Clear date filter" className="ml-2 hover:text-red-500 transition-colors p-0.5 rounded">
                      <X size={14} />
                    </button>
                  </span>
                </div>
              )}
            </div>

            <div className="p-4 md:p-6 space-y-3">
              {loading ? (
                <div className="flex justify-center py-16"><div className="neu-spinner" aria-label="Loading" /></div>
              ) : visibleRequests.length === 0 ? (
                <NeumorphCard className="p-12 text-center bg-white border-dashed border-2 border-black/10">
                  {selectedDate ? (
                    <>
                      <CalendarDays size={36} className="mx-auto text-primary/30 mb-3" />
                      <p className="text-sm font-bold text-gray-500">No requests for {fmtDateLabel(selectedDate)}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Try a different date or{' '}
                        <button onClick={clearDateFilter} className="text-primary underline font-bold">clear the filter</button>.
                      </p>
                    </>
                  ) : (
                    <>
                      <Search size={36} className="mx-auto text-gray-200 mb-3" />
                      <p className="text-sm font-bold text-gray-500">No requests found</p>
                      <p className="text-xs text-gray-400 mt-1">Try a different search or change the active tab.</p>
                    </>
                  )}
                </NeumorphCard>
              ) : visibleRequests.map(r => {
                const urgency    = getRequestUrgency(r);
                const uBorder    = { void: 'border-l-4 border-l-red-500', overdue: 'border-l-4 border-l-red-500', critical: 'border-l-4 border-l-orange-400', pickup_active: 'border-l-4 border-l-amber-400', warning: 'border-l-4 border-l-amber-300' }[urgency] || 'border-l-4 border-l-transparent';
                const timeRange  = getTimeRange(r);
                const isExpanded = expandedRow === r.id;

                return (
                  <NeumorphCard
                    key={r.id}
                    className={`p-0 overflow-hidden bg-white transition-all hover:shadow-md ${r.isExpired ? 'opacity-60 grayscale' : ''} ${uBorder}`}
                  >
                    <div
                      className="flex items-center justify-between px-5 py-4 cursor-pointer"
                      onClick={() => setExpandedRow(prev => prev === r.id ? null : r.id)}
                      aria-expanded={isExpanded}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && setExpandedRow(prev => prev === r.id ? null : r.id)}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-gray-50 border border-black/5 flex items-center justify-center font-mono font-black text-gray-600 text-sm flex-shrink-0 shadow-inner select-none">
                          #{r.id}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase">{r.requester_type}</span>
                            <p className="font-black text-gray-800 text-base truncate">
                              {r.requester_name
                                ? `${r.requester_name} (${r.student_id || r.requester_id})`
                                : `User: ${r.student_id || r.requester_id}`}
                            </p>
                            <DeadlineBadge req={r} />
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
                            <span className={`font-black ${r.isExpired ? 'text-gray-500' : STATUS_TEXT_CLS[r.status] || 'text-gray-500'}`}>
                              {r.isExpired && !['REJECTED', 'CANCELLED', 'RETURNED'].includes(r.status)
                                ? 'EXPIRED (VOID)' : r.status}
                            </span>
                            <span>•</span>
                            <span>{r.items?.length ?? 0} items</span>
                            {timeRange ? (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                  <CalendarClock size={10} className="flex-shrink-0" />{timeRange}
                                </span>
                              </>
                            ) : r.return_deadline ? (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1 text-gray-600 font-medium">
                                  <Clock size={10} />Due {fmtDateTimeFull(r.return_deadline)}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                        {['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired && (
                          <div className="hidden sm:flex gap-2">
                            <button disabled={isRoomLocked} onClick={e => handleApproveClick(r, e)} className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 transition-colors"><Check size={14} />Approve</button>
                            <button disabled={isRoomLocked} onClick={e => handleRejectClick(r, e)}  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"><X size={14} />Deny</button>
                          </div>
                        )}

                        <div className={`p-1.5 rounded-lg transition-colors ${isExpanded ? 'bg-gray-100 text-gray-900' : 'text-gray-400'}`}>
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (() => {
                      const reqTypeLabel = getRequestTypeLabel(r);
                      const slotTime     = getSlotTime(r);
                      return (
                        <div className="border-t border-black/5 p-5 grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50/80 shadow-inner">
                          <div className="bg-white p-4 rounded-xl border border-black/5 text-sm space-y-2 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Request Details</span>
                              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-700">{reqTypeLabel}</span>
                            </div>
                            <p><strong>Purpose:</strong> <span className="text-gray-700">{r.purpose || '—'}</span></p>
                            <p><strong>Submitted:</strong> <span className="text-gray-700">{fmtDateTimeFull(r.created_at)}</span></p>

                            {slotTime && (
                              <div className="pt-3 mt-3 border-t border-black/5">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Scheduled Window</span>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="flex items-center gap-1.5 text-blue-700 font-bold bg-blue-50 px-2.5 py-1.5 rounded-lg text-xs border border-blue-200 shadow-sm">
                                    <CalendarClock size={14} /> {fmtDateTimeFull(slotTime)}
                                  </span>
                                  {r.return_deadline && (
                                    <>
                                      <span className="text-gray-400 text-sm font-black">→</span>
                                      <span className="flex items-center gap-1.5 text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1.5 rounded-lg text-xs border border-emerald-200 shadow-sm">
                                        <Clock size={14} /> {fmtDateTimeFull(r.return_deadline)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                            {!slotTime && r.return_deadline && (
                              <p><strong>Deadline:</strong> <span className="text-gray-700">{fmtDateTimeFull(r.return_deadline)}</span></p>
                            )}

                            <div className="sm:hidden pt-4 mt-4 border-t border-black/5 flex gap-2 flex-wrap">
                              {['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired && (
                                <>
                                  <button disabled={isRoomLocked} onClick={e => handleApproveClick(r, e)} className="flex-1 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800">Approve</button>
                                  <button disabled={isRoomLocked} onClick={e => handleRejectClick(r, e)}  className="flex-1 px-3 py-2 rounded-lg text-xs font-bold bg-red-100 text-red-700">Deny</button>
                                </>
                              )}

                            </div>
                          </div>

                          <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Package size={12} /> Requested Equipment</p>
                            <div className="space-y-2">
                              {r.items?.map((item, i) => (
                                <div key={i} className="flex justify-between items-start text-sm bg-white p-3 rounded-xl border border-black/5 shadow-sm">
                                  <div>
                                    <p className="font-bold text-gray-800">{item.item_name}</p>
                                    {(item.inventory_item_barcode || item.stock_barcode || item.consumable_barcode || item.barcode) && (
                                      <p className="text-[10px] font-mono text-gray-700 mt-1 flex items-center gap-1.5 bg-gray-100 w-fit px-2 py-0.5 rounded border border-gray-200">
                                        <Barcode size={12} className="text-gray-500" />
                                        <span className="font-black tracking-wider">
                                          {item.inventory_item_barcode || item.stock_barcode || item.consumable_barcode || item.barcode}
                                        </span>
                                      </p>
                                    )}
                                    {item.item_status && (
                                      <span className={`text-[10px] font-bold uppercase mt-1 inline-block ${['RETURNED', 'ISSUED'].includes(item.item_status) ? 'text-emerald-600' : ['EXPIRED', 'REJECTED', 'CANCELLED'].includes(item.item_status) ? 'text-red-600' : 'text-amber-600'}`}>
                                        {item.item_status === 'EXPIRED' ? 'EXPIRED (VOID)' : item.item_status}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-black text-primary bg-primary/10 px-2.5 py-1 rounded-lg self-start ml-4">
                                    ×{item.quantity || item.qty_requested}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </NeumorphCard>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-gray-50 p-4 md:p-6 overflow-hidden">
            <div className="w-full h-full bg-white rounded-2xl shadow-sm border border-black/10 overflow-hidden flex flex-col">
              <AvailabilityCalendar
                roomId={user?.room_id}
                onDateSelect={handleCalendarDateSelect}
                selectedDate={selectedDate}
                requestCountByDate={requestCountByDate}
                onViewList={() => { setViewMode('list'); setActiveTab('PENDING'); }}
              />
            </div>
          </div>
        )}
      </div>

      <NeumorphModal open={cameraModal} onClose={() => setCameraModal(false)} title="Scan Request QR Code">
        {cameraModal && <QrCameraScanner onResult={handleQR} />}
      </NeumorphModal>

      <NeumorphModal open={approveModal} onClose={() => setApproveModal(false)} title={`Approve Reservation #${approveReq?.id}`} size="md">
        {approveReq && (
          <div className="space-y-5">
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl shadow-sm">
              <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><CalendarClock size={14} /> Reservation Details</h3>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <p><span className="font-bold text-blue-800">Borrower:</span> <span className="text-blue-900">{approveReq.requester_name || approveReq.student_id}</span></p>
                <p><span className="font-bold text-blue-800">Scheduled Pickup:</span> <span className="text-blue-900">{fmtDateTimeFull(approveReq.pickup_datetime || approveReq.pickup_start)}</span></p>
                {approveReq.return_deadline && (
                  <p><span className="font-bold text-emerald-700">Expected Return:</span> <span className="text-emerald-900">{fmtDateTimeFull(approveReq.return_deadline)}</span></p>
                )}
              </div>
              {approveReq.requester_email && (
                <p className="text-[10px] text-blue-600 mt-3 font-medium flex items-center gap-1.5">
                  A confirmation email will be sent to <strong>{approveReq.requester_email}</strong>.
                </p>
              )}
            </div>
            <div className="flex gap-3 pt-2 border-t border-black/5">
              <NeumorphButton variant="outline" className="flex-1 py-3 font-bold" onClick={() => setApproveModal(false)}>Cancel</NeumorphButton>
              <NeumorphButton
                variant="primary"
                className="flex-1 py-3 font-black shadow-md shadow-emerald-500/20 bg-emerald-500 border-emerald-600 hover:bg-emerald-600"
                onClick={() => handleApproveSubmit(approveReq.id, approveReq.requester_email)}
              >
                <Check size={16} className="mr-1.5" /> Confirm Approval
              </NeumorphButton>
            </div>
          </div>
        )}
      </NeumorphModal>

      <NeumorphModal open={rejectModal} onClose={() => setRejectModal(false)} title={`Deny Request #${approveReq?.id}`} size="md">
        {approveReq && (
          <div className="space-y-4">
            <div className="bg-red-50 p-4 rounded-xl border border-red-200">
              <h3 className="text-xs font-black text-red-800 mb-2">Reason for Denial <span className="text-red-500">*</span></h3>
              <textarea
                className="w-full bg-white border border-red-200 rounded-lg p-3 text-sm outline-none focus:border-red-400 shadow-inner resize-none"
                rows={3}
                placeholder="e.g., Equipment is undergoing maintenance..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <p className="text-[10px] text-red-600 mt-2 font-medium">
                This reason will be sent to {approveReq.requester_name}'s email.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <NeumorphButton variant="outline" className="flex-1 py-3 font-bold" onClick={() => setRejectModal(false)}>Cancel</NeumorphButton>
              <NeumorphButton
                variant="primary"
                className="flex-1 py-3 font-black bg-red-500 border-red-600 hover:bg-red-600 shadow-md shadow-red-500/20 text-white"
                onClick={() => handleRejectSubmit(approveReq.id, approveReq.requester_email)}
              >
                <X size={16} className="mr-1.5" /> Confirm Denial
              </NeumorphButton>
            </div>
          </div>
        )}
      </NeumorphModal>

      <NeumorphModal open={issueModal} onClose={() => { setIssueModal(false); setItemSearch(''); }} title={`Issue Request #${selectedReq?.id}`} size="lg">
        <div className="space-y-5">
          {selectedReq && getSlotTime(selectedReq) && (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex items-center gap-3">
              <CalendarClock size={18} className="text-blue-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-black text-blue-800">Reserved Time Slot</p>
                <p className="text-[11px] text-blue-700 font-medium mt-0.5">
                  {fmtDateTimeFull(getSlotTime(selectedReq))}
                  {selectedReq.return_deadline && <> → {fmtDateTimeFull(selectedReq.return_deadline)}</>}
                </p>
              </div>
            </div>
          )}

          <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl shadow-inner">
            <h3 className="text-xs font-black text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5"><Timer size={14} /> Step 1: Set Return Deadline</h3>
            <div className="flex gap-2 mb-3 flex-wrap">
              {[
                { label: '+1 Hour',          action: () => { const d = getPHTDateObj(); d.setHours(d.getHours() + 1); setIssueDate(getPHTDateStringFromDate(d)); setIssueTime(getPHTTimeStringFromDate(d)); } },
                { label: 'End of Day (5 PM)', action: () => { setIssueDate(getPHTDateStringFromDate(getPHTDateObj())); setIssueTime('17:00'); } },
                { label: 'Tomorrow 8 AM',    action: () => { const d = getPHTDateObj(); d.setDate(d.getDate() + 1); setIssueDate(getPHTDateStringFromDate(d)); setIssueTime('08:00'); } },
              ].map(({ label, action }) => (
                <button key={label} onClick={action} className="text-[10px] font-bold bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg transition-colors border border-primary/20">{label}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1" htmlFor="issue-date">Date</label>
                <input id="issue-date" type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="neu-input w-full text-sm py-2" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1" htmlFor="issue-time">Time</label>
                <input id="issue-time" type="time" value={issueTime} onChange={e => setIssueTime(e.target.value)} className="neu-input w-full text-sm py-2" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Scan size={14} /> Step 2: Verify Physical Items</h3>
            <div className="relative mb-3">
              <NeumorphInput
                placeholder="Search by name or barcode to add items…"
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && itemSearch.trim()) {
                    e.preventDefault();
                    handleScan(itemSearch.trim());
                    setItemSearch('');
                  }
                }}
                icon={<Search size={14} />}
                className="w-full"
              />
              {itemSearch && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-black/10 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                  {inventory.filter(i => 
                    (i.status === 'available' || i.kind !== 'borrowable') && 
                    (
                      (i.name || '').toLowerCase().includes(itemSearch.toLowerCase()) ||
                      (i.barcode || '').toLowerCase().includes(itemSearch.toLowerCase())
                    )
                  ).slice(0, 8).map(inv => (
                    <button
                      key={inv.id}
                      onClick={() => { addToModal(inv, setAdjustedItems, adjustedItems); setItemSearch(''); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-primary/5 border-b border-black/5 flex justify-between items-center text-sm"
                    >
                      <span className="font-medium text-gray-800">
                        {inv.name} <span className="text-gray-400 font-mono text-xs ml-1">{inv.barcode ? `(${inv.barcode})` : ''}</span>
                      </span>
                      <Plus size={13} className="text-primary shrink-0" />
                    </button>
                  ))}
                  {inventory.filter(i => 
                    (i.name || '').toLowerCase().includes(itemSearch.toLowerCase()) ||
                    (i.barcode || '').toLowerCase().includes(itemSearch.toLowerCase())
                  ).length === 0 && (
                    <p className="px-4 py-3 text-xs text-gray-400">No items match "{itemSearch}"</p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
              {adjustedItems.map(item => (
                <ItemRow key={item.id} item={item} inventory={inventory} currentList={adjustedItems} setFn={setAdjustedItems} />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t border-black/5">
            <NeumorphButton variant="outline" className="flex-1 py-3 font-bold" onClick={() => { setIssueModal(false); setItemSearch(''); }}>Cancel</NeumorphButton>
            <NeumorphButton
              variant="primary"
              className="flex-1 py-3 font-black shadow-md shadow-primary/30"
              onClick={handleIssue}
              loading={issuing}
              disabled={!isReadyToIssue || !!timeToOpen}
            >
              {timeToOpen
                ? <span className="flex items-center justify-center gap-2"><Timer size={16} />{timeToOpen}</span>
                : <><Package size={16} className="mr-1.5" />Lock & Issue Items</>}
            </NeumorphButton>
          </div>
        </div>
      </NeumorphModal>

      <NeumorphModal
        open={manualModal}
        onClose={() => { setManualModal(false); setWalkInConflicts([]); setManualItems([]); setBorrowerSearch(''); }}
        title="Process Walk-in / Direct Issue"
        size="lg"
      >
        <div className="space-y-5">
          {walkInConflicts.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-3" role="alert">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600 flex-shrink-0" />
                <span className="text-xs font-black text-red-800 uppercase tracking-wide">
                  Conflict — {walkInConflicts.length} item{walkInConflicts.length > 1 ? 's have' : ' has'} upcoming reservations
                </span>
              </div>
              {walkInConflicts.map((c, i) => (
                <div key={i} className="bg-white border border-red-200 rounded-lg px-3 py-2 text-xs">
                  <p className="font-black text-red-800">{c.itemName}</p>
                  <p className="text-red-600 mt-0.5">
                    Reserved by <strong>{c.requester}</strong> (Req #{c.requestId}) — pickup <strong>{c.pickupAt}</strong> → {c.returnAt}
                  </p>
                </div>
              ))}
              <p className="text-[11px] text-red-700 font-medium">
                Issuing this walk-in may prevent the reservation from being fulfilled. Adjust the return time or override below.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setWalkInConflicts([])}
                  className="flex-1 py-2 rounded-lg text-xs font-black bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Dismiss — Adjust Return Time
                </button>
                <button
                  onClick={() => processWalkIn(true)}
                  disabled={issuing}
                  className="flex-1 py-2 rounded-lg text-xs font-black bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  <AlertTriangle size={13} /> Override &amp; Issue Anyway
                </button>
              </div>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-sm text-amber-800 font-medium flex items-start gap-2">
            <Zap size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="font-black">Walk-in Transaction:</strong> Items are instantly marked as <em>Issued</em> — no approval queue.
            </div>
          </div>

          <div className="bg-white border border-black/10 p-4 rounded-xl space-y-3 shadow-sm">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><UserCheck size={12} /> Borrower Info</h3>
            <div className="grid grid-cols-2 gap-3">
              
              <div className="relative" ref={borrowerDropdownRef}>
                <NeumorphInput
                  label="Borrower (Name or ID)"
                  placeholder="Type name or ID..."
                  value={borrowerSearch}
                  onChange={e => {
                    setBorrowerSearch(e.target.value);
                    setManualForm(f => ({ ...f, studentId: e.target.value }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault(); 
                  }}
                  onFocus={() => borrowerResults.length > 0 && setShowBorrowerDropdown(true)}
                />
                
                {isSearchingBorrower && (
                  <div className="absolute right-3 top-[34px] text-primary animate-spin">
                    <RefreshCw size={14} />
                  </div>
                )}

                {showBorrowerDropdown && borrowerResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-black/10 rounded-xl shadow-2xl max-h-56 overflow-y-auto custom-scrollbar">
                    {borrowerResults.map(res => (
                      <button
                        key={res.id + res.role}
                        className="w-full text-left px-4 py-2.5 hover:bg-primary/5 border-b border-black/5 text-sm flex flex-col transition-colors"
                        onClick={(e) => {
                          e.preventDefault();
                          skipBorrowerSearch.current = true;
                          setBorrowerSearch(res.full_name);
                          setManualForm(f => ({ ...f, studentId: res.student_id }));
                          setShowBorrowerDropdown(false);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-800">{res.full_name}</span>
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${res.role === 'faculty' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {res.role}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-gray-500 mt-0.5">
                          {res.student_id} • {res.department || 'N/A'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <NeumorphInput
                label="Purpose"
                value={manualForm.purpose}
                onChange={e => setManualForm(f => ({ ...f, purpose: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              />
            </div>
          </div>

          <div className="bg-white border border-black/10 p-4 rounded-xl space-y-3 shadow-sm">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5"><Timer size={12} /> Expected Return Deadline</h3>
            <div className="flex gap-2 flex-wrap">
              {[
                { label: '+1 Hour',          action: () => { const d = getPHTDateObj(); d.setHours(d.getHours() + 1); setManualForm(f => ({ ...f, retDate: getPHTDateStringFromDate(d), retTime: getPHTTimeStringFromDate(d) })); } },
                { label: 'End of Day (5 PM)', action: () => { setManualForm(f => ({ ...f, retDate: getPHTDateStringFromDate(getPHTDateObj()), retTime: '17:00' })); } },
                { label: 'Tomorrow 8 AM',    action: () => { const d = getPHTDateObj(); d.setDate(d.getDate() + 1); setManualForm(f => ({ ...f, retDate: getPHTDateStringFromDate(d), retTime: '08:00' })); } },
              ].map(({ label, action }) => (
                <button key={label} onClick={action} className="text-[10px] font-bold bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg transition-colors border border-primary/20">{label}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1" htmlFor="manual-date">Date</label>
                <input id="manual-date" type="date" value={manualForm.retDate} onChange={e => setManualForm(f => ({ ...f, retDate: e.target.value }))} className="neu-input w-full text-sm py-2" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1" htmlFor="manual-time">Time</label>
                <input id="manual-time" type="time" value={manualForm.retTime} onChange={e => setManualForm(f => ({ ...f, retTime: e.target.value }))} className="neu-input w-full text-sm py-2" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Scan size={12} /> Items to Issue</h3>
            <div className="relative mb-3">
              <NeumorphInput
                placeholder="Search inventory or scan barcode…"
                value={manualForm.search}
                onChange={e => setManualForm(f => ({ ...f, search: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualForm.search.trim()) {
                    e.preventDefault();
                    handleScan(manualForm.search.trim());
                    setManualForm(f => ({ ...f, search: '' }));
                  }
                }}
                icon={<Search size={14} />}
                className="w-full"
              />
              {manualForm.search && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-black/10 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                  {inventory.filter(i => 
                    (i.status === 'available' || i.kind !== 'borrowable') && 
                    (
                      (i.name || '').toLowerCase().includes(manualForm.search.toLowerCase()) ||
                      (i.barcode || '').toLowerCase().includes(manualForm.search.toLowerCase())
                    )
                  ).slice(0, 8).map(inv => (
                    <button
                      key={inv.id}
                      onClick={() => { addToModal(inv, setManualItems, manualItems); setManualForm(f => ({ ...f, search: '' })); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-primary/5 border-b border-black/5 flex justify-between items-center text-sm"
                    >
                      <span className="font-medium text-gray-800">
                        {inv.name} <span className="text-gray-400 font-mono text-xs ml-1">{inv.barcode ? `(${inv.barcode})` : ''}</span>
                      </span>
                      <Plus size={13} className="text-primary shrink-0" />
                    </button>
                  ))}
                  {inventory.filter(i => 
                    (i.status === 'available' || i.kind !== 'borrowable') && 
                    (
                      (i.name || '').toLowerCase().includes(manualForm.search.toLowerCase()) ||
                      (i.barcode || '').toLowerCase().includes(manualForm.search.toLowerCase())
                    )
                  ).length === 0 && (
                    <p className="px-4 py-3 text-xs text-gray-400">No matches for "{manualForm.search}"</p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar">
              {manualItems.length === 0 ? (
                <div className="py-8 text-center border-2 border-dashed border-black/10 rounded-xl text-muted text-xs">
                  No items yet — search above or use a barcode scanner.
                </div>
              ) : manualItems.map(item => (
                <ItemRow key={item.id} item={item} inventory={inventory} currentList={manualItems} setFn={setManualItems} />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t border-black/5">
            <NeumorphButton
              variant="outline"
              className="flex-1 py-3 font-bold"
              onClick={() => { setManualModal(false); setWalkInConflicts([]); setManualItems([]); setBorrowerSearch(''); }}
            >
              Cancel
            </NeumorphButton>
            <NeumorphButton
              variant="primary"
              className="flex-1 py-3 font-black shadow-md"
              onClick={() => processWalkIn(false)}
              loading={issuing}
              disabled={!isManualReady}
            >
              <Zap size={16} className="mr-1.5" /> Complete Walk-in
            </NeumorphButton>
          </div>
        </div>
      </NeumorphModal>
    </div>
  );
}