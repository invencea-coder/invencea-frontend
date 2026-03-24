// src/pages/shared/NewRequest.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, Trash2, Calendar, Clock, Users, ArrowRight,
  MapPin, CheckCircle2, AlertTriangle, X, DoorClosed, Package, Layers
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

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';

export default function NewRequest() {
  const { user } = useAuth();
  const isFaculty = user?.role === 'faculty';

  const initialRoom = user?.room_id && user.room_id !== 'null' && user.room_id !== 'undefined'
    ? String(user.room_id) : '';

  const [availableRooms, setAvailableRooms]     = useState([]);
  const [selectedRoomId, setSelectedRoomId]     = useState(initialRoom);
  const [inventory, setInventory]               = useState([]);
  const [inventorySearch, setInventorySearch]   = useState('');
  const [refreshTrigger, setRefreshTrigger]     = useState(0);
  const [cart, setCart]                         = useState([]);
  
  // Companions (Only used for Students now)
  const [companions, setCompanions]             = useState([]);
  
  // Purpose State
  const [purpose, setPurpose]                   = useState('');
  const [customPurpose, setCustomPurpose]       = useState(''); 
  
  const [submitting, setSubmitting]             = useState(false);
  const [scheduleType, setScheduleType]         = useState('today');
  const [facultyExtendedDate, setFacultyExtendedDate] = useState('');
  const [facultyTodayEnd, setFacultyTodayEnd]   = useState('');
  const [successData, setSuccessData]           = useState(null);
  const [confirmClose, setConfirmClose]         = useState(false);

  // 1. Rooms + sockets
  useEffect(() => {
    // FIX: Try fetching from the public/shared /rooms route first so students/faculty aren't blocked by admin middleware
    api.get('/rooms')
      .catch(() => api.get('/admin/rooms')) // Fallback just in case
      .then(res => setAvailableRooms(res.data?.data || res.data || []))
      .catch(() => toast.error('Could not load department rooms'));

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('room-updated', (data) => {
      setAvailableRooms(prev => prev.map(r =>
        String(r.id) === String(data.roomId) ? { ...r, is_available: data.is_available, unavailable_reason: data.reason } : r
      ));
    });
    socket.on('inventory-updated', () => setRefreshTrigger(p => p + 1));
    return () => socket.disconnect();
  }, []);

  const currentRoom   = useMemo(() => availableRooms.find(r => String(r.id) === String(selectedRoomId)), [availableRooms, selectedRoomId]);
  const isRoomClosed  = currentRoom && !currentRoom.is_available;

  // 2. Fetch inventory
  const fetchInv = useCallback(async () => {
    if (!selectedRoomId || isRoomClosed) { setInventory([]); return; }
    try {
      const res = await listInventory({ room_id: selectedRoomId });
      const data = res.data?.data || {};

      const unitItems = (data.items || [])
        .filter(i => i.status === 'available')
        .reduce((acc, i) => {
          if (!acc.find(x => x.inventory_type_id === i.inventory_type_id)) acc.push(i);
          return acc;
        }, [])
        .map(i => ({ ...i, kind: 'borrowable', inventory_mode: 'unit' }));

      const consumables = (data.consumables || [])
        .filter(i => i.quantity_available > 0)
        .map(i => ({ ...i, kind: 'consumable', inventory_mode: 'unit' }));

      const qtyItems = (data.quantityItems || [])
        .filter(i => i.qty_available > 0)
        .map(i => ({
          ...i,
          kind: 'quantity',
          inventory_mode: 'quantity',
        }));

      const freshInventory = [...unitItems, ...consumables, ...qtyItems];
      setInventory(freshInventory);

      // Cart auto-correction
      setCart(prevCart => {
        let modified = false;
        const updated = prevCart.map(cartItem => {
          if (cartItem.inventory_mode === 'quantity') {
            const fresh = freshInventory.find(i => i.stock_id === cartItem.stock_id);
            if (!fresh) {
              modified = true;
              toast.error(`⚠️ ${cartItem.name} no longer available. Removed from cart.`, { duration: 6000, icon: '🛑' });
              return null;
            }
            if (cartItem.qty_requested > fresh.qty_available) {
              modified = true;
              toast.error(`⚠️ Only ${fresh.qty_available}× ${cartItem.name} left. Cart adjusted.`, { duration: 6000, icon: '📉' });
              return { ...cartItem, qty_requested: fresh.qty_available };
            }
            return cartItem;
          }

          const fresh = freshInventory.find(i => i.inventory_type_id === cartItem.inventory_type_id && i.barcode === cartItem.barcode);
          if (!fresh) {
            modified = true;
            toast.error(`⚠️ ${cartItem.name} was just issued. Removed from cart.`, { duration: 6000, icon: '🛑' });
            return null;
          }
          if (cartItem.kind === 'consumable' && cartItem.quantity > fresh.quantity_available) {
            modified = true;
            toast.error(`⚠️ Only ${fresh.quantity_available}× ${cartItem.name} left. Adjusted.`, { duration: 6000, icon: '📉' });
            return { ...cartItem, quantity: fresh.quantity_available };
          }
          return cartItem;
        }).filter(Boolean);
        return modified ? updated : prevCart;
      });

    } catch { toast.error('Failed to load inventory'); }
  }, [selectedRoomId, isRoomClosed]);

  useEffect(() => { fetchInv(); }, [fetchInv, refreshTrigger]);

  // 3. Search filter
  const filteredInventory = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter(i =>
      i.name?.toLowerCase().includes(q) ||
      i.barcode?.toLowerCase().includes(q)
    );
  }, [inventory, inventorySearch]);

  // ── Cart handlers ─────────────────────────────────────────────────────────
  const handleRoomChange = (e) => { setSelectedRoomId(e.target.value); setCart([]); setInventorySearch(''); };

  const addToCart = (item) => {
    if (isRoomClosed) return;

    if (item.inventory_mode === 'quantity') {
      const exists = cart.find(c => c.stock_id === item.stock_id);
      if (exists) {
        if (exists.qty_requested >= item.qty_available) return toast.error(`Only ${item.qty_available} available.`);
        setCart(cart.map(c => c.stock_id === item.stock_id ? { ...c, qty_requested: c.qty_requested + 1 } : c));
      } else {
        setCart([...cart, { ...item, kind: 'quantity', qty_requested: 1, assigned_to: 'Requester' }]);
      }
      toast.success(`${item.name} added`);
      return;
    }

    if (item.kind === 'consumable') {
      const exists = cart.find(c => c.inventory_type_id === item.inventory_type_id && c.kind === 'consumable');
      if (exists) {
        if (exists.quantity >= item.quantity_available) return toast.error(`Only ${item.quantity_available} available.`);
        setCart(cart.map(c => c.inventory_type_id === item.inventory_type_id && c.kind === 'consumable' ? { ...c, quantity: c.quantity + 1 } : c));
      } else {
        setCart([...cart, { ...item, quantity: 1, assigned_to: 'Requester' }]);
      }
      toast.success(`${item.name} added`);
      return;
    }

    const exists = cart.find(c => c.inventory_type_id === item.inventory_type_id && c.kind === 'borrowable');
    if (!exists) {
      setCart([...cart, { ...item, quantity: 1, assigned_to: 'Requester' }]);
      toast.success(`${item.name} added`);
    } else {
      toast(`${item.name} already in cart (one type per request)`, { icon: 'ℹ️' });
    }
  };

  const updateCartField = (key, value, item) => {
    setCart(cart.map(c => {
      if (item.inventory_mode === 'quantity' && c.stock_id === item.stock_id) return { ...c, [key]: value };
      if (c.inventory_type_id === item.inventory_type_id && c.kind === item.kind) return { ...c, [key]: value };
      return c;
    }));
  };

  const removeFromCart = (item) => {
    setCart(cart.filter(c => {
      if (item.inventory_mode === 'quantity') return c.stock_id !== item.stock_id;
      return !(c.inventory_type_id === item.inventory_type_id && c.kind === item.kind);
    }));
  };

  const addCompanion = () => setCompanions([...companions, { name: '', student_id: '' }]);
  const updateCompanion = (idx, field, value) => {
    const c = [...companions]; c[idx][field] = value; setCompanions(c);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (isRoomClosed) return toast.error('This room is currently closed.');
    if (!selectedRoomId) return toast.error('Please select a department room first');
    if (cart.length === 0) return toast.error('Your cart is empty');
    
    const finalPurpose = purpose === 'Other' ? customPurpose.trim() : purpose;
    if (!finalPurpose) return toast.error('Please select or specify a purpose for this request');

    setSubmitting(true);
    try {
      const payload = {
        room_id: selectedRoomId,
        purpose: finalPurpose,
        items: cart.map(c => {
          if (c.inventory_mode === 'quantity') {
            return {
              inventory_type_id: c.inventory_type_id,
              stock_id: c.stock_id,
              qty_requested: c.qty_requested,
              assigned_to: c.assigned_to,
            };
          }
          return {
            inventory_type_id: c.inventory_type_id,
            consumable_id: c.kind === 'consumable' ? c.item_id : null,
            quantity: c.quantity,
            assigned_to: c.assigned_to,
          };
        }),
        // FIX: Completely ignore companions if user is Faculty
        companions: isFaculty ? [] : companions
          .filter(c => c.name && c.student_id)
          .map(c => ({ 
            name: c.name, 
            student_id: c.student_id, 
            start_time: null, 
            end_time: null 
          })),
      };

      if (isFaculty) {
        if (scheduleType === 'extended') {
          if (!facultyExtendedDate) return toast.error('Select an extended return date');
          payload.scheduled_time = new Date(facultyExtendedDate).toISOString();
        } else {
          if (!facultyTodayEnd) return toast.error('Select your base return time');
          const today = new Date().toISOString().split('T')[0];
          payload.scheduled_time = new Date(`${today}T${facultyTodayEnd}`).toISOString();
        }
      }

      const res = await createRequest(payload);
      setSuccessData(res.data.data || res.data);
      toast.success(isFaculty ? 'Request submitted for approval!' : 'Request created!');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalClose = () => {
    setSuccessData(null); setConfirmClose(false); setCart([]); setCompanions([]);
    setPurpose(''); setCustomPurpose(''); setScheduleType('today'); setFacultyExtendedDate('');
    setFacultyTodayEnd(''); setInventorySearch('');
    if (!initialRoom) setSelectedRoomId('');
  };

  // ── Inventory row renderer ────────────────────────────────────────────────
  const renderInventoryRow = (item) => {
    const key = item.inventory_mode === 'quantity'
      ? `qty-${item.stock_id}`
      : `${item.kind}-${item.inventory_type_id}-${item.barcode || item.item_id}`;

    const badge = item.inventory_mode === 'quantity'
      ? { label: 'qty-mode', cls: 'bg-violet-100 text-violet-700' }
      : item.kind === 'consumable'
        ? { label: 'consumable', cls: 'bg-amber-100 text-amber-700' }
        : { label: 'unit', cls: 'bg-blue-100 text-blue-700' };

    const subLabel = item.inventory_mode === 'quantity'
      ? `${item.qty_available} / ${item.qty_total} available`
      : item.kind === 'consumable'
        ? `${item.quantity_available} left`
        : item.barcode;

    return (
      <div
        key={key}
        className="p-3 bg-white border border-black/5 rounded-2xl shadow-sm flex justify-between items-center hover:border-primary/30 hover:shadow-md transition-all duration-200 group animate-in fade-in"
      >
        <div className="flex-1 min-w-0 pr-4">
          <p className="font-bold text-gray-800 text-sm truncate group-hover:text-primary transition-colors">{item.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1 ${badge.cls}`}>
              {item.inventory_mode === 'quantity' && <Layers size={9} />}
              {badge.label}
            </span>
            <span className="text-[11px] text-muted font-mono truncate">{subLabel}</span>
          </div>
        </div>
        <button onClick={() => addToCart(item)} className="neu-btn-sm p-2.5 text-primary hover:bg-primary hover:text-white transition-all rounded-xl">
          <Plus size={18} />
        </button>
      </div>
    );
  };

  // ── Cart row renderer ─────────────────────────────────────────────────────
  const renderCartRow = (item) => {
    const key = item.inventory_mode === 'quantity'
      ? `cart-qty-${item.stock_id}`
      : `cart-${item.inventory_type_id}-${item.kind}`;

    const maxQty = item.inventory_mode === 'quantity' ? item.qty_available : item.quantity_available;
    const showQtyInput = item.inventory_mode === 'quantity' || item.kind === 'consumable';

    return (
      <div key={key} className="p-3 bg-white border border-black/10 shadow-sm rounded-xl space-y-2">
        <div className="flex justify-between items-center">
          <div>
            <span className="font-bold text-sm text-gray-800">{item.name}</span>
            {item.inventory_mode === 'quantity' && (
              <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 uppercase flex items-center gap-0.5 inline-flex">
                <Layers size={8} /> qty
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {showQtyInput && (
              <input
                type="number"
                min="1"
                max={maxQty}
                className="neu-input w-16 text-center text-xs py-1"
                value={item.inventory_mode === 'quantity' ? item.qty_requested : item.quantity}
                onChange={e => {
                  const v = parseInt(e.target.value) || 1;
                  if (item.inventory_mode === 'quantity') {
                    updateCartField('qty_requested', Math.min(v, item.qty_available), item);
                  } else {
                    updateCartField('quantity', Math.min(v, item.quantity_available), item);
                  }
                }}
              />
            )}
            <button onClick={() => removeFromCart(item)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Hide Assignment if no companions exist (which is always true for Faculty now) */}
        {!isFaculty && companions.length > 0 && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-black/5">
            <span className="text-[10px] uppercase text-muted font-bold tracking-wider">Assign to:</span>
            <select
              className="neu-input flex-1 text-xs py-1.5 bg-black/[0.02]"
              value={item.assigned_to}
              onChange={e => updateCartField('assigned_to', e.target.value, item)}
            >
              <option value="Requester">Myself (Primary Requester)</option>
              {companions.map((c, i) => c.name && <option key={i} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 relative">
      <div>
        <h1 className="text-2xl font-bold text-primary">New Equipment Request</h1>
        <p className="text-sm text-muted">
          {isFaculty ? 'Schedule your items. Requires admin approval.' : 'Walk-in request. Add items and proceed to the counter.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Inventory Browser */}
        <NeumorphCard className="p-0 overflow-hidden flex flex-col h-[650px]">
          <div className="p-4 bg-primary/5 border-b border-primary/10">
            <label className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2 block">Department Room</label>
            <select
              className="neu-input w-full bg-white text-sm"
              value={selectedRoomId}
              onChange={handleRoomChange}
              disabled={isFaculty && !!initialRoom}
            >
              <option value="" disabled>-- Select Location --</option>
              {availableRooms.map(room => (
                <option key={room.id} value={room.id}>
                  {room.is_available ? '🟢' : '🔴'} {room.name || room.code}
                  {room.is_available ? '' : ' (Unavailable)'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 flex flex-col p-4 relative bg-surface/50">
            {isRoomClosed ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 animate-in fade-in zoom-in duration-300">
                <div className="w-24 h-24 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6 shadow-inner">
                  <DoorClosed size={48} />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">Room is Currently Closed</h2>
                <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl max-w-xs">
                  <p className="text-xs font-bold text-red-600 uppercase tracking-widest mb-1">Admin Reason:</p>
                  <p className="text-sm text-red-800 italic">"{currentRoom.unavailable_reason || 'No specific reason provided.'}"</p>
                </div>
                <p className="mt-6 text-xs text-muted leading-relaxed">
                  Requests for this room are temporarily disabled.<br /> Please try again later.
                </p>
              </div>
            ) : !selectedRoomId ? (
              <div className="flex-1 flex flex-col items-center justify-center opacity-40 text-muted">
                <MapPin size={64} strokeWidth={1} />
                <p className="mt-4 font-medium">Select a department to view items</p>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                  <input
                    type="text"
                    placeholder="Search by name or barcode..."
                    className="neu-input w-full pl-10 py-3 bg-white text-sm"
                    value={inventorySearch}
                    onChange={e => setInventorySearch(e.target.value)}
                  />
                  {inventorySearch && (
                    <button onClick={() => setInventorySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-gray-700">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="overflow-y-auto custom-scrollbar space-y-2 pr-1" style={{ maxHeight: '460px' }}>
                  {filteredInventory.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted text-center py-10">
                      <Package size={48} className="mb-2 opacity-20" />
                      <p className="text-sm italic">No items match "{inventorySearch}"</p>
                    </div>
                  ) : (
                    filteredInventory.map(renderInventoryRow)
                  )}
                </div>
              </div>
            )}
          </div>
        </NeumorphCard>

        {/* RIGHT: Cart & Submission */}
        <div className={`space-y-6 h-[650px] overflow-y-auto pr-2 custom-scrollbar transition-opacity duration-300 ${isRoomClosed ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
          <NeumorphCard className="p-5 space-y-4">
            
            {/* PURPOSE DROPDOWN */}
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2 block">
                  Purpose / Activity
                </label>
                <select
                  className="neu-input w-full bg-white text-sm"
                  value={purpose}
                  onChange={e => {
                    setPurpose(e.target.value);
                    if (e.target.value !== 'Other') setCustomPurpose(''); // Clear custom input if they switch
                  }}
                >
                  <option value="" disabled>-- Select Purpose --</option>
                  <option value="Laboratory Activity">Laboratory Activity</option>
                  <option value="Class Demonstration / Instruction">Class Demonstration / Instruction</option>
                  <option value="Thesis / Capstone Project">Thesis / Capstone Project</option>
                  <option value="Course Project / Assignment">Course Project / Assignment</option>
                  <option value="Research / Development">Research / Development</option>
                  <option value="Field Work / Surveying">Field Work / Surveying</option>
                  <option value="Event / Competition">Event / Competition</option>
                  <option value="Other">Other (Specify below)</option>
                </select>
              </div>

              {/* Show text input ONLY if 'Other' is selected */}
              {purpose === 'Other' && (
                <div className="animate-fade-in">
                  <NeumorphInput 
                    placeholder="Please specify your purpose..." 
                    value={customPurpose} 
                    onChange={e => setCustomPurpose(e.target.value)} 
                  />
                </div>
              )}
            </div>

            {isFaculty && (
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 space-y-4 mt-4">
                <label className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1"><Calendar size={14} /> Schedule Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="radio" checked={scheduleType === 'today'} onChange={() => setScheduleType('today')} /> Today (Short-Term)
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="radio" checked={scheduleType === 'extended'} onChange={() => setScheduleType('extended')} /> Extended Period
                  </label>
                </div>
                {scheduleType === 'today' ? (
                  <NeumorphInput label="My Return Time Today" type="time" value={facultyTodayEnd} onChange={e => setFacultyTodayEnd(e.target.value)} />
                ) : (
                  <NeumorphInput label="Return Date" type="date" value={facultyExtendedDate} onChange={e => setFacultyExtendedDate(e.target.value)} />
                )}
              </div>
            )}
          </NeumorphCard>

          {/* FIX: Companions section is now completely hidden for Faculty */}
          {!isFaculty && (
            <NeumorphCard className="p-5 space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-muted uppercase tracking-widest flex items-center gap-1"><Users size={14} /> Companions</label>
                <button onClick={addCompanion} className="text-xs font-bold text-primary hover:underline">+ Add Person</button>
              </div>
              {companions.map((comp, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-2 p-3 bg-black/5 rounded-xl relative mt-2 border border-black/5">
                  <input placeholder="Full Name" className="neu-input text-sm" value={comp.name} onChange={e => updateCompanion(idx, 'name', e.target.value)} />
                  <input placeholder="ID Number" className="neu-input text-sm" value={comp.student_id} onChange={e => updateCompanion(idx, 'student_id', e.target.value)} />
                  
                  <button onClick={() => setCompanions(companions.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1.5 shadow-sm hover:bg-red-500 hover:text-white transition-colors"><Trash2 size={12} /></button>
                </div>
              ))}
              {companions.length === 0 && <p className="text-xs text-muted italic">No companions added.</p>}
            </NeumorphCard>
          )}

          <NeumorphCard className="p-5 flex flex-col">
            <div className="flex justify-between items-end mb-4">
              <h2 className="text-[10px] font-bold text-muted uppercase tracking-widest">Your Cart</h2>
              <span className="text-xs font-bold text-primary">{cart.length} Items</span>
            </div>
            <div className="space-y-3">
              {cart.map(renderCartRow)}
              {cart.length === 0 && (
                <div className="p-6 text-center text-muted border border-dashed border-black/10 rounded-2xl bg-black/[0.02]">Cart is empty</div>
              )}
            </div>
            <NeumorphButton variant="primary" className="w-full mt-6 py-4 font-bold text-sm tracking-wide" onClick={handleSubmit} loading={submitting} disabled={isRoomClosed || cart.length === 0}>
              {isRoomClosed ? 'Room Unavailable' : 'Submit Request'} <ArrowRight size={16} className="ml-2" />
            </NeumorphButton>
          </NeumorphCard>
        </div>
      </div>

      {/* Success / QR Modal */}
      {successData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="neu-card-lg w-full max-w-md bg-white text-center p-8 relative">
            {!confirmClose ? (
              <>
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={36} />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-1">Request Created!</h2>
                <p className="text-sm text-muted mb-6 font-mono bg-black/5 inline-block px-3 py-1 rounded-full">#{successData.id}</p>
                <div className="p-4 bg-black/5 rounded-2xl border-2 border-dashed border-black/10 inline-block mb-6 shadow-inner">
                  <QRCodeSVG value={successData.qr_code} size={200} />
                </div>
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-left mb-6">
                  <p className="font-bold text-blue-800 text-sm mb-1 flex items-center gap-2"><AlertTriangle size={16} /> Important Instruction:</p>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    Please <strong>take a photo or screenshot</strong> of this QR code. You will need to present it at the Admin Counter to claim your items.
                  </p>
                </div>
                <NeumorphButton variant="primary" className="w-full py-4 font-bold text-lg" onClick={() => setConfirmClose(true)}>
                  I Have Captured the QR
                </NeumorphButton>
              </>
            ) : (
              <div className="py-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <AlertTriangle size={48} className="text-amber-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-800 mb-2">Are you absolutely sure?</h2>
                <p className="text-sm text-muted mb-8 px-4">If you close without capturing the QR, you will need to make a new request.</p>
                <div className="flex gap-4">
                  <NeumorphButton variant="outline" className="flex-1" onClick={() => setConfirmClose(false)}>Go Back</NeumorphButton>
                  <NeumorphButton variant="primary" className="flex-1 bg-red-500 hover:bg-red-600 text-white border-red-500" onClick={handleFinalClose}>Yes, Close It</NeumorphButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}