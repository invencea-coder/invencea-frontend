// src/components/AvailabilityCalendar.jsx
import { useState, useMemo, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { X, Clock, Package, ListTodo } from "lucide-react";
import api from "../api/axiosClient";

const STATUS = {
  APPROVED:           { label: "Reserved",       dot: "#BA7517", barBg: "#FAEEDA", barBorder: "#EF9F27", barText: "#633806" },
  ISSUED:             { label: "Issued",         dot: "#185FA5", barBg: "#E6F1FB", barBorder: "#378ADD", barText: "#042C53" },
  "PARTIALLY RETURNED": { label: "Partial return", dot: "#534AB7", barBg: "#EEEDFE", barBorder: "#7F77DD", barText: "#26215C" },
  PENDING:            { label: "Pending",        dot: "#888780", barBg: "#F1EFE8", barBorder: "#B4B2A9", barText: "#2C2C2A" },
};

// ── Philippine Time helpers ──────────────────────────────────────────────────
const toPHTime = (d) => {
  if (!d) return null;
  let str = typeof d === "string" ? d : String(d);
  if (str.includes("T") && !str.endsWith("Z") && !str.includes("+") && !str.includes("-", 10)) str += "Z";
  return new Date(str);
};
function pad(n) { return String(n).padStart(2, "0"); }
function toDateStr(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function fmtTime(date) {
  if (!date) return "—";
  try { return date.toLocaleString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true }); }
  catch { return "—"; }
}
function fmtDate(date) {
  if (!date) return "—";
  try { return date.toLocaleDateString("en-US", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric" }); }
  catch { return date.toDateString(); }
}
function fmtDateShort(date) {
  if (!date) return "—";
  try { return date.toLocaleDateString("en-US", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", year: "numeric" }); }
  catch { return date.toDateString(); }
}

function getEventRange(event) {
  const rawStart = event.start || event.pickup_start || event.pickup_datetime || event.issued_time || event.scheduled_time || event.created_at;
  const rawEnd   = event.end   || event.return_deadline || event.pickup_end;
  return {
    start:    rawStart ? toPHTime(rawStart) : null,
    end:      rawEnd   ? toPHTime(rawEnd)   : null,
    isWalkIn: !event.pickup_start && !event.pickup_datetime && !event.scheduled_time && (!event.start || event.requester_type === "walkin"),
  };
}

function touchesDate(event, dateStr) {
  const { start, end } = getEventRange(event);
  if (!start) return false;
  const dayStart = new Date(dateStr + "T00:00:00");
  const dayEnd   = new Date(dateStr + "T23:59:59");
  const evEnd    = end || new Date(start.getTime() + 3_600_000);
  return start <= dayEnd && evEnd >= dayStart;
}

// ⚡ DYNAMIC EXPIRATION CHECKER
const isCalendarEventExpired = (ev) => {
  const status = String(ev.status || ev.request_status || '').toUpperCase();
  // Active issuances are never expired
  if (['ISSUED', 'PARTIALLY RETURNED'].includes(status)) return false;
  
  const now = Date.now();
  
  // 15 minute grace period for scheduled pickups
  if (ev.pickup_datetime) {
    return now > new Date(ev.pickup_datetime).getTime() + 15 * 60_000;
  }
  if (ev.scheduled_time) {
    return now > new Date(ev.scheduled_time).getTime() + 15 * 60_000;
  }
  if (ev.pickup_start) {
    const e = new Date(ev.pickup_start); 
    e.setHours(23, 59, 59, 999);
    return now > e.getTime();
  }
  if (ev.created_at) {
    const e = new Date(ev.created_at); 
    e.setHours(23, 59, 59, 999);
    return now > e.getTime();
  }
  return false;
};

const S = {
  navBtn: { background: "none", border: "0.5px solid #d1d0cc", borderRadius: "6px", cursor: "pointer", fontSize: "15px", color: "#111", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center" },
};

function StatusBadge({ status }) {
  const cfg = STATUS[status] || STATUS.PENDING;
  return (
    <span style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 6px", borderRadius: "4px", background: cfg.barBg, color: cfg.barText, border: `1px solid ${cfg.barBorder}` }}>
      {cfg.label}
    </span>
  );
}

export default function AvailabilityCalendar({ roomId, onDateSelect, selectedDate, requestCountByDate, publicMode = false, onAddToCart, catalogNode, onViewList }) {
  const today = new Date();
  const [year, setYear]     = useState(today.getFullYear());
  const [month, setMonth]   = useState(today.getMonth());
  const [selected, setSelected] = useState(today);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [itemFilter, setItemFilter] = useState('');
  
  // MASTER-DETAIL STATE
  const [selectedBooking, setSelectedBooking] = useState(null);

  const fetchEvents = useCallback(async () => {
    if (!roomId) return;
    setLoading(true); setError(null);
    try {
      const res = await api.get('/requests/calendar', { params: { room_id: roomId } });
      const fetchedData = Array.isArray(res.data.data) ? res.data.data : [];
      
      // ⚡ STRICT WHITELIST, EXPIRATION, AND ROOM ISOLATION
      const validEvents = fetchedData.filter(ev => {
        const status = String(ev.status || ev.request_status || '').toUpperCase();
        const isWhitelisted = ['PENDING', 'PENDING APPROVAL', 'APPROVED', 'ISSUED', 'PARTIALLY RETURNED'].includes(status);
        
        // Ensure the event belongs to this exact calendar's room
        const evRoomId = ev.room_id || ev.roomId;
        const isCorrectRoom = !evRoomId || String(evRoomId) === String(roomId);

        return isWhitelisted && isCorrectRoom && !isCalendarEventExpired(ev);
      });

      setEvents(validEvents);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const activeDate = onDateSelect
    ? (selectedDate ? new Date(selectedDate.split('-')[0], selectedDate.split('-')[1] - 1, selectedDate.split('-')[2]) : null)
    : selected;

  const filteredEvents = useMemo(() => {
    if (!itemFilter.trim()) return events;
    const q = itemFilter.toLowerCase();
    return events.filter(ev => (ev.items || []).some(i => {
      const name = (i.item_name || i.name || '').toLowerCase();
      const bc   = (i.inventory_item_barcode || i.stock_barcode || i.consumable_barcode || i.barcode || '').toLowerCase();
      return name.includes(q) || bc.includes(q);
    }));
  }, [events, itemFilter]);

  const grid = useMemo(() => {
    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push({ date: new Date(year, month, i - first.getDay() + 1), cur: false });
    for (let d = 1; d <= last.getDate(); d++) cells.push({ date: new Date(year, month, d), cur: true });
    while (cells.length < 42) cells.push({ date: new Date(year, month + 1, cells.length - last.getDate() - first.getDay() + 1), cur: false });
    return cells;
  }, [year, month]);

  function eventsFor(date) {
    const ds = toDateStr(date);
    return filteredEvents.filter(e => touchesDate(e, ds));
  }

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const handleCellClick = (date) => {
    if (onDateSelect) onDateSelect(format(date, 'yyyy-MM-dd'));
    else setSelected(prev => prev && prev.toDateString() === date.toDateString() ? null : date);
  };

  const handleClosePanel = () => {
    if (onDateSelect) onDateSelect(null);
    else setSelected(null);
  };

  const monthLabel = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const selEvents  = activeDate ? eventsFor(activeDate) : [];
  const panelOpen  = !!activeDate;
  const hasFilter  = itemFilter.trim().length > 0;

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", fontFamily: "var(--font-sans, system-ui, sans-serif)", background: "#f8fafc", overflow: "hidden" }}>

      {/* ───────── LEFT: Monthly grid ───────── */}
      <div style={{ width: panelOpen ? "360px" : "100%", flexShrink: 0, transition: "width 0.3s ease", background: "#fff", borderRight: panelOpen ? "1px solid #e2e8f0" : "none", display: "flex", flexDirection: "column", padding: "24px", gap: "16px", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyItems: "space-between", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#111827" }}>Availability Calendar</div>
            <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "3px", fontWeight: 500 }}>
              {loading ? "Loading…" : error ? `Error: ${error}` : "Click a date to view equipment timeline"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <button onClick={prevMonth} style={S.navBtn}>‹</button>
            <span style={{ fontSize: "12px", fontWeight: 700, minWidth: "100px", textAlign: "center", color: "#111" }}>{monthLabel} {year}</span>
            <button onClick={nextMonth} style={S.navBtn}>›</button>
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <div style={{ background: hasFilter ? "#EFF6FF" : "#F8FAFC", border: hasFilter ? "1.5px solid #3B82F6" : "1.5px solid #E2E8F0", borderRadius: "12px", padding: "10px 12px 10px 38px", transition: "all 0.2s" }}>
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "16px" }}>🔍</span>
            <input type="text" placeholder="Magic Search across all dates…" value={itemFilter} onChange={e => setItemFilter(e.target.value)} style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: "12px", fontWeight: hasFilter ? 700 : 500, color: hasFilter ? "#1D4ED8" : "#374151" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", padding: "4px 0" }}>
          {Object.entries(STATUS).map(([key, cfg]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
              <span style={{ fontSize: "10px", fontWeight: 600, color: "#6b7280" }}>{cfg.label}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: "10px", fontWeight: 700, color: "#9ca3af", paddingBottom: "8px" }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
          {grid.map(({ date, cur }, i) => {
            const ds      = format(date, 'yyyy-MM-dd');
            const dayEvts = eventsFor(date);
            const isToday = ds === format(today, 'yyyy-MM-dd');
            const isSel   = activeDate && ds === format(activeDate, 'yyyy-MM-dd');
            const groups  = {};
            dayEvts.forEach(e => { groups[e.status] = (groups[e.status] || 0) + 1; });
            const hasMatch = hasFilter && dayEvts.length > 0;

            return (
              <div key={i} onClick={() => cur && handleCellClick(date)}
                style={{
                  padding: "6px 4px", borderRadius: "10px", cursor: cur ? "pointer" : "default",
                  background: isSel ? "#EFF6FF" : hasMatch ? "#FEF3C7" : isToday ? "#F3F4F6" : "transparent",
                  border: isSel ? "1.5px solid #3B82F6" : hasMatch ? "1.5px solid #F59E0B" : isToday ? "1.5px solid #D1D5DB" : "1.5px solid transparent",
                  opacity: cur ? 1 : 0.25, transition: "all 0.15s", minHeight: "56px", position: "relative", display: "flex", flexDirection: "column", alignItems: "center"
                }}>
                <div style={{ fontSize: "13px", fontWeight: isToday || isSel ? 800 : 600, color: isSel ? "#1D4ED8" : isToday ? "#374151" : hasMatch ? "#B45309" : "#111827", marginBottom: "4px" }}>
                  {date.getDate()}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", justifyContent: "center" }}>
                  {Object.entries(groups).map(([status, c]) => {
                    const cfg = STATUS[status] || STATUS.PENDING;
                    return Array.from({ length: Math.min(c, 3) }, (_, di) => (
                      <div key={`${status}-${di}`} style={{ width: "6px", height: "6px", borderRadius: "50%", background: cfg.dot }} />
                    ));
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ───────── RIGHT: Vertical Agenda Panel ───────── */}
      {panelOpen && (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 min-w-0 border-l border-gray-200 relative">
          
          {/* Header */}
          <div className="px-6 py-4 bg-white border-b border-gray-200 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-lg font-bold text-gray-900 leading-tight">{fmtDate(activeDate)}</div>
                <div className="text-xs font-medium text-gray-500 mt-0.5">
                  {selEvents.length === 0 
                    ? (hasFilter ? `No bookings with "${itemFilter}"` : "No active bookings") 
                    : `${selEvents.length} booking${selEvents.length > 1 ? "s" : ""}${hasFilter ? ` matching "${itemFilter}"` : ""}`
                  }
                </div>
              </div>
            </div>
            <button onClick={handleClosePanel} className="p-2 bg-slate-100 text-gray-500 rounded-full hover:bg-slate-200 transition-colors"><X size={16}/></button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
            
            {selEvents.length === 0 ? (
              <div className="text-center text-gray-400 py-10">
                <div className="text-3xl mb-3">✨</div>
                <div className="text-sm font-semibold">
                  {hasFilter ? `No items matching "${itemFilter}" on this date.` : "The laboratory is completely free on this date!"}
                </div>
              </div>
            ) : (
              <div className="relative">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5 flex items-center gap-2"><Clock size={14}/> Schedule Timeline</h3>
                
                {/* Vertical Line */}
                <div className="absolute left-[79px] top-12 bottom-4 w-px bg-gray-200 z-0"></div>
                
                <div className="flex flex-col gap-4 relative z-10">
                  {selEvents.sort((a,b) => (getEventRange(a).start?.getTime()||0) - (getEventRange(b).start?.getTime()||0)).map(event => {
                    const { start, end } = getEventRange(event);
                    const cfg = STATUS[event.status] || STATUS.PENDING;
                    
                    // Check if it spans multiple days
                    const spansMultipleDays = start && end && start.toDateString() !== end.toDateString();

                    return (
                      <div key={event.id} onClick={() => setSelectedBooking(event)} className="flex items-start gap-4 group cursor-pointer">
                        
                        <div className="w-16 pt-2.5 text-right shrink-0 bg-slate-50">
                          <p className="text-xs font-bold text-gray-900">{fmtTime(start)}</p>
                          <p className="text-[10px] font-medium text-gray-400 mt-0.5 leading-tight">
                            {end ? (
                              spansMultipleDays ? (
                                <>{fmtTime(end)}<br/><span className="text-[9px] text-blue-500">{fmtDateShort(end)}</span></>
                              ) : fmtTime(end)
                            ) : '—'}
                          </p>
                        </div>
                        
                        <div className="pt-3 shrink-0 bg-slate-50 py-2">
                          <div className="w-3 h-3 rounded-full bg-white border-2 group-hover:scale-125 transition-transform shadow-sm" style={{ borderColor: cfg.dot }}></div>
                        </div>
                        
                        {/* ⚡ COMPACTED EVENT CARD */}
                        <div className="flex-1 bg-white border border-gray-200 rounded-xl p-3 shadow-sm group-hover:border-blue-300 group-hover:shadow-md transition-all">
                          <div className="flex justify-between items-start mb-1.5">
                            <StatusBadge status={event.status} />
                            <span className="text-[10px] font-medium text-gray-500">{event.items?.length || 0} Item{event.items?.length !== 1 ? 's' : ''}</span>
                          </div>
                          <p className="text-xs font-bold text-gray-800 truncate">
                            {publicMode ? "Reserved Window" : (event.requester_name || "Unknown")}
                          </p>
                          {event.items?.length > 0 && (
                            <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                              {event.items[0].item_name || event.items[0].name}
                              {event.items.length > 1 && ` + ${event.items.length - 1} more`}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ⚡ ACTION BUTTON FOR ADMINS */}
            {onViewList && (
              <div className="pt-4 border-t border-gray-200 mt-auto">
                <button 
                  onClick={() => onViewList(activeDate)} 
                  className="w-full py-3 bg-blue-50 text-blue-700 font-bold text-xs rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 border border-blue-100 shadow-sm"
                >
                  <ListTodo size={14}/> Manage Requests for {fmtDate(activeDate)}
                </button>
              </div>
            )}

            {/* INJECTING THE FULL CATALOG ONLY WHEN TIMELINE IS VISIBLE */}
            {catalogNode}

          </div>

          {/* ───────── MODAL POPUP FOR BOOKING DETAILS ───────── */}
          {selectedBooking && (() => {
            const { start, end } = getEventRange(selectedBooking);
            return (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setSelectedBooking(null)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                  
                  {/* Modal Header */}
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                    <h2 className="text-sm font-black text-gray-800 flex items-center gap-2">
                      <Clock size={16} className="text-blue-500" />
                      Booking #{selectedBooking.id || 'N/A'}
                    </h2>
                    <button onClick={() => setSelectedBooking(null)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                  
                  {/* Modal Body */}
                  <div className="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-5">
                    
                    {/* Status & User */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={selectedBooking.status} />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          {publicMode ? 'Public View' : (selectedBooking.requester_type || 'User')}
                        </span>
                      </div>
                      <p className="text-lg font-black text-gray-900">
                        {publicMode ? 'Reserved Slot' : (selectedBooking.requester_name || 'Unknown User')}
                      </p>
                      {!publicMode && selectedBooking.student_id && (
                        <p className="text-xs font-medium text-gray-500 mt-0.5">{selectedBooking.student_id}</p>
                      )}
                    </div>

                    {/* ⚡ UPDATED Time Block (With Dates) */}
                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                      <div className="mt-0.5">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mb-1"></div>
                        <div className="w-0.5 h-6 bg-blue-200 mx-auto"></div>
                        <div className="w-2 h-2 rounded-full bg-blue-300 mt-1"></div>
                      </div>
                      <div className="flex-1 space-y-3 text-sm">
                        <div>
                          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Start Time</p>
                          <p className="font-semibold text-gray-900">
                            {fmtTime(start)} <span className="text-[11px] text-gray-500 font-medium ml-1">({fmtDateShort(start)})</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Expected Return</p>
                          <p className="font-semibold text-gray-900">
                            {end ? (
                              <>{fmtTime(end)} <span className="text-[11px] text-gray-500 font-medium ml-1">({fmtDateShort(end)})</span></>
                            ) : '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Purpose */}
                    {!publicMode && selectedBooking.purpose && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Purpose</p>
                        <p className="text-sm font-medium text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-100">
                          {selectedBooking.purpose}
                        </p>
                      </div>
                    )}

                    {/* Items List */}
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <Package size={12} /> Equipment ({selectedBooking.items?.length || 0})
                      </p>
                      <div className="space-y-2">
                        {(selectedBooking.items || []).map((item, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-gray-100">
                              <span className="text-xs font-black text-gray-500">{item.quantity || item.qty_requested || 1}×</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-800 truncate">{item.item_name || item.name}</p>
                              {(item.inventory_item_barcode || item.barcode || item.stock_barcode) && (
                                <p className="text-[10px] font-mono text-gray-500 mt-0.5 truncate">
                                  {item.inventory_item_barcode || item.barcode || item.stock_barcode}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
}