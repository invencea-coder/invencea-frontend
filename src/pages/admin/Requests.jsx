// src/pages/admin/Requests.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  RefreshCw, Package, Scan, Camera, Search, Clock, CheckCircle2,
  AlertCircle, Plus, Minus, Trash2, X, Barcode,
  Lock, Bell, BellRing, ChevronDown, ChevronUp,
  Timer, Check, Flame, CalendarRange, Link as LinkIcon,
  AlertTriangle, UserCheck, CalendarClock, Zap, Menu, Mail,
  CalendarDays, QrCode, ListTodo
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { format, addHours, startOfTomorrow, setHours, setMinutes } from 'date-fns';

import api from '../../api/axiosClient.js';
import {
  listRequests, getRequestByQR,
  issueRequest, approveRequest, rejectRequest, createRequest,
} from '../../api/requestAPI.js';
import { listInventory } from '../../api/inventoryAPI.js';
import { useAuth } from '../../context/AuthContext.jsx';

import NeumorphCard from '../../components/ui/NeumorphCard.jsx';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';
import NeumorphModal from '../../components/ui/NeumorphModal.jsx';
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';
import AvailabilityCalendar from '../../components/AvailabilityCalendar.jsx';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';

// ── Time helpers (Forced to Philippines Time UTC+8) ───────────────────────────
const toPHTime = (d) => {
  if (!d) return null;
  let str = typeof d === 'string' ? d : String(d);
  if (str.includes('T') && !str.endsWith('Z') && !str.includes('+') && !str.includes('-', 10)) {
    str += 'Z';
  }
  return new Date(str);
};

const fmtDateTimeFull = (d) => {
  if (!d) return '—';
  try {
    return toPHTime(d).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).replace(' at ', ', ');
  } catch { return '—'; }
};

