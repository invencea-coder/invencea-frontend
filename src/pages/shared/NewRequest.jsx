/**
 * NewRequest.jsx — Lab Equipment Reservation (Production-Grade)
 *
 * Architecture Improvements:
 * - Integrated Custom 12-hour AM/PM Time Pickers for cross-browser consistency.
 * - Centralized `getAvailableQtyAtSlot` for bulletproof stock calculations.
 * - Non-destructive timeframe editing (Cart persists across date changes).
 * - Explicit error reporting for time boundaries (Lunch, Past-time, Overlaps).
 * - Debounced WebSockets to prevent UI thrashing on high-traffic networks.
 * - Slide-up Floating Cart UI for optimal mobile & desktop UX.
 * - Accessibility upgrades to typography and focus states.
 */

import React, {
  useState, useEffect, useMemo, useCallback, useRef, memo,
} from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, Minus, Trash2, AlertTriangle,
  DoorClosed, CheckCircle2, CheckCircle, Timer, MapPin,
  ShoppingBag, Camera, X, CalendarDays, Loader2, PackageX,
  Clock, Mail, ChevronDown, ChevronUp, Layers, Check, Lock,
  ArrowLeft, ArrowDown, CalendarRange
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';
import api from '../../api/axiosClient';
import { listInventory } from '../../api/inventoryAPI';
import { createRequest } from '../../api/requestAPI';
import AvailabilityCalendar from '../../components/AvailabilityCalendar';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';
const PHT = 'Asia/Manila';

const PURPOSES = [
  'Laboratory Activity', 'Class Demonstration', 'Thesis / Capstone',
  'Course Project', 'Research', 'Other',
];

const DURATION_OPTIONS = [
  { label: '10 min',  mins: 10  },
  { label: '20 min',  mins: 20  },
  { label: '1 hr',    mins: 60  },
  { label: '1.5 hrs', mins: 90  },
  { label: '3 hrs',   mins: 180 },
];

/** Business logic constraints */
const DAY_START_MINS = 7  * 60;  // 7:00 AM
const DAY_END_MINS   = 20 * 60;  // 8:00 PM
const DAY_RANGE_MINS = DAY_END_MINS - DAY_START_MINS;
const BREAK_START_MINS = 11 * 60 + 30; // 11:30 AM
const BREAK_END_MINS   = 13 * 60;      // 1:00 PM

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────
const toISO = (dateStr, timeStr) => `${dateStr}T${timeStr}:00+08:00`;

const dateToPHTTime = (d) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: PHT, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(d));
    const h  = parts.find(p => p.type === 'hour')?.value   ?? '00';
    const mn = parts.find(p => p.type === 'minute')?.value ?? '00';
    return `${h === '24' ? '00' : h}:${mn}`;
  } catch { return null; }
};

const timeToMins = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

