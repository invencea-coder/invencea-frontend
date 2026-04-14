// src/pages/admin/ReturnScanner.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ScanBarcode, Search, Loader2, CheckCircle,
  Layers, Minus, Plus, Lock, Package, Clock, Trash2,
  RefreshCw, ChevronRight, CheckCircle2
} from "lucide-react";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import api from "../../api/axiosClient.js";
import { returnItemByBarcode, listRequests, getRequestByQR } from "../../api/requestAPI";
import { useAuth } from "../../context/AuthContext.jsx";
import NeumorphCard from "../../components/ui/NeumorphCard";
import NeumorphModal from "../../components/ui/NeumorphModal";
import NeumorphButton from "../../components/ui/NeumorphButton";

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';

// ── Time helpers ──────────────────────────────────────────────────────────────
const toPHTime = (d) => {
  if (!d) return null;
  let str = typeof d === 'string' ? d : String(d);
  if (str.includes('T') && !str.endsWith('Z') && !str.includes('+') && !str.includes('-', 10)) str += 'Z';
  return new Date(str);
};

const fmtDateTimePH = (d) => {
  if (!d) return '—';
  try {
    return toPHTime(d).toLocaleString('en-US', {
      timeZone: 'Asia/Manila', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }).replace(' at ', ', ');
  } catch { return '—'; }
};

let _uid = 0;
const uid = () => `q-${++_uid}-${Date.now()}`;