const fmtTime = (d) => {
  if (!d) return null;
  try {
    return toPHTime(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return null; }
};

const getPHTDateString = (d) => {
  if (!d) return '';
  try {
    const phtDate = toPHTime(d);
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
    const [{ value: mo }, , { value: da }, , { value: ye }] = formatter.formatToParts(phtDate);
    return `${ye}-${mo}-${da}`;
  } catch { return ''; }
};

const getPHTTimeString = (d) => {
  if (!d) return '';
  try {
    const phtDate = toPHTime(d);
    const hours = String(phtDate.getHours()).padStart(2, '0');
    const mins = String(phtDate.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  } catch { return ''; }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const getSlotTime  = (r) => r.issued_time || r.pickup_datetime || r.scheduled_time || r.pickup_start || null;
const getTimeRange = (r) => {
  const start = getSlotTime(r);
  const end   = r.return_deadline || r.pickup_end;
  if (!start && !end) return null;
  if (start && end)  return `${fmtTime(start)} – ${fmtTime(end)}`;
  if (start)         return `From ${fmtTime(start)}`;
  if (end)           return `Until ${fmtTime(end)}`;
  return null;
};
const getMinsLeft     = (d) => d ? Math.ceil((toPHTime(d) - toPHTime(new Date())) / 60000) : null;

const isExpiredRow = (r) => {
  if (!['PENDING', 'APPROVED', 'PENDING APPROVAL'].includes(r.status?.toUpperCase())) return false;
  const now = toPHTime(new Date());

  if (r.pickup_datetime) {
    const windowEnd = new Date(toPHTime(r.pickup_datetime).getTime() + 15 * 60000);
    return now > windowEnd;
  }
  if (r.pickup_start) {
    const e = toPHTime(r.pickup_start); e.setHours(23, 59, 59, 999);
    return now > e;
  }
  if (r.created_at) {
    const e = toPHTime(r.created_at); e.setHours(23, 59, 59, 999);
    return now > e;
  }
  return false;
};

const deadlineUrgency = (d) => {
  if (!d) return null;
  const m = getMinsLeft(d);
  if (m <= 0)  return 'overdue';
  if (m <= 10) return 'critical';
  if (m <= 60) return 'warning';
  return null;
};
const getRequestTypeLabel = (r) => {
  if (r.pickup_start) return 'Multiple Days';
  if (r.pickup_datetime || r.scheduled_time) return 'Reserved Slot';
  return 'Walk-in';
};

const getRequestRelevantDate = (r) => {
  const source =
    r.pickup_datetime ||
    r.pickup_start    ||
    r.issued_time     ||
    r.scheduled_time  ||
    r.created_at      ||
    null;
  return getPHTDateString(source);
};

const fmtDateLabel = (dateStr) => {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return dateStr; }
};

const BAR_TEXT = { ISSUED: 'text-emerald-800', APPROVED: 'text-blue-800', PENDING: 'text-amber-800', 'PENDING APPROVAL': 'text-amber-800', overdue: 'text-red-800', 'PARTIALLY RETURNED': 'text-orange-800' };

// ── Components ────────────────────────────────────────────────────────────────
function QrCameraScanner({ onResult }) {
  const containerRef = useRef(null), h5Ref = useRef(null), runRef = useRef(false), mountRef = useRef(true);
  
  useEffect(() => {
    mountRef.current = true;
    const t = setTimeout(async () => {
      if (!mountRef.current || !containerRef.current) return;
      let cams = []; 
      try { cams = await Html5Qrcode.getCameras().catch(() => []); } catch { cams = []; }
      
      if (!cams?.length) { toast.error('No camera found'); return; }
      const cam = cams.find(c => /back|rear|environment/i.test(c.label)) || cams[0];
      const sc = new Html5Qrcode('qr-reader-adm'); 
      h5Ref.current = sc;
      
      try {
        await sc.start(cam.id, { fps: 10, qrbox: { width: 250, height: 250 } }, t => { if (mountRef.current) onResult(t); }, () => {});
        runRef.current = true;
      } catch { 
        toast.error('Cannot start camera'); 
        h5Ref.current = null; 
      }
    }, 300);

    return () => {
      mountRef.current = false; 
      clearTimeout(t);
      if (h5Ref.current && runRef.current) {
        runRef.current = false;
        h5Ref.current.stop()
          .then(() => {
            try { h5Ref.current?.clear(); } catch (e) {}
          })
          .catch(() => {})
          .finally(() => { h5Ref.current = null; });
      } else {
        try { h5Ref.current?.clear(); } catch (e) {}
        h5Ref.current = null;
      }
    };
  }, [onResult]);

  return <div id="qr-reader-adm" ref={containerRef} className="w-full rounded-xl border-2 border-primary/20 bg-black/5 min-h-[300px] overflow-hidden" />;
}

function DeadlineBadge({ deadline, status, compact = false }) {
  if (['RETURNED', 'REJECTED', 'CANCELLED'].includes(status)) return null;
  
  const u = deadlineUrgency(deadline); if (!u) return null;
  const m = getMinsLeft(deadline);
  const cfg = {
    overdue:  { cls: 'bg-red-100 text-red-700 border-red-200',    icon: <Flame size={9} />,       label: 'OVERDUE' },
    critical: { cls: 'bg-red-50 text-red-600 border-red-200 animate-pulse', icon: <AlertCircle size={9} />, label: `${m}m left` },
    warning:  { cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Timer size={9} />,      label: compact ? `${m}m` : `${m}m left` },
  }[u];
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function ItemRow({ item, inventory, setFn }) {
  const validInv = inventory.filter(inv => String(inv.inventory_type_id) === String(item.inventory_type_id) && !item.isQtyMode);
  const ok = item.actualQuantity <= 0 || !!item.consumable_id || !!item.isQtyMode || item.actualQuantity === (item.scannedPhysicalItems?.length || 0);
  return (
    <div className={`p-3.5 rounded-2xl border transition-colors ${ok ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-black/10'}`}>
      <div className="flex justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">
            {item.item_name}
            {item.isNew    && <span className="ml-1 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded uppercase">Added</span>}
            {item.isQtyMode && <span className="ml-1 text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded uppercase">qty</span>}
          </p>
          {!item.consumable_id && !item.isQtyMode && item.actualQuantity > 0 && validInv.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {validInv.map(inv => {
                const sc = item.scannedPhysicalItems?.some(s => s.id === inv.id);
                return <span key={inv.id} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${sc ? 'bg-green-100 text-green-700 line-through opacity-60' : 'bg-black/5 text-gray-600'}`}>{inv.barcode}</span>;
              })}
            </div>
          )}
        </div>
        <div className="flex items-start gap-1 bg-black/5 p-1 rounded-xl h-fit flex-shrink-0">
          <button onClick={() => setFn(p => p.map(x => x.id === item.id ? { ...x, actualQuantity: Math.max(0, x.actualQuantity - 1) } : x))} className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-muted hover:text-primary"><Minus size={13} /></button>
          <span className="w-7 text-center text-sm font-bold leading-7">{item.actualQuantity}</span>
          <button onClick={() => setFn(p => p.map(x => x.id === item.id ? { ...x, actualQuantity: x.actualQuantity + 1 } : x))} className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-muted hover:text-primary"><Plus size={13} /></button>
          <div className="w-px h-4 bg-black/10 mx-0.5 self-center" />
          <button onClick={() => setFn(p => p.filter(x => x.id !== item.id))} className="w-7 h-7 flex items-center justify-center text-red-400 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
        </div>
      </div>
      {!item.isQtyMode && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {item.scannedPhysicalItems?.map(s => (
            <span key={s.id} className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1">
              <Scan size={9} />{s.barcode}
              <button onClick={() => setFn(p => p.map(x => x.id !== item.id ? x : { ...x, scannedPhysicalItems: x.scannedPhysicalItems.filter(ss => ss.id !== s.id) }))} className="hover:text-red-500 ml-1"><X size={9} /></button>
            </span>
          ))}
          {!item.consumable_id && item.actualQuantity > (item.scannedPhysicalItems?.length || 0) && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded flex items-center gap-1 border border-amber-200">
              <Scan size={9} className="animate-pulse" />Scan {item.actualQuantity - (item.scannedPhysicalItems?.length || 0)} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminRequests() {
  const { user } = useAuth(); 

  const [requests, setRequests]     = useState([]);
  const [inventory, setInventory]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [isRoomLocked, setIsRoomLocked] = useState(false);

  const [viewMode, setViewMode] = useState('calendar');

  const [sidebarOpen, setSidebarOpen] = useState(true); 
  const [expandedRow, setExpandedRow] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('PENDING');

  const [selectedDate, setSelectedDate] = useState(null);

  const [notifications, setNotifications]  = useState([]);
  const [notifOpen, setNotifOpen]          = useState(false);
  const unread = notifications.filter(n => !n.read).length;

  const [cameraModal, setCameraModal]     = useState(false);
  const [issuing, setIssuing]             = useState(false);

  const [issueModal, setIssueModal]       = useState(false);
  const [selectedReq, setSelectedReq]     = useState(null);
  const [adjustedItems, setAdjustedItems] = useState([]);
  const [itemSearch, setItemSearch]       = useState('');
  const [timeToOpen, setTimeToOpen]       = useState(null);
  const [issueDate, setIssueDate]         = useState('');
  const [issueTime, setIssueTime]         = useState('');

  const [approveModal, setApproveModal]   = useState(false);
  const [approveReq, setApproveReq]       = useState(null);

  const [manualModal, setManualModal] = useState(false);
  const [manualForm, setManualForm]   = useState({
    studentId: '', purpose: 'Walk-in', search: '',
    retDate: format(new Date(), 'yyyy-MM-dd'), retTime: '17:00',
  });
  const [manualItems, setManualItems] = useState([]);

  const bufRef        = useRef('');
  const issueOpenRef  = useRef(false);
  const manualOpenRef = useRef(false);
  const invRef        = useRef([]);

  useEffect(() => { issueOpenRef.current  = issueModal;  }, [issueModal]);
  useEffect(() => { manualOpenRef.current = manualModal; }, [manualModal]);

  useEffect(() => {
    if (!issueModal || !selectedReq) return;
    const isReservation = !!(selectedReq.pickup_start || selectedReq.pickup_datetime);
    if (!isReservation) { setTimeToOpen(null); return; }
    const startTime = new Date(selectedReq.pickup_start || selectedReq.pickup_datetime).getTime();
    
    const calculateTime = () => {
      const now = Date.now();
      if (now >= startTime) { setTimeToOpen(null); } 
      else {
        const diffMs = startTime - now;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setTimeToOpen(`Opens in ${hours}h ${minutes}m`);
      }
    };
    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [issueModal, selectedReq]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const roomParams = user?.room_id ? { room_id: user.room_id } : {};
      const [rmsRes, reqRes, invRes] = await Promise.all([
        api.get('/admin/rooms').catch(() => ({ data: { data: [] } })),
        listRequests(roomParams), 
        listInventory(roomParams), 
      ]);
      const myRoom = (rmsRes.data?.data || rmsRes.data || []).find(r => String(r.id) === String(user?.room_id));
      if (myRoom) setIsRoomLocked(!myRoom.is_available);
      
      let fetchedReqs = reqRes.data?.data ?? reqRes.data ?? [];
      if (user?.room_id) fetchedReqs = fetchedReqs.filter(r => String(r.room_id) === String(user.room_id) || !r.room_id);
      setRequests(fetchedReqs.map(r => ({ ...r, isExpired: isExpiredRow(r) })));
      
      const combined = [
        ...(invRes.data?.data?.items || []).filter(i => ['available', 'reserved'].includes(i.status)).map(i => ({ ...i, kind: 'borrowable' })),
        ...(invRes.data?.data?.consumables || []).map(i => ({ ...i, kind: 'consumable' })),
      ];
      setInventory(combined);
      invRef.current = combined;
    } catch { if (!silent) toast.error('Failed to load data'); }
    finally { setLoading(false); }
  }, [user?.room_id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const sock = io(SOCKET_URL);
    const loadCooldownRef = { current: false };
    const debouncedLoad = () => {
      if (loadCooldownRef.current) return;
      loadCooldownRef.current = true;
      load(true);
      setTimeout(() => { loadCooldownRef.current = false; }, 5000);
    };

    const isMyRoom = (payload) => {
      if (!user?.room_id) return true; 
      const targetRoom = payload?.room_id || payload?.roomId;
      return !!targetRoom && String(targetRoom) === String(user.room_id);
    };

    sock.on('inventory-updated', (payload) => { if (isMyRoom(payload)) debouncedLoad(); });
    sock.on('request-issued', (payload) => { if (isMyRoom(payload)) debouncedLoad(); });
    sock.on('new-request', (payload) => {
      if (isMyRoom(payload)) {
        toast.success(`New request #${payload.id} submitted!`, { icon: '🔔', duration: 6000, id: `new-req-${payload.id}` });
        debouncedLoad();
      }
    });

    sock.on('deadline-warning', (payload) => {
      if (!isMyRoom(payload)) return; 
      setNotifications(p => [{ id: Date.now(), ...payload, read: false, ts: new Date() }, ...p.slice(0, 49)]);
      if (['overdue', 'critical'].includes(payload.level)) toast.error(payload.message, { id: `dl-${payload.requestId}`, duration: 8000 });
      else toast(payload.message, { id: `dl-${payload.requestId}`, duration: 6000, icon: '⏰' });
    });

    return () => sock.disconnect();
  }, [load, user?.room_id]); 


  const requestCountByDate = useMemo(() => {
    const map = {};
    requests.forEach(r => {
      const isActionable =
        (['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired) ||
        (r.status === 'APPROVED' && !r.isExpired) ||
        ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status);
      if (!isActionable) return;
      const d = getRequestRelevantDate(r);
      if (d) map[d] = (map[d] || 0) + 1;
    });
    return map;
  }, [requests]);

  const allFiltered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return requests.filter(r => {
      if (q && !String(r.id).includes(q) && !String(r.requester_name).toLowerCase().includes(q) && !String(r.student_id).toLowerCase().includes(q)) return false;
      
      if (activeTab === 'PENDING')  { if (!(['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired)) return false; }
      else if (activeTab === 'APPROVED') { if (!(r.status === 'APPROVED' && !r.isExpired)) return false; }
      else if (activeTab === 'ISSUED')   { if (!(['ISSUED', 'PARTIALLY RETURNED'].includes(r.status))) return false; }
      else if (activeTab === 'OVERDUE')  { if (!(['ISSUED', 'PARTIALLY RETURNED'].includes(r.status) && deadlineUrgency(r.return_deadline) === 'overdue')) return false; }
      else if (activeTab === 'ARCHIVED') { if (!(['REJECTED', 'RETURNED', 'CANCELLED'].includes(r.status) || r.isExpired)) return false; }

      if (selectedDate) {
        const reqDate = getRequestRelevantDate(r);
        if (reqDate !== selectedDate) return false;
      }
      return true;
    });
  }, [requests, activeTab, searchQuery, selectedDate]);

  const counts = useMemo(() => ({
    ALL:      requests.filter(r => !selectedDate || getRequestRelevantDate(r) === selectedDate).length,
    PENDING:  requests.filter(r => ['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired && (!selectedDate || getRequestRelevantDate(r) === selectedDate)).length,
    APPROVED: requests.filter(r => r.status === 'APPROVED' && !r.isExpired && (!selectedDate || getRequestRelevantDate(r) === selectedDate)).length,
    ISSUED:   requests.filter(r => ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status) && (!selectedDate || getRequestRelevantDate(r) === selectedDate)).length,
    OVERDUE:  requests.filter(r => ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status) && deadlineUrgency(r.return_deadline) === 'overdue' && (!selectedDate || getRequestRelevantDate(r) === selectedDate)).length,
    ARCHIVED: requests.filter(r => (['REJECTED', 'RETURNED', 'CANCELLED'].includes(r.status) || r.isExpired) && (!selectedDate || getRequestRelevantDate(r) === selectedDate)).length,
  }), [requests, selectedDate]);

  const countsForDate = useMemo(() => {
    if (!selectedDate) return null;
    const inDate = requests.filter(r => getRequestRelevantDate(r) === selectedDate);
    return {
      PENDING:  inDate.filter(r => ['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired).length,
      APPROVED: inDate.filter(r => r.status === 'APPROVED' && !r.isExpired).length,
      ISSUED:   inDate.filter(r => ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status)).length,
      OVERDUE:  inDate.filter(r => ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status) && deadlineUrgency(r.return_deadline) === 'overdue').length,
      ARCHIVED: inDate.filter(r => ['REJECTED', 'RETURNED', 'CANCELLED'].includes(r.status) || r.isExpired).length,
    };
  }, [requests, selectedDate]);

  const overdueQueue = useMemo(() => requests.filter(r => ['ISSUED', 'PARTIALLY RETURNED'].includes(r.status) && deadlineUrgency(r.return_deadline) === 'overdue'), [requests]);
  const pendingQueue = useMemo(() => requests.filter(r => ['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired), [requests]);

  const handleCalendarDateSelect = useCallback((dateStr) => {
    if (!dateStr) { setSelectedDate(null); return; }
    setSelectedDate(prev => prev === dateStr ? null : dateStr); 
    setExpandedRow(null);
    setActiveTab('PENDING');
    setViewMode('list'); 
  }, []);

  const clearDateFilter = useCallback(() => { setSelectedDate(null); }, []);

  const handleApproveClick = (req, e) => {
    e?.stopPropagation();
    if (isRoomLocked) return;
    if (req.pickup_datetime || req.pickup_start) { setApproveReq(req); setApproveModal(true); } 
    else { handleApproveSubmit(req.id, req.requester_email); }
  };

  const handleApproveSubmit = async (id, emailStr = null) => {
    try {
      toast.loading('Approving…', { id: 'act' });
      await approveRequest(id, emailStr ? { email: emailStr } : {});
      toast.success('Approved!', { id: 'act' });
      setApproveModal(false); load(true);
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed', { id: 'act' }); }
  };

  const handleReject = async (id, e) => {
    e?.stopPropagation();
    if (isRoomLocked) return;
    try {
      toast.loading('Denying…', { id: 'act' });
      await rejectRequest(id);
      toast.success('Denied.', { id: 'act' });
      load(true);
    } catch { toast.error('Failed', { id: 'act' }); }
  };

  const openIssueModal = async (req) => {
    if (isRoomLocked) return;

    if (isExpiredRow(req)) {
      toast.error('Request VOID: The pickup window has passed.', { duration: 5000, icon: '🛑' });
      try { await rejectRequest(req.id); load(true); } catch (err) {}
      return;
    }

    setSelectedReq(req);

    // 🚨 FIXED: Override with user's expected return time!
    if (req.return_deadline) {
      setIssueDate(getPHTDateString(req.return_deadline));
      setIssueTime(getPHTTimeString(req.return_deadline));
    } else if (req.pickup_end) {
      setIssueDate(getPHTDateString(req.pickup_end)); setIssueTime('17:00');
    } else {
      setIssueDate(getPHTDateString(new Date())); setIssueTime('22:00');
    }

    setAdjustedItems((req.items || []).map((i, idx) => {
      const isQtyMode = !!i.stock_id;
      let a = i.assigned_to || 'Requester';
      if (['Shared Group', 'Shared'].includes(a)) a = 'Requester';
      return { ...i, id: i.id || `tmp-${idx}`, actualQuantity: isQtyMode ? (i.qty_requested || i.quantity || 1) : (i.quantity || 1), assignTo: a, scannedPhysicalItems: [], isQtyMode };
    }));
    setIssueModal(true);
  };

  const handleQR = async (code) => {
    setCameraModal(false);
    try {
      toast.loading('Locating request…', { id: 'qr' });
      const { data } = await getRequestByQR(code);
      const req = data.data ?? data;
      
      if (isExpiredRow(req)) {
        toast.error('Request VOID: The pickup window has passed.', { duration: 5000, icon: '🛑', id: 'qr' });
        try { await rejectRequest(req.id); load(true); } catch(e){}
        return;
      }

      if (user?.room_id && req.room_id && String(req.room_id) !== String(user.room_id)) {
        toast.error(`This request belongs to a different room (${req.room_code || req.room_id}). You cannot issue it from here.`, { id: 'qr', duration: 5000 });
        return;
      }
      
      setSelectedDate(null);
      setViewMode('list'); 

      let targetTab = 'ARCHIVED';
      if (!isExpiredRow(req)) {
        if (['PENDING', 'PENDING APPROVAL'].includes(req.status)) targetTab = 'PENDING';
        else if (req.status === 'APPROVED') targetTab = 'APPROVED';
        else if (['ISSUED', 'PARTIALLY RETURNED'].includes(req.status)) targetTab = 'ISSUED';
      }
      
      setActiveTab(targetTab);
      setSearchQuery(String(req.id));
      setExpandedRow(req.id);
      
      if (req.status === 'APPROVED') {
        toast.success('Request found! Ready to issue.', { id: 'qr' });
        openIssueModal(req);
      } else if (['PENDING', 'PENDING APPROVAL'].includes(req.status)) {
        toast.success('Request found! Please review details.', { id: 'qr', duration: 4000 });
        handleApproveClick(req);
      } else {
        toast.success(`Request #${req.id} — ${req.status}`, { id: 'qr' });
      }
    } catch (e) { toast.error(e?.response?.data?.message || 'Invalid QR Code', { id: 'qr' }); }
  };

  const handleScan = (barcode) => {
    const norm = b => String(b ?? '').trim().replace(/^0+(\d)/, '$1');
    const inv = invRef.current.find(i => norm(i.barcode) === norm(barcode));
    if (!inv) { toast.error(`Barcode ${barcode} not found.`); return; }
    if (inv.kind === 'consumable') { toast.success(`${inv.name} verified.`); return; }
    const upd = (prev) => {
      const items = [...prev];
      if (items.some(it => it.scannedPhysicalItems?.some(s => s.id === inv.id))) { toast.error('Already scanned!'); return prev; }
      const idx = items.findIndex(it => !it.isQtyMode && String(it.inventory_type_id) === String(inv.inventory_type_id) && (it.scannedPhysicalItems?.length || 0) < it.actualQuantity);
      if (idx >= 0) {
        const m = items[idx];
        items[idx] = { ...m, scannedPhysicalItems: [...(m.scannedPhysicalItems || []), inv] };
        toast.success(`Matched: ${inv.barcode}`);
      } else {
        items.push({ id: `new-${Date.now()}`, item_name: inv.name, inventory_type_id: inv.inventory_type_id, quantity: 1, actualQuantity: 1, isNew: true, assignTo: 'Requester', scannedPhysicalItems: [inv], isQtyMode: false });
        toast.success(`Added: ${inv.name}`);
      }
      return items;
    };
    if (issueOpenRef.current)  setAdjustedItems(upd);
    else if (manualOpenRef.current) setManualItems(upd);
  };

  useEffect(() => {
    let lastKeyTime = Date.now();
    const h = (e) => {
      if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) return;
      const now = Date.now();
      if (now - lastKeyTime > 50) bufRef.current = '';
      lastKeyTime = now;
      if (e.key === 'Enter') {
        const c = bufRef.current.trim(); bufRef.current = '';
        if (c) { if (issueOpenRef.current || manualOpenRef.current) handleScan(c); else if (!isRoomLocked) handleQR(c); }
        return;
      }
      if (e.key.length === 1) bufRef.current += e.key;
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isRoomLocked, handleQR]); 

  const isReadyToIssue = issueDate && issueTime && adjustedItems.length > 0 && adjustedItems.every(i => i.actualQuantity <= 0 || !!i.consumable_id || !!i.isQtyMode || i.actualQuantity === (i.scannedPhysicalItems?.length || 0));
  const isManualReady = manualForm.retDate && manualForm.retTime && manualItems.length > 0 && manualForm.studentId.trim() !== '' && manualItems.every(i => i.actualQuantity <= 0 || !!i.consumable_id || !!i.isQtyMode || i.actualQuantity === (i.scannedPhysicalItems?.length || 0));

  const handleIssue = async () => {
    if (!selectedReq) return; setIssuing(true);
    try {
      const payload = [];
      adjustedItems.forEach(item => {
        if (item.actualQuantity <= 0) { payload.push({ id: item.id, quantity: 0 }); return; }
        if (item.isQtyMode) { payload.push({ id: item.isNew ? null : item.id, inventory_type_id: item.inventory_type_id, stock_id: item.stock_id, qty_requested: item.actualQuantity, quantity: item.actualQuantity, assigned_to: item.assignTo }); return; }
        if (!item.consumable_id) { (item.scannedPhysicalItems || []).forEach(s => payload.push({ id: item.isNew || String(item.id).startsWith('split-') ? null : item.id, inventory_type_id: item.inventory_type_id, quantity: 1, inventory_item_id: s.id, assigned_to: item.assignTo })); return; }
        payload.push({ id: item.isNew ? null : item.id, inventory_type_id: item.inventory_type_id, consumable_id: item.consumable_id, quantity: item.actualQuantity, assigned_to: item.assignTo });
      });

      const deadlinePHT = `${issueDate}T${issueTime}:00+08:00`;
      await issueRequest(selectedReq.id, { items: payload, return_deadline: deadlinePHT });
      
      toast.success('Items successfully issued!'); setIssueModal(false); load(true);
    } catch (e) { toast.error(e?.response?.data?.message || 'Issuance failed'); }
    finally { setIssuing(false); }
  };

  const handleManualSync = async () => {
    setIssuing(true); let newRequestId = null;
    try {
      const cr = await createRequest({
        room_id: user?.room_id, purpose: manualForm.purpose, borrower_id: manualForm.studentId,
        items: manualItems.map(c => c.isQtyMode ? { inventory_type_id: c.inventory_type_id, stock_id: c.stock_id, qty_requested: c.actualQuantity, assigned_to: 'Requester' } : { inventory_type_id: c.inventory_type_id, consumable_id: c.consumable_id, quantity: c.actualQuantity, assigned_to: 'Requester' }),
      });
      newRequestId = cr.data.data?.id || cr.data?.id;
      if (!newRequestId) throw new Error('Could not get ID.');
    } catch (e) { toast.error(`Create failed: ${e?.response?.data?.message || e.message}`); setIssuing(false); return; }
    
    try { await approveRequest(newRequestId); } 
    catch (e) { toast.error(`Approve failed.`); setIssuing(false); load(true); return; }
    
    try {
      const pi = [];
      manualItems.forEach(item => {
        if (item.isQtyMode) { pi.push({ inventory_type_id: item.inventory_type_id, stock_id: item.stock_id, qty_requested: item.actualQuantity, quantity: item.actualQuantity, assigned_to: 'Requester' }); return; }
        if (!item.consumable_id) { (item.scannedPhysicalItems || []).forEach(s => pi.push({ inventory_type_id: item.inventory_type_id, quantity: 1, inventory_item_id: s.id, assigned_to: 'Requester' })); return; }
        pi.push({ inventory_type_id: item.inventory_type_id, consumable_id: item.consumable_id, quantity: item.actualQuantity, assigned_to: 'Requester' });
      });

      const manualDeadlinePHT = `${manualForm.retDate}T${manualForm.retTime}:00+08:00`;
      await issueRequest(newRequestId, { items: pi, return_deadline: manualDeadlinePHT });
      
    } catch (e) { toast.error(`Issue failed.`); setIssuing(false); load(true); return; }
    
    toast.success('Walk-in fully processed!');
    setManualModal(false);
    setManualForm({ studentId: '', purpose: 'Walk-in', search: '', retDate: getPHTDateString(new Date()), retTime: '17:00' });
    setManualItems([]); load(true); setIssuing(false);
  };

  const addToModal = (inv, setFn) => {
    setFn(prev => {
      const ex = prev.find(p => String(p.inventory_type_id) === String(inv.inventory_type_id));
      if (ex) return prev.map(p => p.id === ex.id ? { ...p, actualQuantity: p.actualQuantity + 1 } : p);
      const isQtyMode = inv.kind === 'quantity' || !!inv.stock_id;
      return [...prev, { id: `new-${Date.now()}`, item_name: inv.name, inventory_type_id: inv.inventory_type_id, stock_id: inv.stock_id || null, consumable_id: inv.kind === 'consumable' ? inv.id : null, quantity: 1, actualQuantity: 1, isNew: true, assignTo: 'Requester', scannedPhysicalItems: [], isQtyMode }];
    });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-gray-50/40 relative">

      {/* ════ PANE 1: LEFT SIDEBAR (Action Queue) ═════════════════════════════ */}
      {viewMode === 'list' && (
        <aside className={`flex-shrink-0 bg-white border-r border-black/8 flex flex-col shadow-sm z-20 transition-all duration-300 ${sidebarOpen ? 'w-[280px] ml-0' : 'w-[280px] -ml-[280px]'}`}>
          
          <div className="p-4 border-b border-black/8 space-y-3 bg-gray-50/50">
            <button onClick={() => setCameraModal(true)} disabled={isRoomLocked}
              className="w-full flex items-center justify-center gap-2 text-sm font-black py-4 px-4 bg-primary text-white rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-40 transition-all hover:-translate-y-0.5">
              {isRoomLocked ? <Lock size={18} /> : <Camera size={18} />} Scan Request QR
            </button>
            <button onClick={() => setManualModal(true)} disabled={isRoomLocked}
              className="w-full flex items-center justify-center gap-2 text-sm font-black py-3 px-4 bg-white border-2 border-amber-400 text-amber-600 rounded-xl hover:bg-amber-50 disabled:opacity-40 transition-all hover:-translate-y-0.5">
              <Zap size={16} /> Walk-in / Direct Issue
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-gray-50/30 custom-scrollbar">
            <div className="sticky top-0 bg-gray-100/90 backdrop-blur-sm border-b border-black/5 px-4 py-2 flex items-center justify-between z-10">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Needs Action Queue</span>
              <span className="text-[10px] font-black bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{overdueQueue.length + pendingQueue.length}</span>
            </div>
            
            <div className="p-3 space-y-2">
              {overdueQueue.length === 0 && pendingQueue.length === 0 && (
                <div className="py-10 text-center text-gray-400">
                  <CheckCircle2 size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-bold">Queue is empty</p>
                  <p className="text-[10px] mt-1">You're all caught up!</p>
                </div>
              )}

              {overdueQueue.map(r => (
                <div key={r.id} onClick={() => { setActiveTab('ISSUED'); setSelectedDate(null); setSearchQuery(String(r.id)); setExpandedRow(r.id); }}
                  className="bg-red-50 border border-red-200 rounded-xl p-3 cursor-pointer hover:border-red-400 transition-colors shadow-sm">
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-xs font-black text-red-800">#{r.id}</span>
                    <span className="text-[9px] font-black bg-red-100 text-red-700 px-1.5 py-0.5 rounded flex items-center gap-1"><Flame size={10}/> OVERDUE</span>
                  </div>
                  <p className="text-xs font-bold text-gray-800 truncate">{r.requester_name || r.student_id}</p>
                  <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1"><Timer size={10}/> Due {fmtTime(r.return_deadline)}</p>
                </div>
              ))}

              {pendingQueue.map(r => (
                <div key={r.id} onClick={() => { setActiveTab('PENDING'); setSelectedDate(null); setSearchQuery(String(r.id)); setExpandedRow(r.id); }}
                  className="bg-white border border-amber-200 rounded-xl p-3 cursor-pointer hover:border-amber-400 transition-colors shadow-sm relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400" />
                  <div className="flex items-start justify-between mb-1 pl-1">
                    <span className="text-xs font-black text-gray-800">#{r.id}</span>
                    <span className="text-[9px] font-bold text-amber-600">{r.created_at ? fmtTime(r.created_at) : ''}</span>
                  </div>
                  <p className="text-xs font-bold text-gray-800 truncate pl-1">{r.requester_name || r.student_id}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 truncate pl-1">{r.items?.length || 0} items requested</p>
                  <div className="flex gap-1.5 mt-2 pl-1">
                    <button disabled={isRoomLocked} onClick={e => handleApproveClick(r, e)} className="flex-1 text-[10px] font-bold py-1.5 rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-40 transition-colors">Approve</button>
                    <button disabled={isRoomLocked} onClick={e => handleReject(r.id, e)} className="flex-1 text-[10px] font-bold py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-40 transition-colors">Deny</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* ════ MAIN CONTENT AREA ══════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 relative z-10 bg-gray-50/40">

        {/* ── Top bar with VIEW TOGGLE ── */}
        <div className="bg-white border-b border-black/8 px-4 md:px-6 py-3 flex items-center gap-3 flex-shrink-0 shadow-sm z-20 overflow-x-auto hide-scrollbar">
          
          {viewMode === 'list' && (
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-black/5 rounded-xl text-gray-500 transition-colors mr-1" title="Toggle Sidebar">
              <Menu size={20} />
            </button>
          )}

          <div className="flex items-center flex-shrink-0 mr-2">
            <h1 className="text-lg font-black text-primary leading-none hidden sm:block">Request Management</h1>
          </div>

          <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />

          <div className="flex bg-gray-100 p-1 rounded-xl flex-shrink-0 border border-black/5">
            <button onClick={() => setViewMode('list')} 
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === 'list' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <ListTodo size={14} /> List View
            </button>
            <button onClick={() => setViewMode('calendar')} 
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === 'calendar' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <CalendarDays size={14} /> Calendar
            </button>
          </div>

          <div className="flex-1" />

          <button onClick={() => load(false)} className="p-2 hover:bg-black/5 rounded-xl transition-colors text-muted flex-shrink-0"><RefreshCw size={16} /></button>

          <div className="relative flex-shrink-0">
            <button onClick={() => { setNotifOpen(o => !o); setNotifications(p => p.map(n => ({ ...n, read: true }))); }} className="relative p-2 hover:bg-black/5 rounded-xl transition-colors">
              {unread > 0 ? <BellRing size={18} className="text-amber-500" /> : <Bell size={18} className="text-muted" />}
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] font-black flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-black/10 z-50 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/5 bg-gray-50/60">
                  <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Deadline Alerts</span>
                  <button onClick={() => setNotifications([])} className="text-[10px] font-bold text-muted hover:text-red-500">Clear</button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-10 text-center"><Bell size={24} className="mx-auto mb-2 text-gray-200" /><p className="text-xs text-muted">No alerts</p></div>
                  ) : notifications.map(n => (
                    <div key={n.id} className={`px-4 py-3 border-b border-black/5 ${n.level === 'overdue' ? 'bg-red-50' : n.level === 'critical' ? 'bg-orange-50' : 'bg-amber-50/60'}`}>
                      <div className="flex items-start gap-2">
                        <div className={`mt-0.5 ${n.level === 'overdue' ? 'text-red-500' : 'text-amber-500'}`}>
                          {n.level === 'overdue' ? <Flame size={13} /> : <Timer size={13} />}
                        </div>
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
          <div className="bg-red-50 border-b border-red-200/60 px-6 py-2 flex items-center gap-2 flex-shrink-0 z-10 shadow-sm">
            <Lock size={12} className="text-red-600"/>
            <span className="text-xs font-bold text-red-800">Room is currently locked. All actions are disabled.</span>
          </div>
        )}

        {/* ── MODE 1: LIST VIEW ── */}
        {viewMode === 'list' ? (
          <div className="flex-1 overflow-y-auto flex flex-col custom-scrollbar">
            <div className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-black/8 px-4 md:px-6 py-3 space-y-3 z-10">
              <NeumorphInput icon={<Search size={14} />} placeholder="Search by request ID or borrower name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full" />
              
              <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                {['PENDING', 'APPROVED', 'ISSUED', 'ARCHIVED'].map(tab => {
                  const baseCount = tab === 'ALL' ? requests.length : counts[tab] || 0;
                  const dateCount = countsForDate ? (countsForDate[tab] || 0) : null;
                  
                  let tabClasses = 'bg-white border border-black/10 text-gray-600 hover:text-primary hover:border-primary/30';
                  let badgeClasses = 'bg-gray-100 text-gray-500';
                  
                  if (activeTab === tab) {
                    tabClasses = 'bg-primary text-white shadow-sm border-primary';
                    badgeClasses = 'bg-white/20 text-white';
                  }

                  return (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tabClasses}`}>
                      {tab === 'ARCHIVED' ? (
                        <>{tab}</>
                      ) : (
                        <>
                          {tab}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${badgeClasses}`}>
                            {dateCount !== null ? `${dateCount}/${baseCount}` : baseCount}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedDate && (
                <div className="flex items-center gap-2 mt-2 animate-fade-in">
                  <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-blue-200 shadow-sm">
                    <CalendarRange size={14} />
                    Filtering for: {fmtDateLabel(selectedDate)}
                    <button onClick={clearDateFilter} className="ml-2 hover:text-red-500 transition-colors p-0.5 rounded"><X size={14} /></button>
                  </span>
                </div>
              )}
            </div>

            <div className="p-4 md:p-6 space-y-3">
              {loading ? (
                <div className="flex justify-center py-16"><div className="neu-spinner" /></div>
              ) : allFiltered.length === 0 ? (
                <NeumorphCard className="p-12 text-center bg-white border-dashed border-2 border-black/10">
                  {selectedDate ? (
                    <>
                      <CalendarDays size={36} className="mx-auto text-primary/30 mb-3" />
                      <p className="text-sm font-bold text-gray-500">No requests for {fmtDateLabel(selectedDate)}</p>
                      <p className="text-xs text-gray-400 mt-1">Try a different date or <button onClick={clearDateFilter} className="text-primary underline font-bold">clear the filter</button>.</p>
                    </>
                  ) : (
                    <>
                      <Search size={36} className="mx-auto text-gray-200 mb-3" />
                      <p className="text-sm font-bold text-gray-500">No requests found</p>
                      <p className="text-xs text-gray-400 mt-1">Try a different search or change the active tab.</p>
                    </>
                  )}
                </NeumorphCard>
              ) : allFiltered.map(r => {
                const urgency   = deadlineUrgency(r.return_deadline);
                const uBorder   = urgency === 'overdue' ? 'border-l-4 border-l-red-500' : urgency === 'critical' ? 'border-l-4 border-l-orange-400' : urgency === 'warning' ? 'border-l-4 border-l-amber-300' : 'border-l-4 border-l-transparent';
                const timeRange = getTimeRange(r);
                const isExpanded = expandedRow === r.id;
                
                return (
                  <NeumorphCard key={r.id} className={`p-0 overflow-hidden bg-white transition-all hover:shadow-md ${r.isExpired ? 'opacity-60 grayscale' : ''} ${uBorder}`}>
                    <div className="flex items-center justify-between px-5 py-4 cursor-pointer" onClick={() => setExpandedRow(prev => prev === r.id ? null : r.id)}>
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-gray-50 border border-black/5 flex items-center justify-center font-mono font-black text-gray-600 text-sm flex-shrink-0 shadow-inner">
                          #{r.id}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase">{r.requester_type}</span>
                            <p className="font-black text-gray-800 text-base truncate">{r.requester_name ? `${r.requester_name} (${r.student_id || r.requester_id})` : `User: ${r.student_id || r.requester_id}`}</p>
                            <DeadlineBadge deadline={r.return_deadline} status={r.status} />
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
                            <span className={`font-black ${r.isExpired ? 'text-gray-500' : BAR_TEXT[r.status] || 'text-gray-500'}`}>
                              {r.isExpired && !['REJECTED', 'CANCELLED', 'RETURNED'].includes(r.status) ? 'EXPIRED (VOID)' : r.status}
                            </span>
                            <span>•</span><span>{r.items?.length || 0} items</span>
                            {timeRange ? (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                  <CalendarClock size={10} className="flex-shrink-0" />{timeRange}
                                </span>
                              </>
                            ) : r.return_deadline ? (
                              <><span>•</span><span className="flex items-center gap-1 text-gray-600 font-medium"><Clock size={10} />Due {fmtDateTimeFull(r.return_deadline)}</span></>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                        {['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired && (
                          <div className="hidden sm:flex gap-2">
                            <button disabled={isRoomLocked} onClick={e => handleApproveClick(r, e)} className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 transition-colors"><Check size={14} />Approve</button>
                            <button disabled={isRoomLocked} onClick={e => handleReject(r.id, e)} className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"><X size={14} />Deny</button>
                          </div>
                        )}
                        <div className={`p-1.5 rounded-lg transition-colors ${isExpanded ? 'bg-gray-100 text-gray-900' : 'text-gray-400 group-hover:text-gray-600'}`}>
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (() => {
                      const reqTypeLabel = getRequestTypeLabel(r);
                      const slotTime     = getSlotTime(r);
                      return (
                        <div className="border-t border-black/5 p-5 grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50/80 shadow-inner animate-in slide-in-from-top-2 duration-200">
                          <div className="bg-white p-4 rounded-xl border border-black/5 text-sm space-y-2 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Request Details</span>
                              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-700">{reqTypeLabel}</span>
                            </div>
                            <p><strong>Purpose:</strong> <span className="text-gray-700">{r.purpose || '—'}</span></p>
                            <p><strong>Submitted:</strong> <span className="text-gray-700">{r.created_at ? fmtDateTimeFull(r.created_at) : '—'}</span></p>
                            {slotTime && (
                              <div className="flex items-center gap-2 flex-wrap pt-1">
                                <strong>Scheduled:</strong>
                                <span className="flex items-center gap-1 text-blue-700 font-bold bg-blue-50 px-2 py-1 rounded-lg text-xs border border-blue-200 shadow-sm">
                                  <CalendarClock size={12} />{fmtDateTimeFull(slotTime)}
                                </span>
                                {r.return_deadline && (
                                  <>
                                    <span className="text-gray-400 text-xs">→</span>
                                    <span className="flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded-lg text-xs border border-emerald-200 shadow-sm">
                                      {fmtDateTimeFull(r.return_deadline)}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                            {!slotTime && r.return_deadline && (
                               <p><strong>Deadline:</strong> <span className="text-gray-700">{fmtDateTimeFull(r.return_deadline)}</span></p>
                            )}
                            
                            <div className="sm:hidden pt-4 mt-4 border-t border-black/5 flex gap-2">
                               {['PENDING', 'PENDING APPROVAL'].includes(r.status) && !r.isExpired && (
                                <>
                                  <button disabled={isRoomLocked} onClick={e => handleApproveClick(r, e)} className="flex-1 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800">Approve</button>
                                  <button disabled={isRoomLocked} onClick={e => handleReject(r.id, e)} className="flex-1 px-3 py-2 rounded-lg text-xs font-bold bg-red-100 text-red-700">Deny</button>
                                </>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Package size={12} /> Requested Equipment</p>
                            <div className="space-y-2">
                              {r.items?.map((item, i) => (
                                <div key={i} className="flex justify-between items-center text-sm bg-white p-3 rounded-xl border border-black/5 shadow-sm">
                                  <div>
                                    <p className="font-bold text-gray-800">{item.item_name}</p>
                                    {item.item_status && <span className={`text-[10px] font-bold uppercase mt-0.5 inline-block ${item.item_status === 'RETURNED' ? 'text-emerald-600' : 'text-amber-600'}`}>{item.item_status}</span>}
                                  </div>
                                  <span className="font-black text-primary bg-primary/10 px-2.5 py-1 rounded-lg self-start">×{item.quantity || item.qty_requested}</span>
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
          /* ── MODE 2: CALENDAR VIEW ── */
          <div className="flex-1 bg-gray-50 p-4 md:p-6 overflow-hidden">
            <div className="w-full h-full bg-white rounded-2xl shadow-sm border border-black/10 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
              <AvailabilityCalendar 
                roomId={user?.room_id} 
                onDateSelect={handleCalendarDateSelect}
                selectedDate={selectedDate}
                requestCountByDate={requestCountByDate} 
              />
            </div>
          </div>
        )}

      </div>

      {/* ════ MODALS ═════════════════════════════════════════════════════════ */}

      <NeumorphModal open={cameraModal} onClose={() => setCameraModal(false)} title="Scan Request QR Code">
        {cameraModal && <QrCameraScanner onResult={handleQR} />}
      </NeumorphModal>

      <NeumorphModal open={approveModal} onClose={() => setApproveModal(false)} title={`Approve Reservation #${approveReq?.id}`} size="md">
        <div className="space-y-5">
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl shadow-sm">
            <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><CalendarClock size={14}/> Reservation Details</h3>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <p><span className="font-bold text-blue-800">Borrower:</span> <span className="text-blue-900">{approveReq?.requester_name || approveReq?.student_id}</span></p>
              <p><span className="font-bold text-blue-800">Scheduled Pickup:</span> <span className="text-blue-900">{fmtDateTimeFull(approveReq?.pickup_datetime || approveReq?.pickup_start)}</span></p>
              {approveReq?.return_deadline && (
                <p><span className="font-bold text-emerald-700">Expected Return:</span> <span className="text-emerald-900">{fmtDateTimeFull(approveReq.return_deadline)}</span></p>
              )}
            </div>
            {approveReq?.requester_email && (
               <p className="text-[10px] text-blue-600 mt-3 font-medium">
                 An automated confirmation email will be sent to {approveReq.requester_email}.
               </p>
            )}
          </div>

          <div className="flex gap-3 pt-2 border-t border-black/5">
            <NeumorphButton variant="outline" className="flex-1 py-3 font-bold" onClick={() => setApproveModal(false)}>Cancel</NeumorphButton>
            <NeumorphButton variant="primary" className="flex-1 py-3 font-black shadow-md shadow-primary/30 bg-emerald-500 border-emerald-600 hover:bg-emerald-600" onClick={() => handleApproveSubmit(approveReq?.id, approveReq?.requester_email)}>
              <Check size={16} className="mr-1.5" /> Confirm Approval
            </NeumorphButton>
          </div>
        </div>
      </NeumorphModal>

      <NeumorphModal open={issueModal} onClose={() => setIssueModal(false)} title={`Issue Request #${selectedReq?.id}`} size="lg">
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
            <div className="flex gap-2 mb-3">
              <button onClick={() => { setIssueDate(getPHTDateString(new Date())); setIssueTime(getPHTTimeString(addHours(new Date(), 1))); }} className="text-[10px] font-bold bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg transition-colors border border-primary/20">+1 Hour</button>
              <button onClick={() => { setIssueDate(getPHTDateString(new Date())); setIssueTime('17:00'); }} className="text-[10px] font-bold bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg transition-colors border border-primary/20">End of Day (5 PM)</button>
              <button onClick={() => { setIssueDate(getPHTDateString(startOfTomorrow())); setIssueTime('08:00'); }} className="text-[10px] font-bold bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg transition-colors border border-primary/20">Tomorrow Morning</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Custom Date</label>
                <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="neu-input w-full text-sm py-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:p-1 [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Custom Time</label>
                <input type="time" value={issueTime} onChange={e => setIssueTime(e.target.value)} className="neu-input w-full text-sm py-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:p-1 [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Scan size={14} /> Step 2: Verify Physical Items</h3>
            <div className="relative mb-3">
              <NeumorphInput placeholder="Manual search by name or barcode…" value={itemSearch} onChange={e => setItemSearch(e.target.value)} icon={<Search size={14} />} className="w-full" />
              {itemSearch && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-black/10 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                  {inventory.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase())).slice(0, 8).map(inv => (
                    <button key={inv.id} onClick={() => { addToModal(inv, setAdjustedItems); setItemSearch(''); }} className="w-full text-left px-4 py-2.5 hover:bg-primary/5 border-b border-black/5 flex justify-between items-center text-sm">
                      <span className="font-medium">{inv.name}</span><Plus size={13} className="text-primary" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
              {adjustedItems.map(item => <ItemRow key={item.id} item={item} inventory={inventory} setFn={setAdjustedItems} />)}
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t border-black/5">
            <NeumorphButton variant="outline" className="flex-1 py-3 font-bold" onClick={() => setIssueModal(false)}>Cancel</NeumorphButton>
            <NeumorphButton variant="primary" className="flex-1 py-3 font-black shadow-md shadow-primary/30" onClick={handleIssue} loading={issuing} disabled={!isReadyToIssue || !!timeToOpen}>
              {timeToOpen ? <span className="flex items-center justify-center gap-2"><Timer size={16} /> {timeToOpen}</span> : <><Package size={16} className="mr-1.5" /> Lock & Issue Items</>}
            </NeumorphButton>
          </div>
        </div>
      </NeumorphModal>

      <NeumorphModal open={manualModal} onClose={() => setManualModal(false)} title="Process Walk-in / Direct Issue" size="lg">
        <div className="space-y-5">
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-sm text-amber-800 font-medium flex items-start gap-2">
            <Zap size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div><strong className="font-black">Walk-in Transaction:</strong> Items added here will skip the queue and instantly be marked as 'Issued'.</div>
          </div>

          <div className="bg-white border border-black/10 p-4 rounded-xl space-y-3 shadow-sm">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5"><UserCheck size={12}/> Borrower Info</h3>
            <div className="grid grid-cols-2 gap-3">
              <NeumorphInput label="User ID (Student/Faculty)" placeholder="e.g. 2021-00001" value={manualForm.studentId} onChange={e => setManualForm({ ...manualForm, studentId: e.target.value })} autoFocus />
              <NeumorphInput label="Purpose" value={manualForm.purpose} onChange={e => setManualForm({ ...manualForm, purpose: e.target.value })} />
            </div>
          </div>

          <div className="bg-white border border-black/10 p-4 rounded-xl space-y-3 shadow-sm">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><Timer size={12}/> Expected Return Deadline</h3>
            <div className="flex gap-2 mb-3">
              <button onClick={() => { setManualForm(f => ({ ...f, retDate: getPHTDateString(new Date()), retTime: getPHTTimeString(addHours(new Date(), 1)) })); }} className="text-[10px] font-bold bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg transition-colors border border-primary/20">+1 Hour</button>
              <button onClick={() => { setManualForm(f => ({ ...f, retDate: getPHTDateString(new Date()), retTime: '17:00' })); }} className="text-[10px] font-bold bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg transition-colors border border-primary/20">End of Day (5 PM)</button>
              <button onClick={() => { setManualForm(f => ({ ...f, retDate: getPHTDateString(startOfTomorrow()), retTime: '08:00' })); }} className="text-[10px] font-bold bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg transition-colors border border-primary/20">Tomorrow Morning</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Custom Date</label>
                <input type="date" value={manualForm.retDate} onChange={e => setManualForm({...manualForm, retDate: e.target.value})} className="neu-input w-full text-sm py-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:p-1 [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Custom Time</label>
                <input type="time" value={manualForm.retTime} onChange={e => setManualForm({...manualForm, retTime: e.target.value})} className="neu-input w-full text-sm py-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:p-1 [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Scan size={12}/> Scan Items to Issue</h3>
            <div className="relative mb-3">
              <NeumorphInput placeholder="Search inventory or scan barcode..." value={manualForm.search} onChange={e => setManualForm({ ...manualForm, search: e.target.value })} icon={<Search size={14} />} className="w-full" />
              {manualForm.search && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-black/10 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                  {inventory.filter(i => i.name.toLowerCase().includes(manualForm.search.toLowerCase())).slice(0, 8).map(inv => (
                    <button key={inv.id} onClick={() => { addToModal(inv, setManualItems); setManualForm(f => ({ ...f, search: '' })); }} className="w-full text-left px-4 py-2.5 hover:bg-primary/5 border-b border-black/5 flex justify-between items-center text-sm">
                      <span className="font-medium">{inv.name}</span><Plus size={13} className="text-primary" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar">
              {manualItems.length === 0 ? (
                <div className="py-8 text-center border-2 border-dashed border-black/10 rounded-xl text-muted text-xs">No items — scan or search above.</div>
              ) : manualItems.map(item => <ItemRow key={item.id} item={item} inventory={inventory} setFn={setManualItems} />)}
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t border-black/5">
            <NeumorphButton variant="outline" className="flex-1 py-3 font-bold" onClick={() => setManualModal(false)}>Cancel</NeumorphButton>
            <NeumorphButton variant="primary" className="flex-1 py-3 font-black shadow-md" onClick={handleManualSync} loading={issuing} disabled={!isManualReady}>
              <Zap size={16} className="mr-1.5" /> Complete Walk-in Issue
            </NeumorphButton>
          </div>
        </div>
      </NeumorphModal>
    </div>
  );
}