const fmtTime = (d) => d ? new Date(d).toLocaleString('en-PH', { timeZone: PHT, hour: 'numeric', minute: '2-digit', hour12: true }) : '';
const fmtDateLong = (d) => d ? new Date(d).toLocaleString('en-PH', { timeZone: PHT, weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }) : '';
const fmtDateShort = (dateStr) => {
  if (!dateStr) return '';
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const cartKeyOf = (item) => {
  if (item.inventory_mode === 'unit') return `unit:${item.item_id}`;
  if (item.kind === 'consumable')     return `consumable:${item.consumable_id ?? item.id}`;
  return `qty:${item.stock_id ?? item.id}`;
};

const isCalendarEventExpired = (ev) => {
  const status = String(ev.status || ev.request_status || '').toUpperCase();
  if (['ISSUED', 'PARTIALLY RETURNED'].includes(status)) return false;
  if (!['PENDING', 'APPROVED', 'PENDING APPROVAL'].includes(status)) return false;

  const now = Date.now();
  if (ev.pickup_datetime) return now > new Date(ev.pickup_datetime).getTime() + 15 * 60_000;
  if (ev.scheduled_time)  return now > new Date(ev.scheduled_time).getTime() + 15 * 60_000;
  if (ev.pickup_start) {
    const e = new Date(ev.pickup_start); e.setHours(23, 59, 59, 999);
    return now > e.getTime();
  }
  if (ev.created_at) {
    const e = new Date(ev.created_at); e.setHours(23, 59, 59, 999);
    return now > e.getTime();
  }
  return false;
};

const clampToDayMins = (dateStr, tsStart, tsEnd) => {
  const dayStartTs = new Date(`${dateStr}T00:00:00+08:00`).getTime();
  const dayEndTs   = new Date(`${dateStr}T23:59:59+08:00`).getTime();

  if (tsEnd <= dayStartTs || tsStart >= dayEndTs) return null;

  const cStart = Math.max(tsStart, dayStartTs);
  const cEnd   = Math.min(tsEnd,   dayEndTs);

  const stMins = timeToMins(dateToPHTTime(cStart));
  const enMins = timeToMins(dateToPHTTime(cEnd));

  return { startMins: stMins, endMins: enMins };
};

// ─────────────────────────────────────────────────────────────────────────────
// Child Components
// ─────────────────────────────────────────────────────────────────────────────

const CustomTimePicker = memo(({ value, onChange }) => {
  const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  const getTimeParts = (time24) => {
    if (!time24) return { h: '07', m: '00', p: 'AM' };
    const [hours24, mins] = time24.split(':');
    let h = parseInt(hours24, 10);
    const p = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return { h: h.toString().padStart(2, '0'), m: mins, p };
  };

  const { h: currentHour, m: currentMinute, p: currentPeriod } = getTimeParts(value);

  const handleTimeChange = (h, m, p) => {
    let hour24 = parseInt(h, 10);
    if (p === 'PM' && hour24 !== 12) hour24 += 12;
    if (p === 'AM' && hour24 === 12) hour24 = 0;
    onChange(`${hour24.toString().padStart(2, '0')}:${m}`);
  };

  return (
    <div className="relative flex items-center w-full bg-slate-50 border border-black/10 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 rounded-xl pl-9 pr-2 py-1.5 transition-all">
      <Timer size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />

      <div className="flex items-center flex-1">
        <select
          value={currentHour}
          onChange={(e) => handleTimeChange(e.target.value, currentMinute, currentPeriod)}
          className="bg-transparent text-sm font-black text-gray-800 outline-none cursor-pointer appearance-none py-1"
        >
          {hours.map(h => <option key={`h-${h}`} value={h}>{h}</option>)}
        </select>
        <span className="text-[10px] text-gray-400 font-bold ml-0.5 uppercase">hr</span>

        <span className="text-gray-300 font-bold mx-1.5">:</span>

        <select
          value={currentMinute}
          onChange={(e) => handleTimeChange(currentHour, e.target.value, currentPeriod)}
          className="bg-transparent text-sm font-black text-gray-800 outline-none cursor-pointer appearance-none py-1"
        >
          {minutes.map(m => <option key={`m-${m}`} value={m}>{m}</option>)}
        </select>
        <span className="text-[10px] text-gray-400 font-bold ml-0.5 uppercase">min</span>
      </div>

      <select
        value={currentPeriod}
        onChange={(e) => handleTimeChange(currentHour, currentMinute, e.target.value)}
        className="ml-auto bg-white border border-gray-200/80 shadow-sm rounded-lg px-2.5 py-1.5 text-[11px] font-black text-gray-700 outline-none cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
});
CustomTimePicker.displayName = 'CustomTimePicker';

const TimelineBar = memo(({ bookings = [], pickedWindow = null, compact = false }) => {
  const clamp = (v) => Math.min(Math.max(v, DAY_START_MINS), DAY_END_MINS);
  const pct   = (v) => ((clamp(v) - DAY_START_MINS) / DAY_RANGE_MINS) * 100;

  return (
    <div className={`relative ${compact ? 'h-2' : 'h-3'} rounded-full bg-gray-100 overflow-hidden`}>
      <div
        className="absolute inset-y-0 bg-gray-300/70"
        title="Lunch Break (11:30 AM - 1:00 PM)"
        style={{ left: `${pct(BREAK_START_MINS)}%`, width: `${pct(BREAK_END_MINS) - pct(BREAK_START_MINS)}%` }}
      />
      {bookings.map((b, i) => {
        if (b.startMins == null || b.endMins == null) return null;
        const left  = pct(b.startMins);
        const width = Math.max(pct(b.endMins) - left, 1.5);
        return <div key={i} className="absolute inset-y-0 bg-red-400/80 rounded-sm" style={{ left: `${left}%`, width: `${width}%` }} />;
      })}
      {pickedWindow && pickedWindow.startMins != null && (
        <div
          className="absolute inset-y-0 bg-teal-400/80 rounded-sm shadow-sm"
          style={{ left: `${pct(pickedWindow.startMins)}%`, width: `${Math.max(pct(pickedWindow.endMins) - pct(pickedWindow.startMins), 1.5)}%` }}
        />
      )}
      {!compact && [8, 10, 12, 14, 16, 18].map(hr => (
        <div key={hr} className="absolute inset-y-0 w-px bg-white/50" style={{ left: `${((hr * 60 - DAY_START_MINS) / DAY_RANGE_MINS) * 100}%` }} />
      ))}
    </div>
  );
});
TimelineBar.displayName = 'TimelineBar';

const StepBadge = ({ step, complete, locked }) => (
  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-black transition-all ${complete ? 'bg-emerald-500 text-white' : locked ? 'bg-gray-200 text-gray-400' : 'bg-primary/10 text-primary'}`}>
    {complete ? <Check size={12} /> : step}
  </div>
);

const CartRow = memo(({ item, onAdjust, onRemove }) => {
  const isUnit = item.inventory_mode === 'unit';
  return (
    <div className="flex items-center justify-between gap-3 bg-slate-50 border border-black/5 rounded-xl px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-gray-800 truncate">{item.name}</p>
        {item.barcode && <p className="text-[11px] font-mono text-gray-400 mt-0.5 truncate">{item.barcode}</p>}
        {!isUnit && <p className="text-[11px] text-gray-400 mt-0.5 font-medium">Qty: {item.req_qty} / {item._avail} available</p>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isUnit ? (
          <button onClick={() => onRemove(item)} aria-label="Remove" className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
        ) : (
          <>
            <button onClick={() => onAdjust(item, -1)} aria-label="Decrease" className="w-8 h-8 bg-gray-200/60 rounded-lg flex items-center justify-center text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors"><Minus size={14} /></button>
            <span className="w-8 text-center text-sm font-black text-gray-800 tabular-nums">{item.req_qty}</span>
            <button onClick={() => onAdjust(item, +1)} disabled={item.req_qty >= item._avail} aria-label="Increase" className="w-8 h-8 bg-gray-200/60 rounded-lg flex items-center justify-center text-gray-600 hover:bg-teal-50 hover:text-teal-700 transition-colors disabled:opacity-40"><Plus size={14} /></button>
            <button onClick={() => onRemove(item)} aria-label="Remove" className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors ml-1"><Trash2 size={16} /></button>
          </>
        )}
      </div>
    </div>
  );
});
CartRow.displayName = 'CartRow';

const InventoryUnitRow = memo(({ item, inCart, bookings, visualPickedWindow, getAvailableQtyAtSlot, pickedWindowTs, onAdd, onRemove }) => {
  const isAvailableAtSlot = pickedWindowTs ? getAvailableQtyAtSlot(item, pickedWindowTs) > 0 : item._avail > 0;
  const disabled = item._avail <= 0 || (pickedWindowTs && !isAvailableAtSlot);
  const visualBookings = bookings.filter(b => b.startMins != null);

  return (
    <div
      role="button" tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inCart ? onRemove(item) : onAdd(item); }}
      onClick={() => { if (!disabled) inCart ? onRemove(item) : onAdd(item); }}
      className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-all select-none
        ${disabled ? 'bg-gray-50 border-gray-100 opacity-55 cursor-not-allowed' : inCart ? 'bg-teal-50 border-teal-300 cursor-pointer' : 'bg-white border-black/5 hover:border-teal-300 hover:shadow-sm cursor-pointer'}`}
    >
      <span className="text-[11px] font-mono font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded flex-shrink-0 tracking-wide">{item.barcode || '—'}</span>
      <div className="flex-1 min-w-0">
        {visualBookings.length > 0 ? (
          <>
            <TimelineBar bookings={visualBookings} pickedWindow={visualPickedWindow} compact />
            <div className="flex flex-wrap gap-1 mt-1.5">
              {visualBookings.map((b, i) => (
                <span key={i} className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${disabled ? 'text-red-700 bg-red-100' : 'text-amber-700 bg-amber-50'}`}>{b.label}</span>
              ))}
            </div>
          </>
        ) : (
          <span className="text-[11px] font-bold text-emerald-600">{visualPickedWindow ? '✓ Free at your time' : 'Free all day'}</span>
        )}
        {disabled && item._avail > 0 && <span className="text-[10px] font-black text-red-600 block mt-0.5">Booked during timeframe</span>}
      </div>
      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {inCart ? (
          <button onClick={() => onRemove(item)} className="w-9 h-9 rounded-xl bg-teal-500 text-white flex items-center justify-center hover:bg-red-500 transition-colors shadow-sm"><Check size={16} /></button>
        ) : (
          <button disabled={disabled} onClick={() => onAdd(item)} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${disabled ? 'bg-gray-100 text-gray-300' : 'bg-gray-100 text-gray-600 hover:bg-teal-500 hover:text-white shadow-sm'}`}><Plus size={16} /></button>
        )}
      </div>
    </div>
  );
});
InventoryUnitRow.displayName = 'InventoryUnitRow';

const InventoryGroupCard = memo(({ group, cart, pickedWindowTs, visualPickedWindow, step2Done, getAvailableQtyAtSlot, getBookingsForGroup, getBookingsForItem, selectedDate, onAdd, onRemove, onAdjustQty }) => {
  const [expanded, setExpanded] = useState(false);
  const isSingleUnit = group.items.length === 1 && group.inventory_mode === 'unit';
  const isFungible   = group.inventory_mode !== 'unit'; 

  const cartEntries  = useMemo(() => cart.filter(c => c.name === group.name), [cart, group.name]);
  const cartTotalQty = cartEntries.reduce((s, c) => s + c.req_qty, 0);
  const cartCount    = cartEntries.length; 

  const bookings       = getBookingsForGroup(group);
  const visualBookings = bookings.filter(b => b.startMins != null);

  const freeAtSlot = useMemo(() => {
    if (!step2Done || !pickedWindowTs) return null;
    if (isFungible) {
      return getAvailableQtyAtSlot(group.items[0], pickedWindowTs);
    } else {
      return group.items.filter(i => i._avail > 0 && getAvailableQtyAtSlot(i, pickedWindowTs) > 0).length;
    }
  }, [step2Done, isFungible, group, pickedWindowTs, getAvailableQtyAtSlot]);

  const allOut       = group.totalAvail <= 0;
  const allBookedNow = step2Done && !isFungible && group.totalAvail > 0 && freeAtSlot === 0;
  const fullyUnavail = allOut || allBookedNow;

  const poolItem   = isFungible ? group.items[0] : null;
  const poolInCart = poolItem ? cart.find(c => cartKeyOf(c) === cartKeyOf(poolItem)) : null;

  const handleGroupClick = () => {
    if (isFungible || fullyUnavail) return;
    if (isSingleUnit) {
      const item = group.items[0];
      cart.some(c => cartKeyOf(c) === cartKeyOf(item)) ? onRemove(item) : onAdd(item);
      return;
    }
    setExpanded(prev => !prev);
  };

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${fullyUnavail ? 'border-gray-100 opacity-55' : cartCount > 0 || cartTotalQty > 0 ? 'border-teal-300 shadow-sm shadow-teal-50' : 'border-black/5 shadow-sm'}`}>
      <div
        role={isFungible ? 'region' : 'button'}
        tabIndex={isFungible || fullyUnavail ? -1 : 0}
        onKeyDown={(e) => { if (!isFungible && !fullyUnavail && (e.key === 'Enter' || e.key === ' ')) handleGroupClick(); }}
        onClick={handleGroupClick}
        className={`flex flex-wrap sm:flex-nowrap items-center gap-3 p-3.5 transition-colors ${fullyUnavail ? 'bg-gray-50 cursor-default' : cartCount > 0 || cartTotalQty > 0 ? 'bg-teal-50/60 cursor-pointer' : isFungible ? 'bg-white cursor-default' : 'bg-white hover:bg-slate-50 cursor-pointer'}`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${fullyUnavail ? 'bg-gray-200' : cartCount > 0 || cartTotalQty > 0 ? 'bg-teal-100 text-teal-600' : 'bg-slate-100 text-gray-500'}`}>
            <Layers size={18} />
          </div>
          <div className="flex-1 min-w-0 pr-2">
            <p className={`font-black text-sm truncate ${fullyUnavail ? 'text-gray-500' : 'text-gray-900'}`}>{group.name}</p>
            {selectedDate && visualBookings.length > 0 && <div className="mt-1 mb-1"><TimelineBar bookings={visualBookings} pickedWindow={visualPickedWindow} compact /></div>}
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              {group.kind === 'consumable' && <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">Consumable</span>}
              {allBookedNow ? <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded flex items-center gap-1"><Clock size={10} /> All booked</span>
              : allOut ? <span className="text-[10px] font-black text-red-500 bg-red-50 px-2 py-0.5 rounded flex items-center gap-1"><PackageX size={10} /> Checked out</span>
              : step2Done && freeAtSlot !== null ? <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{freeAtSlot}/{group.totalUnits} free</span>
              : <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{group.totalAvail} / {group.totalUnits} available</span>}
              {group.items.length > 1 && !isFungible && <span className="text-[10px] text-gray-400 font-medium">{group.items.length} units</span>}
              {(cartCount > 0 || cartTotalQty > 0) && <span className="text-[10px] font-black text-teal-700 bg-teal-100 px-2 py-0.5 rounded">{isFungible ? `${cartTotalQty} in cart` : `${cartCount} in cart`}</span>}
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 ml-auto flex items-center">
          {isFungible ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {poolInCart ? (
                <>
                  <button onClick={() => onAdjustQty(poolItem, -1)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors"><Minus size={16} /></button>
                  <span className="w-7 text-center font-black text-sm text-teal-700 tabular-nums">{poolInCart.req_qty}</span>
                  <button onClick={() => onAdjustQty(poolItem, +1)} disabled={poolInCart.req_qty >= freeAtSlot} className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center text-teal-700 hover:bg-teal-200 transition-colors disabled:opacity-40 shadow-sm"><Plus size={16} /></button>
                </>
              ) : (
                <button disabled={fullyUnavail || freeAtSlot === 0} onClick={() => !fullyUnavail && freeAtSlot > 0 && onAdd(poolItem)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-sm ${fullyUnavail || freeAtSlot === 0 ? 'bg-gray-100 text-gray-300' : 'bg-gray-100 text-gray-600 hover:bg-teal-500 hover:text-white'}`}><Plus size={18} /></button>
              )}
            </div>
          ) : isSingleUnit ? (
            <div onClick={(e) => e.stopPropagation()}>
              <button disabled={fullyUnavail} onClick={() => { if (!fullyUnavail) cart.some(c => cartKeyOf(c) === cartKeyOf(group.items[0])) ? onRemove(group.items[0]) : onAdd(group.items[0]); }} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-sm ${cart.some(c => cartKeyOf(c) === cartKeyOf(group.items[0])) ? 'bg-teal-500 text-white shadow-md' : fullyUnavail ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-600 hover:bg-teal-500 hover:text-white'}`}>
                {cart.some(c => cartKeyOf(c) === cartKeyOf(group.items[0])) ? <Check size={18} /> : <Plus size={18} />}
              </button>
            </div>
          ) : (
            <div className="text-gray-400 p-2">{expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
          )}
        </div>
      </div>

      {expanded && !isSingleUnit && !isFungible && (
        <div className="border-t border-black/5 bg-slate-50/60 p-3 space-y-2">
          <div className="space-y-2">
            {group.items.map((item) => (
              <InventoryUnitRow
                key={item.item_id}
                item={item}
                inCart={cart.some(c => cartKeyOf(c) === cartKeyOf(item))}
                bookings={getBookingsForItem(item)}
                visualPickedWindow={visualPickedWindow}
                getAvailableQtyAtSlot={getAvailableQtyAtSlot}
                pickedWindowTs={pickedWindowTs}
                onAdd={onAdd}
                onRemove={onRemove}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
InventoryGroupCard.displayName = 'InventoryGroupCard';

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function NewRequest() {
  const { user } = useAuth();
  const submitRef = useRef(null);

  const initialRoom = useMemo(() => (user?.room_id && user.room_id !== 'null' ? String(user.room_id) : ''), [user?.room_id]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');

  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(true);

  const [bookingMode, setBookingMode] = useState('sameday');
  const [pickupTime, setPickupTime]   = useState('');
  const [duration, setDuration]       = useState(null);
  const [endDate, setEndDate]         = useState('');
  const [returnTime, setReturnTime]   = useState('');
  const [isTimeframeConfirmed, setIsTimeframeConfirmed] = useState(false);

  const [inventory, setInventory] = useState([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');

  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false); 
  const [calendarEvents, setCalendarEvents] = useState([]);

  const [purpose, setPurpose] = useState('');
  const [customPurpose, setCustomPurpose] = useState('');
  const [email, setEmail] = useState(user?.email || '');

  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const selectedRoomIdRef = useRef(selectedRoomId);
  useEffect(() => { selectedRoomIdRef.current = selectedRoomId; }, [selectedRoomId]);

  useEffect(() => { if (initialRoom) setSelectedRoomId(initialRoom); }, [initialRoom]);

  useEffect(() => {
    (api.get('/rooms').catch(() => api.get('/admin/rooms')))
      .then(res => setRooms(res.data?.data || res.data || []))
      .catch(() => toast.error('Could not load rooms.'));
  }, []);

  // ── Data Fetching ──────────────────────────────────────────────────────────
  const fetchCalendarEvents = useCallback(async () => {
    if (!selectedRoomIdRef.current) return;
    try {
      const res = await api.get('/requests/calendar', { params: { room_id: selectedRoomIdRef.current } });
      setCalendarEvents(res.data?.data || []);
    } catch { /* silent */ }
  }, []);

  const fetchInventory = useCallback(async () => {
    if (!selectedRoomIdRef.current) { setInventory([]); return; }
    setLoadingInv(true);
    try {
      const res = await listInventory({ room_id: selectedRoomIdRef.current });
      const data = res.data?.data ?? {};

      const units = (data.items || []).map(i => ({ ...i, kind: 'borrowable', inventory_mode: 'unit', _avail: ['available', 'reserved', 'borrowed'].includes(i.status) ? 1 : 0, _total: 1 }));
      const consumables = (data.consumables || []).map(i => ({ ...i, kind: 'consumable', inventory_mode: 'consumable', _avail: i.quantity_available ?? 0, _total: i.quantity_total ?? 0 }));
      const qtyItems = (data.quantityItems || []).map(i => ({ ...i, kind: 'quantity', inventory_mode: 'quantity', _avail: i.qty_available ?? 0, _total: i.qty_total ?? 0 }));

      setInventory([...units, ...consumables, ...qtyItems].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    } catch {
      toast.error('Failed to load inventory.');
    } finally { setLoadingInv(false); }
  }, []);

  const fetchRefs = useRef({ fetchInventory, fetchCalendarEvents });
  useEffect(() => { fetchRefs.current = { fetchInventory, fetchCalendarEvents }; }, [fetchInventory, fetchCalendarEvents]);

  // ⚡ Debounced WebSockets
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    let timeoutId;

    const handleUpdate = (payload) => {
      const eRoom = payload?.room_id ?? payload?.roomId;
      if (!eRoom || String(eRoom) === String(selectedRoomIdRef.current)) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          fetchRefs.current.fetchInventory();
          fetchRefs.current.fetchCalendarEvents();
        }, 1000);
      }
    };

    socket.on('inventory-updated', handleUpdate);
    socket.on('request-updated', handleUpdate);

    return () => { 
      clearTimeout(timeoutId);
      setTimeout(() => socket.disconnect(), 100); 
    };
  }, []); 

  useEffect(() => {
    fetchInventory(); fetchCalendarEvents();
  }, [fetchInventory, fetchCalendarEvents, selectedDate]);

  const currentRoom = useMemo(() => rooms.find(r => String(r.id) === String(selectedRoomId)) ?? null, [rooms, selectedRoomId]);
  const isRoomClosed = !!(currentRoom && !currentRoom.is_available);

  // ── Inventory & Time Resolvers ─────────────────────────────────────────────
  const groupedInventory = useMemo(() => {
    const map = new Map();
    const q = inventorySearch.trim().toLowerCase();
    const list = q ? inventory.filter(i => (i.name || '').toLowerCase().includes(q) || (i.barcode || '').toLowerCase().includes(q)) : [...inventory];

    list.forEach(item => {
      const key = item.name || 'Unknown';
      if (!map.has(key)) map.set(key, { name: key, kind: item.kind, inventory_mode: item.inventory_mode, items: [], totalAvail: 0, totalUnits: 0 });
      const g = map.get(key);
      g.items.push(item);
      g.totalAvail += item._avail;
      g.totalUnits += item._total;
    });

    return Array.from(map.values()).sort((a, b) => {
      if ((a.totalAvail > 0) !== (b.totalAvail > 0)) return b.totalAvail > 0 ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [inventory, inventorySearch]);

  const pickedWindowTs = useMemo(() => {
    if (!selectedDate || !pickupTime) return null;
    const startTs = new Date(toISO(selectedDate, pickupTime)).getTime();
    let endTs;

    if (bookingMode === 'sameday') {
      if (!duration) return null;
      endTs = startTs + duration * 60_000;
    } else {
      if (!endDate || !returnTime) return null;
      endTs = new Date(toISO(endDate, returnTime)).getTime();
    }
    return { startTs, endTs }; 
  }, [selectedDate, pickupTime, bookingMode, duration, endDate, returnTime]);

  const visualPickedWindow = useMemo(() => clampToDayMins(selectedDate, pickedWindowTs?.startTs, pickedWindowTs?.endTs), [pickedWindowTs, selectedDate]);

  const minMultiDate = useMemo(() => {
    if (!selectedDate) return '';
    const [y, m, d] = selectedDate.split('-').map(Number);
    const nextDay = new Date(y, m - 1, d + 1);
    return `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);

  // ── ⚡ CENTRALIZED AVAILABILITY LOGIC ────────────────────────────────────────
  const getBookingsForItem = useCallback((item) => {
    if (!selectedDate || !calendarEvents.length) return [];
    const results = [];
    for (const ev of calendarEvents) {
      if (isCalendarEventExpired(ev)) continue;
      
      const evStart = new Date(ev.pickup_datetime ?? ev.pickup_start ?? ev.scheduled_time ?? ev.issued_time);
      const evEnd   = ev.return_deadline ? new Date(ev.return_deadline) : new Date(evStart.getTime() + 60 * 60_000);

      let qtyInEv = 0;
      const matches = (ev.items ?? []).some(evItem => {
        if (item.inventory_mode === 'unit') {
          if ((evItem.inventory_item_id && String(evItem.inventory_item_id) === String(item.item_id)) ||
              (!evItem.inventory_item_id && String(evItem.inventory_type_id) === String(item.inventory_type_id))) {
            qtyInEv = 1; return true;
          }
        } else if (item.kind === 'consumable') {
          if (String(evItem.consumable_id) === String(item.consumable_id || item.id)) {
            qtyInEv = evItem.quantity || evItem.qty_requested || 1; return true;
          }
        } else {
          if (String(evItem.stock_id) === String(item.stock_id || item.id)) {
            qtyInEv = evItem.quantity || evItem.qty_requested || 1; return true;
          }
        }
        return false;
      });

      if (matches) {
        const visualClamp = clampToDayMins(selectedDate, evStart.getTime(), evEnd.getTime());
        results.push({
          startTs: evStart.getTime(), endTs: evEnd.getTime(),
          startMins: visualClamp?.startMins, endMins: visualClamp?.endMins,
          label: `${fmtDateShort(evStart.toISOString().split('T')[0])} ${fmtTime(evStart)}`,
          qty: qtyInEv
        });
      }
    }
    return results;
  }, [selectedDate, calendarEvents]);

  const getAvailableQtyAtSlot = useCallback((item, windowTs) => {
    if (!windowTs) return item._avail;
    const bookings = getBookingsForItem(item);
    
    if (item.inventory_mode === 'unit') {
      const isBooked = bookings.some(b => windowTs.startTs < b.endTs && windowTs.endTs > b.startTs);
      return isBooked ? 0 : 1;
    } else {
      let overlappingQty = 0;
      for (const b of bookings) {
        if (windowTs.startTs < b.endTs && windowTs.endTs > b.startTs) overlappingQty += (b.qty || 1);
      }
      return Math.max(0, item._avail - overlappingQty);
    }
  }, [getBookingsForItem]);

  const getBookingsForGroup = useCallback((group) => {
    const seen = new Set(); const results = [];
    for (const item of group.items) {
      for (const b of getBookingsForItem(item)) {
        const k = `${b.startTs}-${b.endTs}`;
        if (!seen.has(k)) { seen.add(k); results.push(b); }
      }
    }
    return results;
  }, [getBookingsForItem]);

  const allDayBookings = useMemo(() => {
    if (!selectedDate || !calendarEvents.length) return [];
    const seen = new Set(); const results = [];
    for (const ev of calendarEvents) {
      if (isCalendarEventExpired(ev)) continue;
      const evStart = new Date(ev.pickup_datetime ?? ev.pickup_start ?? ev.scheduled_time ?? ev.issued_time);
      const evEnd   = ev.return_deadline ? new Date(ev.return_deadline) : new Date(evStart.getTime() + 60 * 60_000);
      const clamp   = clampToDayMins(selectedDate, evStart.getTime(), evEnd.getTime());
      if (clamp) {
        const k = `${clamp.startMins}-${clamp.endMins}`;
        if (!seen.has(k)) { seen.add(k); results.push(clamp); }
      }
    }
    return results;
  }, [selectedDate, calendarEvents]);

  // ── Validation & Errors ────────────────────────────────────────────────────
  const slotError = useMemo(() => {
    if (!pickedWindowTs || !selectedDate) return 'Incomplete timeframe';
    const { startTs, endTs } = pickedWindowTs;

    if (endTs <= startTs) return 'Return time must be after pickup time.';
    if (startTs < Date.now()) return 'Pickup time cannot be in the past.';
    if (bookingMode === 'multiday' && selectedDate === endDate) return 'Multi-day bookings must return on a future date. Use "Same Day Return".';

    const startD = new Date(startTs); const endD = new Date(endTs);
    const phtStartHour = parseInt(dateToPHTTime(startD)?.split(':')[0] || 0);
    const phtEndHour   = parseInt(dateToPHTTime(endD)?.split(':')[0]   || 0);
    
    if (phtStartHour < 7 || phtStartHour >= 20) return 'Pickup time must be within business hours (7:00 AM - 8:00 PM).';
    if (phtEndHour < 7 || (phtEndHour >= 20 && dateToPHTTime(endD)?.split(':')[1] !== '00')) return 'Return time must be within business hours (7:00 AM - 8:00 PM).';

    const startMins = timeToMins(dateToPHTTime(startD));
    const endMins   = timeToMins(dateToPHTTime(endD));

    if (startMins < BREAK_END_MINS && startMins >= BREAK_START_MINS) return 'Pickup time cannot be during the lunch break (11:30 AM - 1:00 PM).';
    if (endMins <= BREAK_END_MINS && endMins > BREAK_START_MINS) return 'Return time cannot be during the lunch break (11:30 AM - 1:00 PM).';
    if (startMins < BREAK_START_MINS && endMins > BREAK_END_MINS && bookingMode === 'sameday') return 'Same-day bookings cannot span across the lunch break. Please split into two bookings.';

    if (cart.length > 0) {
      for (const cartItem of cart) {
        const availableNow = getAvailableQtyAtSlot(cartItem, pickedWindowTs);
        if (cartItem.req_qty > availableNow) return `Cart conflict: Not enough "${cartItem.name}" available for this timeframe.`;
      }
    }

    return null;
  }, [selectedDate, cart, pickedWindowTs, bookingMode, endDate, getAvailableQtyAtSlot]);

  const currentSlotOk = !slotError;
  const step1Done = !!selectedDate;
  const step2Done = !!(pickedWindowTs && currentSlotOk && isTimeframeConfirmed);
  const step3Done = step2Done && cart.length > 0;
  const canSubmit = step3Done && purpose && (purpose !== 'Other' || customPurpose.trim()) && email;

  // ── Cart Actions ───────────────────────────────────────────────────────────
  const addToCart = useCallback((item) => {
    if (isRoomClosed || item._avail <= 0) return;

    let maxForSlot = pickedWindowTs ? getAvailableQtyAtSlot(item, pickedWindowTs) : item._avail;
    if (pickedWindowTs && maxForSlot <= 0) {
      toast.error(`${item.name} is fully booked during this time frame.`);
      return;
    }

    const key = cartKeyOf(item);
    setCart(prev => {
      const existing = prev.find(c => cartKeyOf(c) === key);
      if (existing) {
        if (item.inventory_mode === 'unit') return prev; 
        if (existing.req_qty >= maxForSlot) {
          setTimeout(() => toast.error(`Only ${maxForSlot} available during this time slot.`), 0);
          return prev;
        }
        return prev.map(c => cartKeyOf(c) === key ? { ...c, req_qty: c.req_qty + 1 } : c);
      }
      return [...prev, { ...item, req_qty: 1 }];
    });
  }, [isRoomClosed, pickedWindowTs, getAvailableQtyAtSlot]);

  const removeFromCart = useCallback((item) => setCart(prev => prev.filter(c => cartKeyOf(c) !== cartKeyOf(item))), []);

  const adjustCartQty = useCallback((item, delta) => {
    if (item.inventory_mode === 'unit') return;
    const key = cartKeyOf(item);
    setCart(prev => {
      const existing = prev.find(c => cartKeyOf(c) === key);
      if (!existing) return prev;
      const next = existing.req_qty + delta;
      if (next <= 0) return prev.filter(c => cartKeyOf(c) !== key);

      let maxForSlot = pickedWindowTs ? getAvailableQtyAtSlot(item, pickedWindowTs) : item._avail;
      if (next > maxForSlot) {
        setTimeout(() => toast.error(`Only ${maxForSlot} available during this time slot.`), 0);
        return prev;
      }
      return prev.map(c => cartKeyOf(c) === key ? { ...c, req_qty: next } : c);
    });
  }, [pickedWindowTs, getAvailableQtyAtSlot]);

  const handleDateSelect = useCallback((dateStr) => {
    setSelectedDate(prev => prev === dateStr ? null : dateStr);
    setIsTimeframeConfirmed(false);
  }, []);

  const handleRoomChange = useCallback(() => {
    setSelectedRoomId(''); setSelectedDate(null); setPickupTime(''); setDuration(null);
    setEndDate(''); setReturnTime(''); setCart([]); setCalendarOpen(true);
    setIsTimeframeConfirmed(false); setInventory([]); setCalendarEvents([]); setInventorySearch('');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !pickedWindowTs) return;
    const finalPurpose = purpose === 'Other' ? customPurpose.trim() : purpose;
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRx.test(email.trim())) return toast.error('Please enter a valid email address.');
    if (!currentSlotOk) return toast.error('Time conflict — please choose a different slot or remove conflicting items.');

    setSubmitting(true);
    try {
      const payload = {
        room_id: selectedRoomId, purpose: finalPurpose, email: email.trim(),
        pickup_datetime: new Date(pickedWindowTs.startTs).toISOString(),
        return_deadline: new Date(pickedWindowTs.endTs).toISOString(),
        items: cart.map(c => ({
          inventory_type_id: c.inventory_type_id, quantity: c.req_qty, qty_requested: c.req_qty,
          ...(c.inventory_mode === 'unit'     && { inventory_item_id: c.item_id }),
          ...(c.inventory_mode === 'quantity' && { stock_id: c.stock_id ?? c.id }),
          ...(c.kind === 'consumable'         && { consumable_id: c.consumable_id ?? c.id }),
        })),
      };

      const res = await createRequest(payload);
      setSuccessData(res.data.data ?? res.data);
      setIsCartOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to submit request. Please try again.');
      fetchInventory(); fetchCalendarEvents();
    } finally { setSubmitting(false); }
  }, [canSubmit, purpose, customPurpose, email, currentSlotOk, pickedWindowTs, selectedRoomId, cart, fetchInventory, fetchCalendarEvents]);

  const cartTotalItems = cart.reduce((s, c) => s + c.req_qty, 0);
  const pickupTimeDisplay = pickedWindowTs ? fmtTime(new Date(pickedWindowTs.startTs)) : null;
  const returnTimeDisplay = pickedWindowTs ? fmtTime(new Date(pickedWindowTs.endTs))   : null;
  const returnDateDisplay = pickedWindowTs ? fmtDateShort(new Date(pickedWindowTs.endTs).toISOString().split('T')[0]) : null;

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] bg-white overflow-hidden relative">

      {!selectedRoomId ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-white to-slate-100">
          <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6 shadow-inner">
            <MapPin size={40} />
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-2">Select a Laboratory</h1>
          <p className="text-gray-500 font-medium mb-8">Choose your room to begin booking.</p>
          <select
            className="w-full max-w-sm bg-white border-2 border-primary/20 hover:border-primary shadow-lg rounded-2xl px-6 py-4 text-lg font-black text-gray-800 outline-none cursor-pointer transition-all appearance-none"
            value={selectedRoomId}
            onChange={e => setSelectedRoomId(e.target.value)}
          >
            <option value="" disabled>Tap to choose a room…</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name || r.code}</option>)}
          </select>
        </div>

      ) : isRoomClosed ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <DoorClosed size={64} className="text-red-300 mb-4" />
          <h2 className="text-2xl font-black text-red-600">Laboratory Closed</h2>
          <p className="text-gray-500 mt-2 max-w-xs">{currentRoom?.unavailable_reason || 'This room is currently unavailable for bookings.'}</p>
          {!initialRoom && (
            <button onClick={handleRoomChange} className="mt-6 flex items-center gap-2 text-primary font-bold text-sm hover:underline">
              <ArrowLeft size={16} /> Choose a different room
            </button>
          )}
        </div>

      ) : (
        <>
          <div className="flex-shrink-0 bg-gray-900 text-white px-4 py-3 flex items-center justify-between z-20 shadow-md">
            <div className="flex items-center gap-2.5 min-w-0">
              <MapPin size={15} className="text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-gray-400 font-medium leading-none mb-0.5">Booking for</p>
                <p className="text-sm font-black leading-none truncate">{currentRoom?.name || currentRoom?.code}</p>
              </div>
            </div>
            {!initialRoom && (
              <button onClick={handleRoomChange} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-gray-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex-shrink-0 ml-3">
                <X size={12} /> Change
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto" id="request-canvas">

            {calendarOpen ? (
              <div className="border-b border-black/5">
                <div className="px-4 py-3 flex items-center gap-2.5">
                  <StepBadge step="1" complete={step1Done} locked={false} />
                  <CalendarDays size={14} className={step1Done ? 'text-emerald-600' : 'text-gray-500'} />
                  <span className={`text-xs font-black uppercase tracking-wider ${step1Done ? 'text-emerald-700' : 'text-gray-700'}`}>Pick a Start Date</span>
                </div>
                <div className="px-4 pb-4">
                  <div className="h-[80vh] min-h-[500px] md:h-[550px] border border-black/10 rounded-2xl overflow-hidden bg-white shadow-sm flex flex-col relative">
                    <AvailabilityCalendar
                      roomId={selectedRoomId}
                      onDateSelect={handleDateSelect}
                      selectedDate={selectedDate}
                      publicMode={true} 
                      catalogNode={
                        selectedDate ? (
                          <div className="p-4 mt-auto sticky bottom-0 bg-white border-t border-gray-200 z-10 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)]">
                            <button onClick={() => setCalendarOpen(false)} className="w-full py-4 bg-primary text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-md shadow-primary/20">
                              Continue to Book on {fmtDateShort(selectedDate)} <ArrowDown size={16} />
                            </button>
                          </div>
                        ) : null
                      }
                    />
                  </div>
                  {!selectedDate && <p className="text-center mt-4 text-xs text-gray-400 font-medium px-4">Tap a date on the calendar to view its availability.</p>}
                </div>
              </div>
            ) : (
              <div className="border-b border-black/5 px-4 py-2.5 flex items-center gap-3 bg-white">
                <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0"><Check size={12} /></div>
                <CalendarDays size={14} className="text-emerald-600 flex-shrink-0" />
                <p className="flex-1 text-sm font-black text-gray-800">{fmtDateShort(selectedDate)}</p>
                <button onClick={() => setCalendarOpen(true)} className="text-xs font-bold text-gray-400 hover:text-primary bg-gray-100 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0">Change Start Date</button>
              </div>
            )}

            {!calendarOpen && (
              <div className="border-b border-black/5">
                <div className="px-4 py-3 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <StepBadge step="2" complete={step2Done} locked={false} />
                    <Timer size={14} className={step2Done ? 'text-emerald-600 flex-shrink-0' : 'text-gray-500 flex-shrink-0'} />
                    <span className={`text-xs font-black uppercase tracking-wide truncate ${step2Done ? 'text-emerald-700' : 'text-gray-700'}`}>
                      {step2Done ? `${pickupTimeDisplay} – ${returnTimeDisplay} ${bookingMode === 'multiday' ? `(${returnDateDisplay})` : ''}` : 'Pick a timeframe'}
                    </span>
                  </div>
                  {step2Done && (
                    <button onClick={() => setIsTimeframeConfirmed(false)} className="ml-2 text-xs font-bold text-gray-400 hover:text-primary bg-gray-100 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">Edit Time</button>
                  )}
                </div>

                {!isTimeframeConfirmed && (
                  <div className="px-4 pb-4 space-y-4">
                    <div className="flex p-1 bg-gray-100 rounded-xl">
                      <button onClick={() => { setBookingMode('sameday'); setDuration(null); setEndDate(''); setReturnTime(''); }} className={`flex-1 py-2.5 text-xs font-black rounded-lg transition-all ${bookingMode === 'sameday' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>Same Day Return</button>
                      <button onClick={() => { setBookingMode('multiday'); setDuration(null); setEndDate(''); setReturnTime(''); }} className={`flex-1 py-2.5 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${bookingMode === 'multiday' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}><CalendarRange size={14} /> Multi-Day</button>
                    </div>

                    {allDayBookings.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-500 mb-2">Room bookings on {fmtDateShort(selectedDate)}:</p>
                        <TimelineBar bookings={allDayBookings} pickedWindow={visualPickedWindow} />
                        <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-0.5 font-medium">
                          <span>7 AM</span><span className="hidden sm:inline">10 AM</span><span>12 PM</span><span className="hidden sm:inline">3 PM</span><span>5 PM</span><span>8 PM</span>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-4">
                      <div className="flex-1">
                        
                        {/* ⚡ UPDATED: Pickup Time Label with Lunch Break Warning */}
                        <label className="flex items-center flex-wrap gap-2 text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                          Pickup Time
                          <span className="text-amber-600 normal-case tracking-normal text-[9px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1 shadow-sm">
                            <Clock size={10} /> Lunch Break: 11:30 AM - 1:00 PM
                          </span>
                        </label>
                        
                        <CustomTimePicker 
                          value={pickupTime} 
                          onChange={(val) => { setPickupTime(val); setDuration(null); }} 
                        />
                      </div>
                    </div>

                    {/* ── SAME DAY UI ── */}
                    {pickupTime && bookingMode === 'sameday' && (
                      <div className="border-t border-black/5 pt-4 mt-3">
                        <p className="text-[11px] font-bold text-gray-600 mb-2 uppercase tracking-wide">Return Duration</p>
                        <div className="flex flex-wrap items-center gap-2">
                          
                          {/* Quick Selects */}
                          {DURATION_OPTIONS.map(opt => {
                            const tmpEnd = new Date(new Date(toISO(selectedDate, pickupTime)).getTime() + opt.mins * 60000);
                            const tHour = tmpEnd.getHours(); const tMin = tmpEnd.getMinutes();
                            let valid = true;
                            if (tHour >= 20 && tMin > 0) valid = false;
                            if (timeToMins(pickupTime) < BREAK_END_MINS && (timeToMins(pickupTime) + opt.mins) > BREAK_START_MINS) valid = false;

                            const sel = duration === opt.mins;
                            return (
                              <button key={opt.mins} disabled={!valid} onClick={() => setDuration(sel ? null : opt.mins)} aria-pressed={sel} className={`px-4 py-2.5 rounded-xl border-2 text-xs font-black transition-all ${!valid ? 'border-gray-200 bg-gray-100 text-gray-400 line-through cursor-not-allowed' : sel ? 'border-primary bg-primary text-white shadow-sm' : 'border-black/10 bg-white text-gray-700 hover:border-primary/40'}`}>{opt.label}</button>
                            );
                          })}

                          {/* ⚡ Clock-Style Custom Dropdown */}
                          <div className={`flex items-center bg-white border-2 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl pl-3 pr-2 py-1.5 transition-all ${(!DURATION_OPTIONS.some(o => o.mins === duration) && duration) ? 'border-primary shadow-sm' : 'border-black/10'}`}>
                            <span className="text-[10px] font-black text-gray-400 uppercase mr-3">Custom</span>
                            
                            <select 
                              value={Math.floor((duration || 0) / 60)} 
                              onChange={(e) => {
                                const h = parseInt(e.target.value, 10);
                                const m = (duration || 0) % 60;
                                const total = (h * 60) + m;
                                setDuration(total === 0 ? null : total);
                              }}
                              className="bg-transparent text-sm font-black text-gray-800 outline-none cursor-pointer appearance-none text-center"
                            >
                              {Array.from({ length: 13 }, (_, i) => (
                                <option key={`dh-${i}`} value={i}>{String(i).padStart(2, '0')}</option>
                              ))}
                            </select>
                            <span className="text-[10px] text-gray-400 font-bold ml-0.5 uppercase">hr</span>

                            <span className="text-gray-300 font-bold mx-1.5">:</span>

                            <select 
                              value={(duration || 0) % 60} 
                              onChange={(e) => {
                                const h = Math.floor((duration || 0) / 60);
                                const m = parseInt(e.target.value, 10);
                                const total = (h * 60) + m;
                                setDuration(total === 0 ? null : total);
                              }}
                              className="bg-transparent text-sm font-black text-gray-800 outline-none cursor-pointer appearance-none text-center"
                            >
                              {Array.from({ length: 60 }, (_, i) => (
                                <option key={`dm-${i}`} value={i}>{String(i).padStart(2, '0')}</option>
                              ))}
                            </select>
                            <span className="text-[10px] text-gray-400 font-bold ml-0.5 pr-1 uppercase">min</span>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* ── MULTI-DAY UI ── */}
                    {pickupTime && bookingMode === 'multiday' && (
                      <div className="border-t border-black/5 pt-4 mt-3 space-y-4">
                        
                        {/* Quick Return Buttons */}
                        <div>
                          <p className="text-[11px] font-bold text-gray-600 mb-2 uppercase tracking-wide">Quick Return Options</p>
                          <div className="flex flex-wrap items-center gap-2">
                            {[ {label: 'Tomorrow', d: 1}, {label: '2 Days', d: 2}, {label: '3 Days', d: 3}, {label: '1 Week', d: 7} ].map(opt => {
                              const [y, m, d] = selectedDate.split('-').map(Number);
                              const futureDate = new Date(y, m - 1, d + opt.d);
                              const futureStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
                              
                              const sel = endDate === futureStr;
                              return (
                                <button 
                                  key={opt.label} 
                                  onClick={() => { 
                                    setEndDate(futureStr); 
                                    // Auto-fill time to match pickup time if empty
                                    if (!returnTime) setReturnTime(pickupTime); 
                                  }} 
                                  className={`px-4 py-2.5 rounded-xl border-2 text-xs font-black transition-all ${sel ? 'border-primary bg-primary text-white shadow-sm' : 'border-black/10 bg-white text-gray-700 hover:border-primary/40'}`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Custom Date/Time Pickers */}
                        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-2xl border border-black/5">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Custom Return Date</label>
                            <input type="date" min={minMultiDate} value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-white border border-black/10 focus-within:ring-2 focus-within:ring-primary/20 focus:border-primary rounded-xl px-3 py-2.5 text-sm font-black text-gray-800 outline-none transition-all cursor-pointer" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Custom Return Time</label>
                            {/* Uses your existing clock-style CustomTimePicker component! */}
                            <CustomTimePicker 
                              value={returnTime} 
                              onChange={(val) => setReturnTime(val)} 
                            />
                          </div>
                        </div>

                      </div>
                    )}

                    {pickedWindowTs && (
                      <div className={`text-xs font-bold px-4 py-3.5 rounded-xl flex flex-col gap-2 transition-all leading-relaxed ${currentSlotOk ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                        <div className="flex items-start gap-2.5">
                          {currentSlotOk ? <><Check size={16} className="shrink-0 mt-0.5" /><span>Timeframe valid. Confirm below to proceed.</span></>
                           : <><AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{slotError}</span></>}
                        </div>

                        {!currentSlotOk && slotError?.includes('Cart conflict') && (
                          <button onClick={() => setCart([])} className="mt-1 w-full py-2.5 bg-red-100 hover:bg-red-200 text-red-700 font-black rounded-lg transition-colors border border-red-200 text-[11px] uppercase tracking-wider shadow-sm">
                            Clear Cart to Resolve Conflict
                          </button>
                        )}

                        {currentSlotOk && (
                          <button onClick={() => setIsTimeframeConfirmed(true)} className="mt-2 w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl transition-colors shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2">
                            <CheckCircle2 size={16} /> Confirm Timeframe
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {step2Done && (
                  <div className="px-4 pb-3">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm">
                      <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
                      <span className="text-xs font-bold text-emerald-700">Timeframe locked in. Browse equipment below.</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!calendarOpen && (
              <div className="border-b border-black/5">
                <div className="px-4 py-3 flex items-center gap-2.5">
                  <StepBadge step="3" complete={step3Done} locked={!step2Done} />
                  <Layers size={14} className={step3Done ? 'text-emerald-600' : step2Done ? 'text-gray-500' : 'text-gray-300'} />
                  <span className={`text-xs font-black uppercase tracking-wider ${step3Done ? 'text-emerald-700' : step2Done ? 'text-gray-700' : 'text-gray-400'}`}>
                    Equipment{step3Done ? ` · ${cartTotalItems} item${cartTotalItems > 1 ? 's' : ''} added` : ''}
                  </span>
                  {!step2Done && <Lock size={12} className="ml-auto text-gray-300" />}
                </div>

                {!step2Done ? (
                  <div className="px-4 pb-4">
                    <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 py-6 px-4 text-center">
                      <Lock size={24} className="text-gray-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-gray-400">Confirm your timeframe above to browse equipment.</p>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 pb-4 space-y-3">
                    <div className="relative bg-white border border-black/10 rounded-xl flex items-center px-3 py-3 shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20 transition-colors">
                      <Search size={16} className="text-gray-400 flex-shrink-0" />
                      <input type="search" placeholder="Search by name or barcode…" value={inventorySearch} onChange={e => setInventorySearch(e.target.value)} className="flex-1 min-w-0 bg-transparent border-none px-3 py-0 text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400" />
                      {inventorySearch && <button onClick={() => setInventorySearch('')} className="p-1.5 bg-gray-100 rounded-full text-gray-500 hover:text-gray-900 flex-shrink-0"><X size={14} /></button>}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-gray-400 px-0.5 font-medium">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-red-400/75 inline-block" />Booked</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-teal-400/75 inline-block" />Your slot</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-gray-200 inline-block" />Free</span>
                    </div>

                    {loadingInv ? (
                      <div className="flex items-center justify-center py-10"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
                    ) : groupedInventory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 opacity-50">
                        <PackageX size={36} className="text-gray-400 mb-2" />
                        <p className="text-gray-500 font-bold text-sm text-center px-4">{inventorySearch ? `No equipment matching "${inventorySearch}"` : 'No equipment found for this room'}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {groupedInventory.map(group => (
                          <InventoryGroupCard
                            key={group.name} group={group} cart={cart} pickedWindowTs={pickedWindowTs} visualPickedWindow={visualPickedWindow}
                            step2Done={step2Done} getBookingsForGroup={getBookingsForGroup} getBookingsForItem={getBookingsForItem}
                            getAvailableQtyAtSlot={getAvailableQtyAtSlot} selectedDate={selectedDate} onAdd={addToCart} onRemove={removeFromCart} onAdjustQty={adjustCartQty}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="h-32" aria-hidden />
          </div>

          {/* ⚡ FLOATING ACTION BAR FOR CART */}
          {selectedDate && !calendarOpen && (
            <>
              <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-black/10 px-4 py-4 z-[60] shadow-[0_-10px_30px_rgba(0,0,0,0.08)]">
                <div className="flex items-center justify-between gap-3 max-w-4xl mx-auto mb-2 md:mb-0">
                   <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { if(cartTotalItems > 0 && step2Done) setIsCartOpen(true); }}>
                      {cartTotalItems > 0 ? (
                        <div className="flex items-center gap-3">
                           <div className="relative">
                              <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-md"><ShoppingBag size={20} /></div>
                              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[11px] font-black min-w-[22px] h-[22px] px-1 flex items-center justify-center rounded-full border-2 border-white shadow-sm">{cartTotalItems}</span>
                           </div>
                           <div className="min-w-0">
                              <p className="text-sm font-black text-gray-900 truncate">{cartTotalItems} item{cartTotalItems > 1 ? 's' : ''} added</p>
                              <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">{step2Done ? 'Tap to view cart & confirm' : '⚠ Confirm timeframe to proceed'}</p>
                           </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                           <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400"><ShoppingBag size={20} /></div>
                           <div>
                              <p className="text-sm font-bold text-gray-400">Cart is empty</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">Select items to continue</p>
                           </div>
                        </div>
                      )}
                   </div>
                   
                   <button disabled={cartTotalItems === 0 || !step2Done} onClick={() => setIsCartOpen(true)} className="px-6 py-3.5 bg-gray-900 text-white font-black text-sm rounded-xl shadow-lg shadow-gray-900/30 disabled:opacity-40 disabled:shadow-none hover:bg-black transition-all active:scale-95 flex items-center gap-2">
                      Review <ChevronUp size={16} className="opacity-70" />
                   </button>
                </div>
              </div>

              {/* ⚡ FLOATING CART MODAL (BOTTOM SHEET) */}
              {isCartOpen && (
                <div className="fixed inset-0 z-[100] flex flex-col justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsCartOpen(false)}>
                  <div className="bg-white rounded-t-3xl w-full max-w-3xl mx-auto max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-full duration-300 shadow-2xl" onClick={e => e.stopPropagation()}>
                     
                     <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white rounded-t-3xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><ShoppingBag size={18} /></div>
                          <div>
                            <h2 className="text-base font-black text-gray-900 leading-none">Your Cart</h2>
                            <p className="text-[11px] font-bold text-gray-500 mt-1 uppercase tracking-wider">{cartTotalItems} item{cartTotalItems > 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <button onClick={() => setIsCartOpen(false)} className="p-2.5 bg-gray-100 rounded-full text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"><X size={18} /></button>
                     </div>
                     
                     <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6 bg-slate-50/50 pb-8">
                        <div className="space-y-2.5">
                          {cart.map(item => <CartRow key={cartKeyOf(item)} item={item} onAdjust={adjustCartQty} onRemove={removeFromCart} />)}
                        </div>

                        <div className="space-y-2 bg-white p-5 rounded-2xl border border-black/5 shadow-sm">
                          <label htmlFor="purpose-select" className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-2">Purpose <span className="text-red-400">*</span></label>
                          <select id="purpose-select" className="w-full bg-slate-50 border border-black/10 rounded-xl px-4 py-3.5 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none" value={purpose} onChange={e => setPurpose(e.target.value)}>
                            <option value="" disabled>Select purpose…</option>
                            {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                          {purpose === 'Other' && <input type="text" placeholder="Briefly describe your purpose…" className="w-full bg-slate-50 border border-black/10 rounded-xl px-4 py-3.5 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all mt-3" value={customPurpose} onChange={e => setCustomPurpose(e.target.value)} maxLength={120} />}
                        </div>

                        <div className="space-y-2 bg-white p-5 rounded-2xl border border-black/5 shadow-sm">
                          <label htmlFor="notif-email" className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-2">Notification email <span className="text-red-400">*</span></label>
                          <div className="relative">
                            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            <input id="notif-email" type="email" placeholder="your@email.com" autoComplete="email" className="w-full bg-slate-50 border border-black/10 rounded-xl pl-10 pr-4 py-3.5 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" value={email} onChange={e => setEmail(e.target.value)} />
                          </div>
                        </div>

                        {!currentSlotOk && (
                          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3.5 flex items-start gap-2.5 shadow-sm">
                            <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs font-bold text-red-600 leading-relaxed">{slotError || 'Timeframe conflict. Close cart to resolve.'}</p>
                          </div>
                        )}

                        <div className="pt-2">
                          <button onClick={handleSubmit} disabled={submitting || !canSubmit} className="w-full py-4 bg-primary hover:bg-primary/90 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:shadow-none disabled:active:scale-100">
                            {submitting ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={18} /> Confirm Reservation</>}
                          </button>
                          {!canSubmit && !submitting && (
                            <p className="text-center text-[10px] font-bold text-gray-400 mt-3 uppercase tracking-wider">
                              {!currentSlotOk ? '⚠ Resolve time conflict to continue' : !purpose ? 'Select a purpose' : purpose === 'Other' && !customPurpose.trim() ? 'Describe your purpose' : 'Add a valid notification email'}
                            </p>
                          )}
                        </div>
                     </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SUCCESS MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {successData && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-sm overflow-hidden text-center bg-white shadow-2xl rounded-[40px] animate-in zoom-in-95 duration-400">
            {!confirmClose ? (
              <>
                <div className="bg-emerald-500 text-white p-8 pb-10 rounded-b-[40px]">
                  <div className="w-20 h-20 bg-white text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl"><CheckCircle2 size={40} /></div>
                  <h2 className="text-2xl font-black tracking-tight">Request Sent!</h2>
                  <p className="text-sm mt-2 opacity-90 leading-relaxed">{fmtDateLong(successData.pickup_datetime)}<br />{fmtTime(successData.pickup_datetime)}</p>
                </div>
                <div className="p-8 -mt-6 relative">
                  <div className="p-4 bg-white shadow-xl rounded-3xl inline-block mx-auto mb-5 border border-gray-100">
                    <QRCodeSVG value={String(successData.qr_code)} size={180} level="M" />
                  </div>
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-5">
                    <p className="font-black text-amber-900 text-[11px] flex items-center justify-center gap-1.5 mb-1"><Camera size={14} className="animate-pulse" /> SCREENSHOT THIS QR CODE</p>
                    <p className="text-[11px] text-amber-800 font-medium">Show this QR code at the counter during your pickup window. You won't be able to retrieve it after closing this screen.</p>
                  </div>
                  <button className="w-full py-4 bg-gray-900 hover:bg-black text-white text-sm rounded-2xl font-black transition-all" onClick={() => setConfirmClose(true)}>I've saved my QR code</button>
                </div>
              </>
            ) : (
              <div className="p-8">
                <AlertTriangle size={48} className="text-amber-500 mx-auto mb-4" />
                <h2 className="text-xl font-black mb-2">Did you save the QR?</h2>
                <p className="text-sm text-gray-500 mb-6">Once you exit, you won't be able to retrieve this QR code.</p>
                <div className="space-y-3">
                  <button className="w-full py-3 font-black bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors" onClick={() => setConfirmClose(false)}>Go back to QR code</button>
                  <button className="w-full py-3 text-xs font-black text-red-500 hover:text-red-700 transition-colors" onClick={() => window.location.reload()}>Yes, I'm done — exit</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}