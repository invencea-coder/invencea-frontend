// src/pages/shared/NewRequest.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, Trash2, Calendar, ArrowRight, AlertTriangle,
  X, DoorClosed, Package, CheckCircle, CheckCircle2,
  CalendarRange, Timer, MapPin, Info,
  Clock, ShoppingBag, Camera, CalendarClock, ChevronDown, ChevronUp, Mail,
  CalendarDays, Sparkles, Lightbulb
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';
import api from '../../api/axiosClient';
import { listInventory } from '../../api/inventoryAPI';
import { createRequest } from '../../api/requestAPI';
import NeumorphCard from '../../components/ui/NeumorphCard';
import NeumorphButton from '../../components/ui/NeumorphButton';
import NeumorphInput from '../../components/ui/NeumorphInput';
import AvailabilityCalendar from '../../components/AvailabilityCalendar';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';

const toPHTime = (d) => {
  if (!d) return null;
  let str = typeof d === 'string' ? d : String(d);
  if (str.includes('T') && !str.endsWith('Z') && !str.includes('+') && !str.includes('-', 10)) str += 'Z';
  return new Date(str);
};
const fmtTimePH     = (d) => { if (!d) return null; try { return toPHTime(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true }); } catch { return null; } };
const fmtDatePH     = (d) => { if (!d) return null; try { return toPHTime(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }); } catch { return null; } };
const fmtDateLongPH = (d) => { if (!d) return null; try { return toPHTime(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }); } catch { return null; } };

const PURPOSES = [
  'Laboratory Activity', 'Class Demonstration / Instruction', 'Thesis / Capstone Project',
  'Course Project / Assignment', 'Research / Development', 'Field Work / Surveying',
  'Event / Competition', 'Other',
];

const TYPE_CFG = [
  { id: 'slot',  Icon: Clock,         label: 'Reserve Time Slot', sub: 'For a specific class time today or later.', ring: 'border-violet-400 bg-violet-50 shadow-md', icon: 'bg-violet-500 text-white', badge: 'bg-violet-100 text-violet-800' },
  { id: 'range', Icon: CalendarRange, label: 'Multiple Days',     sub: 'For thesis, field work, or long projects.', ring: 'border-teal-400 bg-teal-50 shadow-md',   icon: 'bg-teal-500 text-white',   badge: 'bg-teal-100 text-teal-800'   },
];

const StepBadge   = ({ n }) => <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[11px] font-black flex-shrink-0 shadow-sm">{n}</span>;
const SectionHead = ({ step, label, className = '' }) => (
  <div className={`flex items-center gap-2 mb-4 ${className}`}>
    {step && <StepBadge n={step} />}
    <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">{label}</h3>
  </div>
);

