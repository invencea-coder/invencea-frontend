// src/components/AvailabilityCalendar.jsx
import { useState, useMemo, useEffect, useCallback } from "react";
import { format } from "date-fns";
import api from "../api/axiosClient";

const TL_START   = 7;
const TL_END     = 20;          // ← 8 PM
const TL_HOURS   = TL_END - TL_START;
const HOUR_PX    = 54;
const TL_HEIGHT  = TL_HOURS * HOUR_PX;

const STATUS = {
  APPROVED:           { label: "Reserved",       dot: "#BA7517", barBg: "#FAEEDA", barBorder: "#EF9F27", barText: "#633806" },
  ISSUED:             { label: "Issued",          dot: "#185FA5", barBg: "#E6F1FB", barBorder: "#378ADD", barText: "#042C53" },
  "PARTIALLY RETURNED": { label: "Partial return", dot: "#534AB7", barBg: "#EEEDFE", barBorder: "#7F77DD", barText: "#26215C" },
  PENDING:            { label: "Pending",         dot: "#888780", barBg: "#F1EFE8", barBorder: "#B4B2A9", barText: "#2C2C2A" },
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

function timelinePos(event) {
  const { start, end } = getEventRange(event);
  if (!start) return null;
  const evEnd   = end || new Date(start.getTime() + 3_600_000);
  const dayBase = new Date(start); dayBase.setHours(TL_START, 0, 0, 0);
  const dayTop  = new Date(start); dayTop.setHours(TL_END,   0, 0, 0);
  const clipStart = Math.max(start.getTime(), dayBase.getTime());
  const clipEnd   = Math.min(evEnd.getTime(),  dayTop.getTime());
  if (clipStart >= clipEnd) return null;
  const totalMs = TL_HOURS * 3_600_000;
  const top     = ((clipStart - dayBase.getTime()) / totalMs) * TL_HEIGHT;
  const height  = Math.max(((clipEnd - clipStart) / totalMs) * TL_HEIGHT, 30);
  return { top, height };
}

function assignColumns(events) {
  const sorted  = [...events].sort((a, b) => (getEventRange(a).start?.getTime() ?? 0) - (getEventRange(b).start?.getTime() ?? 0));
  const colEnds = [];
  const assigns = [];
  for (const event of sorted) {
    const { start, end } = getEventRange(event);
    if (!start) { assigns.push({ event, col: 0 }); continue; }
    const evEnd  = (end || new Date(start.getTime() + 3_600_000)).getTime();
    let placed   = false;
    for (let c = 0; c < colEnds.length; c++) {
      if (colEnds[c] <= start.getTime()) { colEnds[c] = evEnd; assigns.push({ event, col: c }); placed = true; break; }
    }
    if (!placed) { colEnds.push(evEnd); assigns.push({ event, col: colEnds.length - 1 }); }
  }
  const numCols = Math.max(1, colEnds.length);
  return assigns.map(a => ({ ...a, numCols }));
}

const S = {
  card:   { background: "#fff", border: "0.5px solid #e5e5e3", borderRadius: "12px" },
  label:  { fontSize: "10px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6b7280" },
  navBtn: { background: "none", border: "0.5px solid #d1d0cc", borderRadius: "6px", cursor: "pointer", fontSize: "15px", color: "#111", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center" },
};

function StatusBadge({ status }) {
  const cfg = STATUS[status] || STATUS.PENDING;
  return (
    <span style={{ fontSize: "11px", fontWeight: 500, padding: "2px 9px", borderRadius: "20px", background: cfg.barBg, color: cfg.barText, border: `0.5px solid ${cfg.barBorder}`, whiteSpace: "nowrap", flexShrink: 0 }}>
      {cfg.label}
    </span>
  );
}

function TimelineView({ events }) {
  const hours = Array.from({ length: TL_HOURS + 1 }, (_, i) => TL_START + i);
  const cols  = assignColumns(events);
  return (
    <div style={{ display: "flex", gap: "10px" }}>
      <div style={{ flexShrink: 0, width: "42px", position: "relative", height: `${TL_HEIGHT}px` }}>
        {hours.map(h => (
          <div key={h} style={{ position: "absolute", top: `${(h - TL_START) * HOUR_PX - 7}px`, right: 0, fontSize: "10px", color: "#9ca3af", textAlign: "right", whiteSpace: "nowrap" }}>
            {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, position: "relative", height: `${TL_HEIGHT}px` }}>
        {hours.map(h => (
          <div key={h} style={{ position: "absolute", top: `${(h - TL_START) * HOUR_PX}px`, left: 0, right: 0, borderTop: h === TL_START ? "0.5px solid #ccc" : "0.5px solid #e5e5e3" }} />
        ))}
        {cols.map(({ event, col, numCols }) => {
          const pos = timelinePos(event);
          if (!pos) return null;
          const cfg  = STATUS[event.status] || STATUS.PENDING;
          const colW = 100 / numCols;
          return (
            <div key={event.id} title={`${event.requester_name} — ${event.purpose || ""}`}
              style={{ position: "absolute", top: `${pos.top}px`, height: `${pos.height}px`, left: `${col * colW + (col > 0 ? 0.5 : 0)}%`, width: `${colW - (numCols > 1 ? 1 : 0)}%`, background: cfg.barBg, border: `0.5px solid ${cfg.barBorder}`, borderLeft: `3px solid ${cfg.dot}`, borderRadius: "6px", padding: "4px 6px", overflow: "hidden", boxSizing: "border-box", cursor: "default" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", overflow: "hidden" }}>
                <span style={{ fontSize: "11px", fontWeight: 500, color: cfg.barText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.requester_name}</span>
              </div>
              {pos.height > 44 && (
                <div style={{ fontSize: "10px", color: cfg.barBorder, marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(event.items || []).slice(0, 2).map(i => i.item_name || i.name).join(", ")}
                  {(event.items || []).length > 2 ? ` +${event.items.length - 2}` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventCard({ event }) {
  const { start, end, isWalkIn } = getEventRange(event);
  const endDisplay = end
    ? <div style={{ fontSize: "13px", fontWeight: 500, color: "#111", marginTop: "2px" }}>{fmtTime(end)}</div>
    : <div style={{ fontSize: "11px", fontWeight: 500, color: "#d97706", fontStyle: "italic", marginTop: "4px" }}>Not set yet</div>;

  return (
    <div style={{ ...S.card, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "10px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 500, color: "#111", marginBottom: "2px" }}>{event.requester_name || "Unknown"}</div>
          <div style={{ fontSize: "11px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.purpose || "No purpose stated"}</div>
        </div>
        <StatusBadge status={event.status} />
      </div>
      <div style={{ display: "flex", gap: "20px", marginBottom: "10px" }}>
        {isWalkIn ? (
          <>
            <div><div style={S.label}>Issued at</div><div style={{ fontSize: "13px", fontWeight: 500, color: "#111", marginTop: "2px" }}>{fmtTime(start)}</div></div>
            <div><div style={S.label}>Return by</div>{endDisplay}</div>
          </>
        ) : (
          <>
            <div><div style={S.label}>Reserved window</div><div style={{ fontSize: "13px", fontWeight: 500, color: "#111", marginTop: "2px" }}>{fmtTime(start)}</div></div>
            <div><div style={S.label}>Return by</div>{endDisplay}</div>
          </>
        )}
      </div>
      {(event.items || []).length > 0 && (
        <div style={{ borderTop: "0.5px solid #e5e5e3", paddingTop: "8px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {event.items.map((item, i) => (
            <span key={i} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: "#f5f5f3", border: "0.5px solid #e5e5e3", color: "#6b7280" }}>
              {item.quantity > 1 ? `${item.quantity}× ` : ""}{item.item_name || item.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AvailabilityCalendar({ roomId, onDateSelect, selectedDate, requestCountByDate }) {
  const today = new Date();
  const [year, setYear]     = useState(today.getFullYear());
  const [month, setMonth]   = useState(today.getMonth());
  const [selected, setSelected] = useState(today);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [itemFilter, setItemFilter] = useState('');

  const fetchEvents = useCallback(async () => {
    if (!roomId) return;
    setLoading(true); setError(null);
    try {
      const res = await api.get('/requests/calendar', { params: { room_id: roomId } });
      setEvents(Array.isArray(res.data.data) ? res.data.data : []);
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
    <div style={{ display: "flex", width: "100%", height: "100%", fontFamily: "var(--font-sans, system-ui, sans-serif)", background: "#f5f5f3", borderRadius: "12px", overflow: "hidden" }}>

      {/* ───────── LEFT: Monthly grid ───────── */}
      <div style={{ width: panelOpen ? "380px" : "100%", flexShrink: 0, transition: "width 0.25s ease", background: "#fff", borderRight: panelOpen ? "0.5px solid #e5e5e3" : "none", display: "flex", flexDirection: "column", padding: "20px 20px 32px", gap: "14px", overflowY: "auto" }}>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "#111" }}>Availability Calendar</div>
            <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "3px" }}>
              {loading ? "Loading…" : error ? `Error: ${error}` : "Click a date to view bookings"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <button onClick={prevMonth} style={S.navBtn} aria-label="Previous month">‹</button>
            <span style={{ fontSize: "12px", fontWeight: 500, minWidth: "108px", textAlign: "center", color: "#111" }}>{monthLabel} {year}</span>
            <button onClick={nextMonth} style={S.navBtn} aria-label="Next month">›</button>
          </div>
        </div>

        {/* ── Magic Filter — prominent ── */}
        <div style={{ position: "relative" }}>
          <div style={{ 
            background: hasFilter ? "#EFF6FF" : "linear-gradient(135deg, #f0f9ff 0%, #fef9ec 100%)",
            border: hasFilter ? "1.5px solid #2563EB" : "1.5px dashed #93C5FD",
            borderRadius: "10px",
            padding: "10px 12px 10px 38px",
            transition: "all 0.2s",
            boxShadow: hasFilter ? "0 0 0 3px rgba(37,99,235,0.08)" : "none",
          }}>
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "16px" }}>🔍</span>
            <input
              type="text"
              placeholder="Search item availability across all dates…"
              value={itemFilter}
              onChange={e => setItemFilter(e.target.value)}
              style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: "12px", fontWeight: hasFilter ? 600 : 400, color: hasFilter ? "#1D4ED8" : "#374151" }}
            />
          </div>
          {hasFilter && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "5px", padding: "0 4px" }}>
              <span style={{ fontSize: "10px", color: "#2563EB", fontWeight: 600 }}>
                ✦ Showing only dates with "{itemFilter}"
              </span>
              <button onClick={() => setItemFilter('')} style={{ fontSize: "10px", color: "#6b7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                Clear
              </button>
            </div>
          )}
          {!hasFilter && (
            <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "4px", paddingLeft: "4px" }}>
              Tip: Type an item name to highlight dates when it's in use
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {Object.entries(STATUS).map(([key, cfg]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
              <span style={{ fontSize: "10px", color: "#6b7280" }}>{cfg.label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <div style={{ width: "16px", height: "10px", borderRadius: "4px", background: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: "7px", color: "#fff", fontWeight: "bold" }}>N</span>
            </div>
            <span style={{ fontSize: "10px", color: "#6b7280" }}>Needs action</span>
          </div>
        </div>

        {/* Day-of-week header */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: "10px", fontWeight: 500, color: "#9ca3af", paddingBottom: "6px" }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
          {grid.map(({ date, cur }, i) => {
            const ds      = format(date, 'yyyy-MM-dd');
            const dayEvts = eventsFor(date);
            const isToday = ds === format(today, 'yyyy-MM-dd');
            const isSel   = activeDate && ds === format(activeDate, 'yyyy-MM-dd');
            const count   = requestCountByDate ? (requestCountByDate[ds] || 0) : 0;
            const groups  = {};
            dayEvts.forEach(e => { groups[e.status] = (groups[e.status] || 0) + 1; });
            const hasMatch = hasFilter && dayEvts.length > 0;

            return (
              <div key={i} onClick={() => cur && handleCellClick(date)}
                style={{
                  padding: "5px 4px",
                  borderRadius: "8px",
                  cursor: cur ? "pointer" : "default",
                  background: isSel ? "#EFF6FF" : hasMatch ? "#FFFBEB" : isToday ? "#FAEEDA" : "transparent",
                  border: isSel ? "1.5px solid #2563EB" : hasMatch ? "1.5px solid #F59E0B" : "1.5px solid transparent",
                  boxShadow: isSel ? "0 2px 4px rgba(37,99,235,0.1)" : hasMatch ? "0 1px 3px rgba(245,158,11,0.15)" : "none",
                  opacity: cur ? 1 : 0.28,
                  transition: "all 0.1s",
                  minHeight: "50px",
                  position: "relative",
                }}>
                <div style={{ fontSize: "12px", fontWeight: isToday || isSel ? 700 : 400, color: isSel ? "#1D4ED8" : isToday ? "#854F0B" : hasMatch ? "#92400E" : "#111", marginBottom: "4px" }}>
                  {date.getDate()}
                </div>

                {count > 0 && (
                  <div style={{ position: "absolute", top: "-4px", right: "-4px", background: "#EF4444", color: "white", fontSize: "9px", fontWeight: "bold", height: "16px", minWidth: "16px", padding: "0 4px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>
                    {count > 99 ? "99+" : count}
                  </div>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
                  {Object.entries(groups).map(([status, c]) => {
                    const cfg = STATUS[status] || STATUS.PENDING;
                    return Array.from({ length: Math.min(c, 3) }, (_, di) => (
                      <div key={`${status}-${di}`} style={{ width: "6px", height: "6px", borderRadius: "50%", background: cfg.dot }} title={`${c} ${cfg.label}`} />
                    ));
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ───────── RIGHT: Day detail panel ───────── */}
      {panelOpen && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f5f5f3", minWidth: 0 }}>
          <div style={{ padding: "16px 20px", background: "#fff", borderBottom: "0.5px solid #e5e5e3", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#111" }}>{fmtDate(activeDate)}</div>
              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                {selEvents.length === 0
                  ? (hasFilter ? `No bookings with "${itemFilter}"` : "No active bookings")
                  : `${selEvents.length} booking${selEvents.length > 1 ? "s" : ""}${hasFilter ? ` matching "${itemFilter}"` : ""}`}
              </div>
            </div>
            <button onClick={handleClosePanel} style={{ ...S.navBtn, fontSize: "14px" }} aria-label="Close panel">✕</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {selEvents.length === 0 ? (
              <div style={{ textAlign: "center", color: "#6b7280", paddingTop: "80px" }}>
                <div style={{ fontSize: "30px", marginBottom: "10px" }}>📅</div>
                <div style={{ fontSize: "13px" }}>
                  {hasFilter ? `No items matching "${itemFilter}" on this date.` : "No reservations or active loans on this date."}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div style={{ ...S.label, marginBottom: "10px" }}>Timeline (7 AM – 8 PM)</div>
                  <div style={{ ...S.card, padding: "14px 14px 14px 10px", overflowX: "auto" }}>
                    <TimelineView events={selEvents} />
                  </div>
                </div>
                <div>
                  <div style={{ ...S.label, marginBottom: "10px" }}>Booking details</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {selEvents.map(e => <EventCard key={e.id} event={e} />)}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