export default function ReturnScanner() {
  const { user, loading: authLoading } = useAuth();

  // ── Core state ──
  const [activeItems, setActiveItems]   = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [searchQuery, setSearchQuery]   = useState("");
  const [isRoomLocked, setIsRoomLocked] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Modal State
  const [selectedRequest, setSelectedRequest] = useState(null);

  // ── Scoped Scan Queue (Inside Modal) ──
  const [scanQueue, setScanQueue] = useState([]);
  const [processedIds, setProcessedIds] = useState([]); 

  const scanningLockRef     = useRef(false);
  const scannerBufferRef    = useRef("");
  const lastKeyTimeRef      = useRef(Date.now());
  const scanQueueRef        = useRef([]);
  const recentlyScannedRef  = useRef(new Set());
  const searchInputRef      = useRef(null);

  useEffect(() => { scanQueueRef.current = scanQueue; }, [scanQueue]);

  // Clear queue when modal closes or changes
  useEffect(() => {
    setScanQueue([]);
    setProcessedIds([]);
  }, [selectedRequest]);

  // ── Fetch active items ──────────────────────────────────────────────────────
  const fetchActiveItems = useCallback(async () => {
    if (!user?.room_id) return;
    try {
      setLoadingItems(true);
      const [roomsRes, res] = await Promise.all([
        api.get('/admin/rooms').catch(() => ({ data: { data: [] } })),
        listRequests({ status: "ISSUED,PARTIALLY RETURNED" })
      ]);
      const myRoom = (roomsRes.data?.data || roomsRes.data || []).find(
        r => String(r.id) === String(user.room_id)
      );
      if (myRoom) setIsRoomLocked(!myRoom.is_available);

      const requests = res?.data?.data || res.data || [];
      const active = [];

      requests.forEach((req) => {
        const isMyRoom = !req.room_id || String(req.room_id) === String(user.room_id);
        if (!isMyRoom) return;
        (req.items || []).forEach((item) => {
          const itemStatus    = (item.item_status || item.status || "").toString().toUpperCase();
          const requestStatus = (req.status || "").toString().toUpperCase();
          const isReturnable  =
            itemStatus === "ISSUED" || itemStatus === "PENDING" || itemStatus === "BORROWED" ||
            (requestStatus === "ISSUED" && itemStatus !== "RETURNED" && itemStatus !== "CANCELLED");
          
          if (!isReturnable) return;

          if (item.stock_id || item.consumable_id) {
            const barcode = item.stock_barcode || item.consumable_barcode || item.barcode;
            if (!barcode) return;
            active.push({
              requestId: req.id, itemName: item.item_name || item.name || "Unknown Item",
              barcode, assignee: item.assigned_to || req.requester_name || "Shared Group",
              requesterType: req.requester_type || "Unknown",
              requestedTime: req.requested_time || req.issued_time,
              isQtyMode: true,
              qtyRequested: item.qty_requested || item.quantity || 1,
              qtyReturned: item.qty_returned || 0,
              qtyOutstanding: (item.qty_requested || item.quantity || 1) - (item.qty_returned || 0),
              stockId: item.stock_id,
              consumableId: item.consumable_id
            });
            return;
          }
          const barcode = item.inventory_item_barcode || item.barcode || item.barcode_text;
          if (!barcode || barcode === "NO BARCODE") return;
          active.push({
            requestId: req.id, itemName: item.item_name || item.name || "Unknown Item",
            barcode, assignee: item.assigned_to || req.requester_name || "Shared Group",
            requesterType: req.requester_type || "Unknown",
            requestedTime: req.requested_time || req.issued_time,
            isQtyMode: false, qtyRequested: null,
          });
        });
      });
      setActiveItems(active);
    } catch {
      toast.error("Failed to load active items");
    } finally {
      setLoadingItems(false);
    }
  }, [user?.room_id]);

  useEffect(() => { if (!authLoading) fetchActiveItems(); }, [authLoading, fetchActiveItems]);

  // ── Grouping for Main List ──────────────────────────────────
  const activeRequests = useMemo(() => {
    const map = {};
    activeItems.forEach(item => {
      if (!map[item.requestId]) {
        map[item.requestId] = {
          id: item.requestId,
          assignee: item.assignee,
          requesterType: item.requesterType,
          requestedTime: item.requestedTime,
          items: []
        };
      }
      map[item.requestId].items.push(item);
    });
    return Object.values(map).sort((a, b) => b.id - a.id);
  }, [activeItems]);

  const filteredRequests = useMemo(() => {
    const q = (searchQuery || "").toLowerCase().trim();
    if (!q) return activeRequests;
    return activeRequests.filter(req => {
      const matchesReq   = String(req.id).includes(q) || (req.assignee || "").toLowerCase().includes(q);
      const matchesItems = req.items.some(
        i => (i.barcode || "").toLowerCase().includes(q) || (i.itemName || "").toLowerCase().includes(q)
      );
      return matchesReq || matchesItems;
    });
  }, [activeRequests, searchQuery]);

  // ── Socket ──────────────────────────────────────────────────────────────────
  // ⚡ FIX: Added 100ms delay to disconnect to prevent React Strict Mode console errors
  useEffect(() => {
    if (!user?.room_id) return;
    const sock = io(SOCKET_URL);
    sock.on('room-updated', (data) => {
      if (String(data.roomId) === String(user.room_id)) {
        setIsRoomLocked(!data.is_available);
        if (!data.is_available) {
          setSelectedRequest(null);
          toast.error("Room has been locked. Scanner disabled.", { duration: 5000 });
        }
      }
    });
    
    return () => {
      setTimeout(() => sock.disconnect(), 100);
    };
  }, [user?.room_id]);

  // ── Smart Scanner Logic ──────────────────────────────────────────────────────
  const handleScan = useCallback(async (rawCode) => {
    if (isRoomLocked) return;
    const code = (rawCode ?? "").toString().trim();
    if (!code) return;

    // Debounce
    if (recentlyScannedRef.current.has(code)) return;
    recentlyScannedRef.current.add(code);
    setTimeout(() => recentlyScannedRef.current.delete(code), 2000);

    // SCENARIO 1: A Request Modal is OPEN (Scoped Scanning)
    if (selectedRequest) {
      const matchItem = selectedRequest.items.find(i => i.barcode === code);
      
      if (!matchItem) {
        toast.error(`Barcode ${code} does not belong to Request #${selectedRequest.id}.`);
        return;
      }

      setScanQueue(prev => {
        const existing = prev.find(p => p.barcode === code);
        
        if (existing) {
          if (matchItem.isQtyMode) {
            const currentTotal = (existing.qtyGood || 0) + (existing.qtyDamaged || 0) + (existing.qtyDefective || 0);
            if (currentTotal + 1 > matchItem.qtyOutstanding) {
              toast.error(`Only ${matchItem.qtyOutstanding} pending for this item.`);
              return prev;
            }
            toast.success(`Increased ${matchItem.itemName} (Good)`);
            return prev.map(p => p.barcode === code ? { ...p, qtyGood: (p.qtyGood || 0) + 1 } : p);
          } else {
            toast.error('Item already scanned!');
            return prev;
          }
        } else {
          toast.success(`Scanned: ${matchItem.itemName}`);
          return [...prev, {
            id: uid(),
            barcode: code,
            itemInfo: matchItem,
            condition: "Good", // Default to Good for unit mode
            qtyGood: matchItem.isQtyMode ? 1 : 0, // Default to 1 Good for qty mode
            qtyDamaged: 0,
            qtyDefective: 0,
          }];
        }
      });
      return;
    }

    // SCENARIO 2: Main Screen (Global Lookup)
    let foundReq = activeRequests.find(r => String(r.id) === code);
    
    if (!foundReq) {
      const matchingItems = activeItems.filter(i => i.barcode === code);
      if (matchingItems.length === 1) {
        foundReq = activeRequests.find(r => r.id === matchingItems[0].requestId);
      } else if (matchingItems.length > 1) {
        toast.error(`Barcode ${code} matches multiple active requests. Please click the correct request manually.`);
        return;
      }
    }

    if (foundReq) {
      setSelectedRequest(foundReq);
      toast.success(`Opened Request #${foundReq.id}`);
      return;
    }

    const toastId = toast.loading("Looking up code...");
    try {
      const res = await getRequestByQR(code);
      const req = res.data?.data || res.data;
      toast.dismiss(toastId);

      if (req && ['ISSUED', 'PARTIALLY RETURNED'].includes(req.status)) {
        const localReq = activeRequests.find(r => String(r.id) === String(req.id));
        if (localReq) {
          setSelectedRequest(localReq);
          toast.success(`Opened Request #${localReq.id}`);
        } else {
          toast.error("Request belongs to another room or is not active.");
        }
      } else if (req) {
        toast.error(`Request #${req.id} is already ${req.status}.`);
      } else {
        toast.error("Barcode not found.");
      }
    } catch {
      toast.dismiss(toastId);
      toast.error("Barcode not found.");
    }
  }, [isRoomLocked, selectedRequest, activeItems, activeRequests]);

  // ── Keyboard scanner hook ──
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (isRoomLocked) return;
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;

      const now  = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;
      if (diff > 50) scannerBufferRef.current = "";

      if (e.key === "Enter") {
        if (scannerBufferRef.current.length > 3) {
          e.preventDefault();
          const code = scannerBufferRef.current;
          scannerBufferRef.current = "";
          handleScan(code);
        }
        return;
      }
      if (e.key.length === 1) scannerBufferRef.current += e.key;
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleScan, isRoomLocked]);

  // ── Queue Management ────────────────────────────────────────────────────────
  const removeFromQueue = (entryId) => {
    setScanQueue(prev => prev.filter(e => e.id !== entryId));
  };

  const updateQueueEntry = (entryId, patch) => {
    setScanQueue(prev => prev.map(e => e.id === entryId ? { ...e, ...patch } : e));
  };

  const returnAll = async () => {
    if (isRoomLocked || scanningLockRef.current || scanQueue.length === 0) return;
    scanningLockRef.current = true;
    setIsProcessing(true);

    const toastId = toast.loading(`Processing returns...`);
    const successful = [];
    const failed = [];

    for (const entry of scanQueue) {
      try {
        if (entry.itemInfo?.isQtyMode) {
          // QTY MODE: Send separate API calls for each condition > 0
          for (const cond of ['Good', 'Damaged', 'Defective']) {
            const qtyToReturn = entry[`qty${cond}`] || 0;
            if (qtyToReturn > 0) {
              await returnItemByBarcode({
                barcode: entry.barcode,
                condition: cond,
                qtyReturned: qtyToReturn,
                requestId: entry.itemInfo.requestId,
              });
            }
          }
          successful.push(entry.id);
        } else {
          // UNIT MODE: Single call
          await returnItemByBarcode({
            barcode: entry.barcode,
            condition: entry.condition,
            requestId: entry.itemInfo?.requestId,
          });
          successful.push(entry.id);
        }
      } catch (err) {
        const msg = err.response?.data?.message || err.message || "Unknown error";
        failed.push({ entry, msg });
      }
    }

    toast.dismiss(toastId);

    if (failed.length === 0) {
      toast.success(`All items returned successfully!`, { duration: 4000 });
      setScanQueue([]);
      setSelectedRequest(null);
    } else if (successful.length > 0) {
      toast.success(`${successful.length} returned. ${failed.length} failed.`, { duration: 5000 });
      setScanQueue(prev => prev.filter(e => !successful.includes(e.id)));
      failed.forEach(({ entry, msg }) => {
        toast.error(`Failed: ${entry.barcode} — ${msg}`, { duration: 6000 });
      });
    } else {
      toast.error("All returns failed. Check items and try again.", { duration: 5000 });
      failed.forEach(({ entry, msg }) => {
        toast.error(`${entry.barcode}: ${msg}`, { duration: 6000 });
      });
    }

    await fetchActiveItems();
    scanningLockRef.current = false;
    setIsProcessing(false);
  };

  const totalItemsInQueue = scanQueue.reduce((acc, e) => {
    if (e.itemInfo?.isQtyMode) return acc + (e.qtyGood || 0) + (e.qtyDamaged || 0) + (e.qtyDefective || 0);
    return acc + 1;
  }, 0);

  const queuedBarcodes = useMemo(() => new Set(scanQueue.map(e => e.barcode).filter(Boolean)), [scanQueue]);

  if (!authLoading && !user?.room_id) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <NeumorphCard className="p-12 text-center">
          <Lock size={40} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-lg font-bold text-gray-700">No Room Assigned</h2>
          <p className="text-sm text-muted mt-2">
            Your account is not assigned to a room. Ask a manager to assign you before using the Return Scanner.
          </p>
        </NeumorphCard>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Room locked banner */}
      {isRoomLocked && (
        <div className="bg-red-50 border-2 border-red-200 p-4 rounded-2xl flex items-center gap-3">
          <div className="bg-red-100 text-red-600 p-2 rounded-xl flex-shrink-0"><Lock size={20} /></div>
          <div>
            <h3 className="text-sm font-bold text-red-800">Room is Unavailable</h3>
            <p className="text-xs text-red-700 mt-0.5">
              The return scanner is disabled. Items cannot be returned while the room is locked.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-black/5">
        <div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2">
            <ScanBarcode size={28} className="text-primary" /> Active Borrows
          </h1>
          <p className="text-sm text-gray-500 font-medium mt-1">
            Click a request to open its return verification screen, then scan the item's barcode for return. (Supports partial returns).
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchInputRef}
              placeholder="Search name, ID, barcode..."
              className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-inner"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={fetchActiveItems}
            disabled={loadingItems}
            className="w-full sm:w-auto p-2.5 rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-primary hover:border-primary/30 transition-colors shadow-sm shrink-0 flex justify-center">
            <RefreshCw size={16} className={loadingItems ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── MAIN LIST: COMPACT ACTIVE REQUESTS ────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-black/5 flex flex-col min-h-[500px] h-[calc(100vh-14rem)]">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
          {loadingItems ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
              <Loader2 className="animate-spin text-primary" size={28} />
              <span className="font-bold text-sm">Loading active requests...</span>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-300">
                <CheckCircle2 size={32} />
              </div>
              <p className="text-gray-800 font-black text-xl">All caught up!</p>
              <p className="text-gray-500 text-sm mt-1">No items are currently issued out.</p>
            </div>
          ) : (
            filteredRequests.map((req) => {
              const itemsCount = req.items.length;
              return (
                <div 
                  key={req.id} 
                  onClick={() => setSelectedRequest(req)}
                  className="group flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-mono text-xs font-black shadow-inner bg-slate-50 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 border border-black/5">
                      #{req.id}
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-black text-gray-900 truncate pr-4">{req.assignee}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          {req.requesterType}
                        </span>
                        <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                          <Clock size={12}/> Issued: {fmtDateTimePH(req.requestedTime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 pl-2">
                    <div className="text-right">
                      <p className="text-sm font-black text-gray-700">
                        {itemsCount} Item{itemsCount !== 1 ? 's' : ''} pending
                      </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                       <ChevronRight size={18} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── MODAL: Request Details & Scoped Scanner ───────────────────────────── */}
      <NeumorphModal open={!!selectedRequest} onClose={() => setSelectedRequest(null)} title={`Return Items — Request #${selectedRequest?.id}`} size="xl">
        {selectedRequest && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-2">
            
            {/* Left Col: Request Info & Pending Items */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="bg-blue-50 border border-blue-100 p-3.5 rounded-xl shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Requester Info</span>
                  <span className="text-[9px] font-black text-blue-700 bg-blue-200 px-2 py-0.5 rounded uppercase">{selectedRequest.requesterType}</span>
                </div>
                <p className="text-base font-black text-gray-900 truncate">{selectedRequest.assignee}</p>
                <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1.5"><Clock size={10}/> Issued: {fmtDateTimePH(selectedRequest.requestedTime)}</p>
              </div>

              <div className="flex flex-col overflow-hidden">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5 shrink-0"><Package size={12} /> Pending Items ({selectedRequest.items.length})</h3>
                <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1 max-h-[300px]">
                  {selectedRequest.items.map((item, idx) => {
                    const isQueued = queuedBarcodes.has(item.barcode);
                    return (
                      <div key={idx} className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${isQueued ? 'bg-emerald-50 border-emerald-200 opacity-60' : 'bg-white border-gray-200 shadow-sm'}`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isQueued ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                            {isQueued ? <CheckCircle2 size={12}/> : <Package size={12}/>}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs font-bold truncate ${isQueued ? 'text-emerald-900 line-through' : 'text-gray-800'}`}>{item.itemName}</p>
                            <p className="text-[9px] font-mono text-gray-500 mt-0.5">{item.barcode}</p>
                          </div>
                        </div>
                        {item.isQtyMode && (
                          <span className="text-[9px] font-black text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded shrink-0 ml-2">
                            Qty: {item.qtyOutstanding}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Col: Scoped Scanner & Queue */}
            <div className="lg:col-span-8 bg-slate-50 border border-black/5 rounded-2xl flex flex-col overflow-hidden h-[500px] shadow-inner">
              
              {/* Header & Controls */}
              <div className="px-4 py-3 border-b border-black/5 flex items-center justify-between bg-white shrink-0">
                <h2 className="font-black text-gray-800 text-sm flex items-center gap-2">
                  <ScanBarcode size={16} className="text-primary"/> Verification Queue
                </h2>
                <div className="flex items-center gap-1.5 pl-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Scanner Ready</span>
                </div>
              </div>

              {/* Queue List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50">
                {scanQueue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-300 p-8 text-center">
                    <ScanBarcode size={40} className="mb-3 opacity-20 text-primary" />
                    <p className="text-sm font-black text-gray-500">Scan items to verify</p>
                    <p className="text-[10px] text-gray-400 mt-1 max-w-[180px] mx-auto leading-relaxed">Use your scanner to verify the items returned by the student.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-black/5">
                    {scanQueue.map((entry) => (
                      <QueueEntry
                        key={entry.id}
                        entry={entry}
                        isProcessing={isProcessing}
                        onRemove={() => removeFromQueue(entry.id)}
                        onUpdate={(patch) => updateQueueEntry(entry.id, patch)}
                        wasProcessed={processedIds.includes(entry.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Return Button Footer */}
              <div className="p-3 border-t border-black/5 bg-white shrink-0">
                <button
                  onClick={returnAll}
                  disabled={isProcessing || scanQueue.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white text-sm font-black shadow-md hover:bg-primary/90 disabled:opacity-50 transition-all">
                  {isProcessing ? (
                    <><Loader2 size={16} className="animate-spin" /> Processing...</>
                  ) : (
                    <><CheckCircle2 size={16} /> Confirm Return</>
                  )}
                </button>
              </div>
            </div>

          </div>
        )}
      </NeumorphModal>

    </div>
  );
}

// ── Queue Entry Sub-component ─────────────────────────────────────────────────
function QueueEntry({ entry, isProcessing, onRemove, onUpdate, wasProcessed }) {
  const currentTotal = (entry.qtyGood || 0) + (entry.qtyDamaged || 0) + (entry.qtyDefective || 0);

  return (
    <div className={`p-3 transition-colors ${wasProcessed ? 'bg-green-50' : 'hover:bg-white bg-white/50'}`}>
      <div className="flex items-start justify-between gap-3">
        
        {/* Left Side: Icon & Item Info */}
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 border ${wasProcessed ? 'bg-green-100 border-green-200' : 'bg-primary/10 border-primary/20'}`}>
            {wasProcessed ? <CheckCircle size={14} className="text-green-600" /> : <Package size={14} className="text-primary" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-gray-800 truncate leading-tight">{entry.itemInfo?.itemName || entry.barcode}</p>
            <p className="text-[9px] text-gray-500 font-medium font-mono mt-0.5">{entry.barcode}</p>
            
            {/* Unit Mode Condition (Radio Buttons) */}
            {!entry.itemInfo?.isQtyMode && (
              <div className="flex items-center gap-1 mt-2">
                {["Good", "Damaged", "Defective"].map(c => (
                  <button
                    key={c}
                    disabled={isProcessing}
                    onClick={() => onUpdate({ condition: c })}
                    className={`text-[8px] px-1.5 py-1 rounded border font-black uppercase tracking-wider transition-all ${
                      entry.condition === c ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-400 border-gray-200 hover:border-primary/40 hover:text-gray-600'
                    }`}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Delete Button & Qty Mode Counters */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            onClick={onRemove}
            disabled={isProcessing}
            className="w-6 h-6 flex items-center justify-center rounded border border-transparent text-gray-300 hover:text-red-500 hover:bg-red-50 hover:border-red-100 transition-colors">
            <Trash2 size={12} />
          </button>

          {/* Qty Mode Condition Splitting (Side-by-Side Numeric Counters) */}
          {entry.itemInfo?.isQtyMode && (
            <div className="flex gap-1.5 mt-1">
              {["Good", "Damaged", "Defective"].map(cond => {
                const key = `qty${cond}`;
                const val = entry[key] || 0;
                // Determine header color based on condition
                const headerColor = cond === 'Good' ? 'text-green-600 bg-green-50' : cond === 'Damaged' ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
                
                return (
                  <div key={cond} className="flex flex-col items-center bg-gray-50 border border-gray-100 rounded p-1 w-[52px]">
                    <span className={`text-[7px] uppercase font-black px-1 py-0.5 w-full text-center rounded-sm ${headerColor}`}>{cond}</span>
                    <div className="flex items-center justify-between w-full mt-1 px-0.5">
                      <button 
                        disabled={isProcessing}
                        onClick={() => onUpdate({ [key]: Math.max(0, val - 1) })} 
                        className="w-3.5 h-3.5 bg-white shadow-sm rounded flex items-center justify-center text-gray-500 hover:text-primary transition-colors text-[9px] font-bold">
                        -
                      </button>
                      <span className="text-[10px] font-black text-gray-800">{val}</span>
                      <button 
                        disabled={isProcessing}
                        onClick={() => {
                          if (currentTotal < entry.itemInfo.qtyOutstanding) onUpdate({ [key]: val + 1 });
                          else toast.error(`Max ${entry.itemInfo.qtyOutstanding} items allowed.`);
                        }} 
                        className="w-3.5 h-3.5 bg-white shadow-sm rounded flex items-center justify-center text-gray-500 hover:text-primary transition-colors text-[9px] font-bold">
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}