export default function NewRequest() {
  const { user } = useAuth();
  const initialRoom = useMemo(() =>
    user?.room_id && user.room_id !== 'null' && user.room_id !== 'undefined' ? String(user.room_id) : '',
  [user?.room_id]);

  // ── View mode ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'reserve'

  const [availableRooms, setAvailableRooms]   = useState([]);
  const [selectedRoomId, setSelectedRoomId]   = useState('');
  const [inventory, setInventory]             = useState([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [refreshTrigger, setRefreshTrigger]   = useState(0);

  const [resType, setResType]       = useState('slot');
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd]     = useState('');

  const [cart, setCart]                   = useState([]);
  const [purpose, setPurpose]             = useState('');
  const [customPurpose, setCustomPurpose] = useState('');
  const [email, setEmail]                 = useState(user?.email || '');
  const [submitting, setSubmitting]       = useState(false);
  const [successData, setSuccessData]     = useState(null);
  const [confirmClose, setConfirmClose]   = useState(false);

  const [calendarSelectedDate, setCalendarSelectedDate] = useState(null);

  const todayISO        = useMemo(() => new Date().toISOString().split('T')[0], []);
  const loadCooldownRef    = useRef(false);
  const selectedRoomIdRef  = useRef(selectedRoomId);

  useEffect(() => { if (initialRoom && !selectedRoomId) setSelectedRoomId(initialRoom); }, [initialRoom]);
  useEffect(() => { selectedRoomIdRef.current = selectedRoomId; }, [selectedRoomId]);

  useEffect(() => {
    api.get('/rooms').catch(() => api.get('/admin/rooms'))
      .then(res => setAvailableRooms(res.data?.data || res.data || []))
      .catch(() => toast.error('Could not load rooms'));

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('room-updated', data =>
      setAvailableRooms(prev => prev.map(r =>
        String(r.id) === String(data.roomId) ? { ...r, is_available: data.is_available, unavailable_reason: data.reason } : r
      ))
    );
    socket.on('inventory-updated', (payload) => {
      // Only refresh if the event is for the room this user is currently viewing.
      // payload.room_id is the room that changed; selectedRoomIdRef holds the live value
      // without needing the socket to reconnect every time the user picks a different room.
      const eventRoom = payload?.room_id || payload?.roomId;
      if (eventRoom && String(eventRoom) !== String(selectedRoomIdRef.current)) return;
      if (loadCooldownRef.current) return;
      loadCooldownRef.current = true;
      setRefreshTrigger(p => p + 1);
      setTimeout(() => { loadCooldownRef.current = false; }, 5000);
    });
    return () => socket.disconnect();
  }, []);

  const currentRoom  = useMemo(() => availableRooms.find(r => String(r.id) === String(selectedRoomId)), [availableRooms, selectedRoomId]);
  const isRoomClosed = !!(currentRoom && !currentRoom.is_available);

  // ── INVENTORY FOLDER LOGIC (Aligned with Admin UI) ──
  const fetchInv = useCallback(async () => {
    if (!selectedRoomId || isRoomClosed) { setInventory([]); return; }
    try {
      const res  = await listInventory({ room_id: selectedRoomId });
      const data = res.data?.data || {};

      // 1. Group Unit Mode Items (Laptops, Meters) into Category Folders
      const unitsMap = (data.items || []).reduce((acc, i) => {
        const tid = i.inventory_type_id;
        if (!acc[tid]) {
          acc[tid] = { ...i, kind: 'borrowable', inventory_mode: 'unit', _avail: 0, _total: 0 };
        }
        acc[tid]._total += 1;
        if (i.status === 'available') acc[tid]._avail += 1;
        return acc;
      }, {});
      const units = Object.values(unitsMap);

      // 2. Map Consumables
      const consumables = (data.consumables || []).map(i => ({
        ...i, kind: 'consumable', inventory_mode: 'unit',
        _avail: i.quantity_available || 0,
        _total: i.quantity_total || 0
      }));

      // 3. Map Quantity Items (Batch mode)
      const qtyItems = (data.quantityItems || []).map(i => ({
        ...i, kind: 'quantity', inventory_mode: 'quantity',
        _avail: i.qty_available || 0,
        _total: i.qty_total || 0
      }));

      const fresh = [...units, ...consumables, ...qtyItems].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setInventory(fresh);

      // Sanitize Cart against live stock limits
      setCart(prev => prev.map(c => {
        const f = fresh.find(i => i.kind === c.kind && i.inventory_type_id === c.inventory_type_id && i.stock_id === c.stock_id);
        if (!f) return null; // Item removed from DB
        if (c.req_qty > f._avail) return { ...c, req_qty: f._avail }; // Cap to max available
        return c;
      }).filter(c => c && c.req_qty > 0));

    } catch { toast.error('Failed to load inventory'); }
  }, [selectedRoomId, isRoomClosed]);

  useEffect(() => { fetchInv(); }, [fetchInv, refreshTrigger]);

  const filteredInventory = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    return q ? inventory.filter(i => i.name?.toLowerCase().includes(q)) : inventory;
  }, [inventory, inventorySearch]);

  // ── Calendar handlers ──────────────────────────────────────────────────────
  const handleCalendarDateSelect = useCallback((dateStr) => {
    if (!dateStr) { setCalendarSelectedDate(null); return; }
    setCalendarSelectedDate(prev => prev === dateStr ? null : dateStr);
  }, []);

  const handleReserveOnDate = useCallback((dateStr) => {
    if (!dateStr) return;
    setPickupDate(dateStr);
    setResType('slot');
    setViewMode('reserve');
    toast.success(`Date pre-filled: ${dateStr}`, { icon: '📅', duration: 2000 });
  }, []);

  // ── Cart helpers ───────────────────────────────────────────────────────────
  const addToCart = item => {
    if (isRoomClosed || item._avail <= 0) return;
    
    // Find existing item in cart
    const ex = cart.find(c => c.kind === item.kind && c.inventory_type_id === item.inventory_type_id && c.stock_id === item.stock_id);
    
    if (ex) {
      if (ex.req_qty >= item._avail) return toast.error(`Only ${item._avail} units available.`);
      setCart(cart.map(c => c === ex ? { ...c, req_qty: c.req_qty + 1 } : c));
      toast.success(`Increased ${item.name} quantity`);
    } else {
      setCart([...cart, { ...item, req_qty: 1 }]);
      toast.success(`${item.name} added`);
    }
  };

  const updateCartField = (val, item) => {
    const qty = parseInt(val) || 0;
    if (qty <= 0) {
      removeFromCart(item);
      return;
    }
    setCart(cart.map(c => c.kind === item.kind && c.inventory_type_id === item.inventory_type_id && c.stock_id === item.stock_id ? { ...c, req_qty: Math.min(qty, item._avail) } : c));
  };

  const removeFromCart = item => {
    setCart(cart.filter(c => !(c.kind === item.kind && c.inventory_type_id === item.inventory_type_id && c.stock_id === item.stock_id)));
  };

  // ── Computed display ───────────────────────────────────────────────────────
  const pickupWindow = useMemo(() => {
    if (resType !== 'slot' || !pickupDate || !pickupTime) return null;
    const start = new Date(`${pickupDate}T${pickupTime}`);
    const end   = new Date(start.getTime() + 15 * 60000);
    return { start, end, display: `${fmtDateLongPH(start)} · ${fmtTimePH(start)} – ${fmtTimePH(end)}`, isPast: start <= new Date() };
  }, [resType, pickupDate, pickupTime]);

  const rangeSummary = useMemo(() => {
    if (resType !== 'range') return null;
    const fmt = s => fmtDatePH(new Date(s + 'T00:00:00')) || s;
    if (rangeStart && rangeEnd) return `${fmt(rangeStart)} → ${fmt(rangeEnd)}`;
    if (rangeStart) return `From ${fmt(rangeStart)} — please pick an end date`;
    return null;
  }, [resType, rangeStart, rangeEnd]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (isRoomClosed)      return toast.error('This room is currently closed.');
    if (!selectedRoomId)   return toast.error('Please select a room.');
    if (cart.length === 0) return toast.error('You must add at least one item to your list.');
    const finalPurpose = purpose === 'Other' ? customPurpose.trim() : purpose;
    if (!finalPurpose)     return toast.error('Please tell us the purpose of this request.');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) return toast.error('Please provide a valid email address.');
    if (resType === 'slot' && (!pickupDate || !pickupTime)) return toast.error('Please set a date and time for pickup.');
    if (resType === 'slot' && pickupWindow?.isPast) return toast.error('Your pickup time has already passed. Please choose a future time.');
    if (resType === 'range' && (!rangeStart || !rangeEnd)) return toast.error('Please select both a start and end date.');

    setSubmitting(true);
    try {
      const payload = {
        room_id: selectedRoomId, purpose: finalPurpose, email,
        // Map the req_qty dynamically based on the inventory mode logic of the backend
        items: cart.map(c => {
          if (c.inventory_mode === 'quantity') {
            return { inventory_type_id: c.inventory_type_id, stock_id: c.stock_id, qty_requested: c.req_qty };
          }
          if (c.kind === 'consumable') {
            return { inventory_type_id: c.inventory_type_id, consumable_id: c.id || c.item_id, quantity: c.req_qty };
          }
          // Unit Mode (Laptops, etc) -> Send requested quantity, backend handles assignment
          return { inventory_type_id: c.inventory_type_id, quantity: c.req_qty };
        }),
      };
      if (resType === 'slot')  payload.pickup_datetime = `${pickupDate}T${pickupTime}:00+08:00`;
      if (resType === 'range') { payload.pickup_start = `${rangeStart}T08:00:00+08:00`; payload.pickup_end = `${rangeEnd}T22:00:00+08:00`; }
      
      const res = await createRequest(payload);
      setSuccessData(res.data.data || res.data);
      toast.success('Successfully submitted!');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to submit request.'); }
    finally { setSubmitting(false); }
  };

  const resetAll = useCallback(() => {
    setSuccessData(null); setConfirmClose(false); setCart([]); setPurpose(''); setCustomPurpose('');
    setResType('slot'); setPickupDate(''); setPickupTime(''); setRangeStart(''); setRangeEnd('');
    setInventorySearch(''); setCalendarSelectedDate(null); setViewMode('calendar');
    if (!initialRoom) setSelectedRoomId('');
  }, [initialRoom]);

  // ── Sub-components ─────────────────────────────────────────────────────────
  const parseMeta = (raw) => { try { return typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch { return {}; } };

  // ── Sub-components ─────────────────────────────────────────────────────────
  const InvRow = ({ item }) => {
    const badge  = item.inventory_mode === 'quantity' ? { cls: 'bg-violet-100 text-violet-700', label: 'Batch' } : item.kind === 'consumable' ? { cls: 'bg-amber-100 text-amber-700', label: 'Consumable' } : { cls: 'bg-blue-100 text-blue-700', label: 'Unit' };
    const sub    = `${item._avail} avail / ${item._total} total`;
    const inCart = cart.some(c => c.kind === item.kind && c.inventory_type_id === item.inventory_type_id && c.stock_id === item.stock_id);
    const disabled = item._avail <= 0;
    
    // Extract metadata for Thesis display
    const meta = parseMeta(item.type_metadata || item.metadata);

    return (
      <div className={`flex items-center justify-between p-3.5 border rounded-xl transition-all group ${disabled ? 'opacity-50 grayscale bg-gray-50 cursor-not-allowed' : inCart ? 'bg-primary/5 border-primary/30 cursor-pointer' : 'bg-white border-black/10 hover:border-primary/40 hover:shadow-md cursor-pointer'}`} onClick={() => !disabled && addToCart(item)}>
        <div className="flex-1 min-w-0 mr-3">
          <p className={`font-black text-sm line-clamp-2 transition-colors ${disabled ? 'text-gray-500' : 'text-gray-800 group-hover:text-primary'}`} title={item.name}>{item.name}</p>
          
          {/* Automatically show Authors and Year if it's the Thesis Room */}
          {selectedRoomId === '3' && meta.authors && (
            <p className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">
              {meta.authors} <span className="font-mono text-blue-500 font-bold ml-1">({meta.year})</span>
            </p>
          )}
          
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${badge.cls}`}>{badge.label}</span>
            <span className={`text-[11px] font-medium ${item._avail > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{sub}</span>
          </div>
        </div>
        <button disabled={disabled} className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl transition-all ${inCart ? 'bg-primary text-white' : disabled ? 'bg-gray-200 text-gray-400' : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white'}`}>
          {inCart ? <CheckCircle size={16} /> : <Plus size={18} />}
        </button>
      </div>
    );
  };

  const CartRow = ({ item }) => {
    const meta = parseMeta(item.type_metadata || item.metadata);
    return (
      <div className="flex items-center gap-3 p-3 bg-white border border-black/10 rounded-xl shadow-sm">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 line-clamp-1" title={item.name}>{item.name}</p>
          {selectedRoomId === '3' && meta.year && <p className="text-[9px] text-gray-500 mt-0.5 font-medium">Published: {meta.year}</p>}
        </div>
        <div className="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded-lg border border-black/5">
          <span className="text-[10px] font-bold text-gray-500 uppercase">Qty</span>
          <input 
            type="number" min="1" max={item._avail} 
            value={item.req_qty} 
            onChange={e => updateCartField(parseInt(e.target.value), item)} 
            className="w-12 bg-transparent text-center text-sm font-black text-primary outline-none" 
          />
        </div>
        <button onClick={() => removeFromCart(item)} className="p-2 text-red-400 hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors flex-shrink-0"><Trash2 size={16} /></button>
      </div>
    );
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gray-50/50">

      {/* ── TOP BAR ── */}
      <div className="bg-white border-b border-black/10 px-4 md:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between shadow-sm z-10 gap-3 flex-shrink-0">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center hidden sm:flex shrink-0">
            <CalendarRange size={20} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base md:text-lg font-black text-gray-800 leading-tight">Equipment Reservation</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <MapPin size={12} className="text-primary flex-shrink-0" />
              <select
                className="bg-transparent text-xs font-bold text-gray-600 outline-none cursor-pointer w-full text-ellipsis"
                value={selectedRoomId}
                onChange={e => { setSelectedRoomId(e.target.value); setCart([]); }}
                disabled={!!initialRoom}>
                <option value="" disabled>— Select Room First —</option>
                {availableRooms.map(r => (
                  <option key={r.id} value={r.id}>{r.is_available ? '🟢' : '🔴'} {r.name || r.code}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 w-full sm:w-auto justify-end">
          {/* Cart badge — visible in calendar mode when items added */}
          {viewMode === 'calendar' && cart.length > 0 && (
            <button onClick={() => setViewMode('reserve')}
              className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-xl text-xs font-black shadow-md shadow-primary/20 animate-in fade-in duration-200">
              <ShoppingBag size={14} />
              {cart.length} item{cart.length !== 1 ? 's' : ''} ready
              <ArrowRight size={12} />
            </button>
          )}
          {/* View toggle */}
          <div className="flex bg-gray-100 p-1 rounded-xl border border-black/5">
            <button onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === 'calendar' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <CalendarDays size={14} /> Schedule
            </button>
            <button onClick={() => setViewMode('reserve')} disabled={!selectedRoomId}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black transition-all disabled:opacity-40 ${viewMode === 'reserve' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <ShoppingBag size={14} /> Reserve Items
            </button>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ════ CALENDAR VIEW ════ */}
        {viewMode === 'calendar' && (
          <div className="flex flex-col h-full">
            {!selectedRoomId ? (
              <div className="flex flex-col items-center justify-center h-full py-20 px-4 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4"><MapPin size={32} className="text-gray-400" /></div>
                <h3 className="text-xl font-black text-gray-700">Where are you borrowing from?</h3>
                <p className="text-sm text-gray-500 mt-2 max-w-sm">Select a room above to view the equipment schedule.</p>
              </div>
            ) : isRoomClosed ? (
              <div className="max-w-3xl mx-auto p-4 md:p-8 pt-12">
                <NeumorphCard className="p-6 flex flex-col sm:flex-row items-center gap-4 bg-red-50 border-2 border-red-200">
                  <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0"><DoorClosed size={28} className="text-red-500" /></div>
                  <div className="text-center sm:text-left">
                    <p className="font-black text-red-800 text-lg">This room is currently closed</p>
                    <p className="text-sm text-red-600 mt-1 font-medium">"{currentRoom.unavailable_reason || 'No reason provided.'}"</p>
                  </div>
                </NeumorphCard>
              </div>
            ) : (
              <div className="flex flex-col h-full p-4 md:p-6 gap-3">

                {/* Dual info strip */}
                <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                  <div className="flex-1 flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                    <Sparkles size={15} className="text-primary flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-primary font-semibold leading-relaxed">
                      Click any date to see existing bookings. Then hit <strong>"Reserve on this date"</strong> to jump into booking.
                    </p>
                  </div>
                  <div className="flex-1 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <Lightbulb size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 font-semibold leading-relaxed">
                      Use the <strong>🔍 Magic Filter</strong> inside the calendar to search when a specific item is in use — matching dates highlight in amber.
                    </p>
                  </div>
                </div>

                {/* Full-width calendar — takes all remaining space */}
                <div className="flex-1 bg-white rounded-2xl shadow-sm border border-black/10 overflow-hidden min-h-0">
                  <AvailabilityCalendar
                    roomId={selectedRoomId}
                    onDateSelect={handleCalendarDateSelect}
                    selectedDate={calendarSelectedDate}
                  />
                </div>

                {/* Floating action bar — only when a date is selected */}
                {calendarSelectedDate && (
                  <div className="flex-shrink-0 flex items-center justify-between gap-4 bg-white border border-primary/20 rounded-xl px-5 py-3 shadow-md animate-in slide-in-from-bottom-2 duration-200">
                    <div className="flex items-center gap-3 min-w-0">
                      <CalendarDays size={18} className="text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selected date</p>
                        <p className="text-sm font-black text-gray-800 truncate">
                          {new Date(calendarSelectedDate + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => setCalendarSelectedDate(null)} className="text-xs font-bold text-gray-400 hover:text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                        Clear
                      </button>
                      <button
                        onClick={() => handleReserveOnDate(calendarSelectedDate)}
                        className="flex items-center gap-2 py-2.5 px-5 bg-primary text-white rounded-xl text-sm font-black shadow-md shadow-primary/20 hover:bg-primary/90 transition-all hover:-translate-y-0.5">
                        <CalendarClock size={15} /> Reserve on this date <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════ RESERVE FORM ════ */}
        {viewMode === 'reserve' && (
          <>
            {!selectedRoomId ? (
              <div className="flex flex-col items-center justify-center h-full py-20 px-4 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4"><MapPin size={32} className="text-gray-400" /></div>
                <h3 className="text-xl font-black text-gray-700">Where are you borrowing from?</h3>
                <p className="text-sm text-gray-500 mt-2 max-w-sm">Please select a room from the dropdown in the top bar.</p>
              </div>
            ) : isRoomClosed ? (
              <div className="max-w-3xl mx-auto p-4 md:p-8 pt-12">
                <NeumorphCard className="p-6 flex flex-col sm:flex-row items-center gap-4 bg-red-50 border-2 border-red-200">
                  <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0"><DoorClosed size={28} className="text-red-500" /></div>
                  <div className="text-center sm:text-left">
                    <p className="font-black text-red-800 text-lg">This room is currently closed</p>
                    <p className="text-sm text-red-600 mt-1 font-medium">"{currentRoom.unavailable_reason || 'No reason provided.'}"</p>
                  </div>
                </NeumorphCard>
              </div>
            ) : (
              <div className="max-w-6xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pb-20">

                {/* LEFT: Form steps */}
                <div className="lg:col-span-7 flex flex-col gap-6">

                  {/* Step 1 — Type */}
                  <NeumorphCard className="p-5 md:p-6 border-t-4 border-t-primary shadow-md">
                    <SectionHead step={1} label="Reservation Type" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {TYPE_CFG.map(({ id, Icon, label, sub, ring, icon, badge }) => {
                        const active = resType === id;
                        return (
                          <button key={id}
                            onClick={() => { setResType(id); setPickupDate(''); setPickupTime(''); setRangeStart(''); setRangeEnd(''); }}
                            className={`flex flex-col items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ${active ? ring : 'border-black/5 bg-white hover:border-black/20 hover:bg-gray-50'}`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${active ? icon : 'bg-gray-100 text-gray-400'}`}><Icon size={20} /></div>
                            <div>
                              <p className={`text-sm font-black leading-tight ${active ? 'text-gray-900' : 'text-gray-700'}`}>{label}</p>
                              <p className={`text-[11px] leading-snug mt-1 ${active ? 'text-gray-700' : 'text-gray-500'}`}>{sub}</p>
                            </div>
                            {active && <span className={`mt-auto text-[10px] font-black px-2.5 py-1 rounded-full ${badge}`}>Selected</span>}
                          </button>
                        );
                      })}
                    </div>
                  </NeumorphCard>

                  {/* Step 2 — Slot */}
                  {resType === 'slot' && (
                    <NeumorphCard className="p-5 md:p-6 shadow-md border border-black/5 animate-in slide-in-from-top-4 duration-300">
                      <SectionHead step={2} label="Select Date & Time" />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="text-xs font-bold text-gray-600 uppercase block mb-1.5">Date</label>
                          <input type="date" min={todayISO} value={pickupDate} onChange={e => setPickupDate(e.target.value)} className="neu-input w-full text-base py-3 cursor-pointer" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-600 uppercase block mb-1.5">Time</label>
                          <input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} className="neu-input w-full text-base py-3 cursor-pointer" />
                        </div>
                      </div>
                      {pickupWindow ? (
                        pickupWindow.isPast ? (
                          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                            <div className="bg-red-200 p-2 rounded-full flex-shrink-0"><AlertTriangle size={16} className="text-red-700" /></div>
                            <div>
                              <p className="text-xs font-black text-red-700 uppercase tracking-wider">Pickup Time Has Passed</p>
                              <p className="text-sm font-bold text-red-900 mt-0.5">{pickupWindow.display}</p>
                              <p className="text-xs text-red-700 mt-1 font-medium">Please choose a future date and time.</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3 p-4 bg-violet-50 border border-violet-200 rounded-xl">
                            <div className="bg-violet-200 p-2 rounded-full flex-shrink-0"><Timer size={16} className="text-violet-800" /></div>
                            <div>
                              <p className="text-xs font-black text-violet-700 uppercase tracking-wider flex items-center gap-1.5"><CalendarClock size={11} /> Your Pickup Window (PHT)</p>
                              <p className="text-base font-black text-violet-900 mt-0.5">{pickupWindow.display}</p>
                              <p className="text-xs text-violet-700 mt-1 font-medium">Your QR code will only be valid during this exact 15-minute window.</p>
                            </div>
                          </div>
                        )
                      ) : (
                        <p className="text-xs text-gray-500 italic bg-gray-50 p-3 rounded-lg text-center">Please fill in both Date and Time to see your pickup window.</p>
                      )}
                    </NeumorphCard>
                  )}

                  {/* Step 2 — Range */}
                  {resType === 'range' && (
                    <NeumorphCard className="p-5 md:p-6 shadow-md border border-black/5 animate-in slide-in-from-top-4 duration-300">
                      <SectionHead step={2} label="Select Date Range" />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="text-xs font-bold text-gray-600 uppercase block mb-1.5">Start Date</label>
                          <input type="date" min={todayISO} value={rangeStart} onChange={e => { setRangeStart(e.target.value); if (rangeEnd && e.target.value > rangeEnd) setRangeEnd(''); }} className="neu-input w-full text-base py-3 cursor-pointer" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-600 uppercase block mb-1.5">End Date</label>
                          <input type="date" min={rangeStart || todayISO} value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} disabled={!rangeStart} className="neu-input w-full text-base py-3 cursor-pointer disabled:opacity-50" />
                        </div>
                      </div>
                      {rangeSummary ? (
                        <div className="flex items-center gap-3 p-4 bg-teal-50 border border-teal-200 rounded-xl">
                          <div className="bg-teal-200 p-2 rounded-full shrink-0"><CalendarRange size={16} className="text-teal-700" /></div>
                          <div>
                            <p className="text-xs font-black text-teal-700 uppercase tracking-wider">Items Held For</p>
                            <p className="text-base font-black text-teal-900">{rangeSummary}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 italic bg-gray-50 p-3 rounded-lg text-center">Please select both a Start and End date.</p>
                      )}
                    </NeumorphCard>
                  )}

                  {/* Step 3 — Equipment */}
                  <NeumorphCard className="p-5 md:p-6 shadow-md border border-black/5">
                    <SectionHead step={3} label="Select Equipment" />
                    <p className="text-xs text-gray-600 mb-4 font-medium">
                      Search for the items you need and click <strong className="text-primary bg-primary/10 px-1.5 py-0.5 rounded">+</strong> to add them. Use the quantity selector in your list to grab more than one!
                    </p>
                    <div className="relative mb-4">
                      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" placeholder="Type a category or item name..." className="neu-input w-full pl-11 text-base py-3.5 font-medium" value={inventorySearch} onChange={e => setInventorySearch(e.target.value)} />
                      {inventorySearch && <button onClick={() => setInventorySearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"><X size={18} /></button>}
                    </div>
                    <div className="grid grid-cols-1 gap-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                      {filteredInventory.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                          <Package size={40} className="mx-auto mb-3 text-gray-300" />
                          <p className="text-base font-bold text-gray-500">No items match your search</p>
                          <p className="text-xs mt-1">Try typing a different name.</p>
                        </div>
                      ) : filteredInventory.map(item => (
                        <InvRow key={`res-${item.kind}-${item.inventory_type_id}-${item.stock_id || ''}`} item={item} />
                      ))}
                    </div>
                  </NeumorphCard>
                </div>

                {/* RIGHT: Cart + Final details */}
                <div className="lg:col-span-5 flex flex-col gap-6 lg:sticky lg:top-6">

                  <NeumorphCard className="p-5 md:p-6 shadow-md border-t-4 border-t-gray-800 bg-gray-800 text-white">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                        <ShoppingBag size={16} className="text-primary" /> Your Selected Items
                      </h3>
                      <span className="text-xs font-black bg-primary text-white px-3 py-1 rounded-full shadow-sm">{cart.length}</span>
                    </div>
                    {cart.length === 0 ? (
                      <div className="py-10 text-center text-gray-400 bg-gray-900/50 rounded-xl border-2 border-dashed border-gray-700">
                        <p className="text-sm font-bold text-gray-300">Your list is empty.</p>
                        <p className="text-xs mt-1 text-gray-500">Select equipment from the left side.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar-dark">
                        {cart.map(item => <CartRow key={`cart-${item.kind}-${item.inventory_type_id}-${item.stock_id || ''}`} item={item} />)}
                      </div>
                    )}
                  </NeumorphCard>

                  <NeumorphCard className="p-5 md:p-6 shadow-md border border-black/5">
                    <SectionHead step={4} label="Final Details" />
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-gray-600 uppercase block mb-1.5">What is this request for?</label>
                        <select className="neu-input w-full text-base py-3.5 font-medium cursor-pointer" value={purpose} onChange={e => { setPurpose(e.target.value); if (e.target.value !== 'Other') setCustomPurpose(''); }}>
                          <option value="" disabled>— Tap to select a reason —</option>
                          {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        {purpose === 'Other' && (
                          <div className="mt-3 animate-in slide-in-from-top-2">
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Please specify:</label>
                            <NeumorphInput className="w-full text-base py-3" placeholder="Type your reason here..." value={customPurpose} onChange={e => setCustomPurpose(e.target.value)} autoFocus />
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-600 uppercase block mb-1.5 flex items-center gap-1.5">
                          <Mail size={14} className="text-gray-400" /> Notification Email
                        </label>
                        <NeumorphInput type="email" placeholder="Enter your email to receive updates" className="w-full text-base py-3" value={email} onChange={e => setEmail(e.target.value)} />
                        <p className="text-[10px] text-gray-500 mt-1">You will receive an email when your request is approved.</p>
                      </div>
                    </div>
                  </NeumorphCard>

                  <NeumorphButton
                    variant="primary"
                    className="w-full py-4 md:py-5 font-black text-lg shadow-xl shadow-primary/30 group"
                    onClick={handleSubmit}
                    loading={submitting}
                    disabled={cart.length === 0 || (resType === 'slot' && !!pickupWindow?.isPast)}>
                    Confirm Reservation
                    <CheckCircle size={20} className="ml-2 group-hover:scale-110 transition-transform" />
                  </NeumorphButton>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── SUCCESS MODAL ── */}
      {successData && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <NeumorphCard className="w-full max-w-md p-0 overflow-hidden text-center bg-white shadow-2xl">
            {!confirmClose ? (
              <>
                <div className="bg-green-500 text-white p-6 pb-8 text-center rounded-b-[40px] shadow-sm">
                  <div className="w-20 h-20 bg-white text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg"><CheckCircle2 size={40} /></div>
                  <h2 className="text-2xl font-black">Request Submitted!</h2>
                  <p className="text-sm font-medium mt-1 opacity-90">Request ID: #{successData.id}</p>
                  {(successData.pickup_datetime || successData.pickup_start) && (
                    <p className="text-xs font-bold mt-1.5 opacity-80 flex items-center justify-center gap-1.5">
                      <CalendarClock size={12} />
                      {resType === 'range'
                        ? `${fmtDatePH(successData.pickup_start)} → ${fmtDatePH(successData.pickup_end)}`
                        : `${fmtDateLongPH(successData.pickup_datetime)} · ${fmtTimePH(successData.pickup_datetime)}`}
                    </p>
                  )}
                </div>
                <div className="p-6 -mt-4 relative">
                  <div className="p-4 bg-white shadow-xl rounded-2xl inline-block mx-auto mb-4 border border-gray-100">
                    <QRCodeSVG value={successData.qr_code} size={180} />
                  </div>
                  <div className="bg-amber-50 border-2 border-amber-200 p-4 rounded-2xl text-left mb-6 shadow-sm">
                    <p className="font-black text-amber-900 text-sm flex items-center gap-2 mb-1">
                      <Camera size={18} className="text-amber-600 animate-pulse" /> TAKE A SCREENSHOT NOW
                    </p>
                    <p className="text-xs text-amber-800 font-medium leading-relaxed">
                      {resType === 'slot' ? 'Show this QR code to the Admin at the counter exactly during your 15-minute pickup window.' : 'Show this QR code to the Admin at the counter on your start date.'}
                    </p>
                  </div>
                  <NeumorphButton variant="primary" className="w-full py-4 text-base font-black" onClick={() => setConfirmClose(true)}>
                    I Have Saved My QR Code
                  </NeumorphButton>
                </div>
              </>
            ) : (
              <div className="p-8">
                <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle size={40} /></div>
                <h2 className="text-xl font-black text-gray-900 mb-2">Are you absolutely sure?</h2>
                <p className="text-sm text-gray-600 mb-8 font-medium">If you close this without taking a screenshot, your QR code will be lost and you will have to create a new request.</p>
                <div className="flex flex-col gap-3">
                  <NeumorphButton variant="outline" className="w-full py-4 font-bold border-gray-300 hover:bg-gray-50 text-gray-700" onClick={() => setConfirmClose(false)}>Go Back to QR Code</NeumorphButton>
                  <button className="text-sm font-bold text-red-500 hover:text-red-700 underline underline-offset-4 p-2" onClick={resetAll}>Yes, close and exit</button>
                </div>
              </div>
            )}
          </NeumorphCard>
        </div>
      )}
    </div>
  );
}