// src/pages/admin/ReturnScanner.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ScanBarcode, Camera, Search, Loader2, CheckCircle, XCircle,
  Layers, Minus, Plus, Lock, Package, Clock, Trash2, QrCode,
  ArrowRight, RefreshCw, AlertCircle, ChevronDown
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import api from "../../api/axiosClient.js";
import {
  returnItemByBarcode, listRequests, getRequestByQR, returnRequest
} from "../../api/requestAPI";
import { useAuth } from "../../context/AuthContext.jsx";
import NeumorphCard from "../../components/ui/NeumorphCard";

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

const getPHTDateString = (d) => {
  if (!d) return '';
  try {
    const phtDate = toPHTime(d);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const [{ value: mo }, , { value: da }, , { value: ye }] = formatter.formatToParts(phtDate);
    return `${ye}-${mo}-${da}`;
  } catch { return ''; }
};

// ── Unique ID helper ──
let _uid = 0;
const uid = () => `q-${++_uid}-${Date.now()}`;

export default function ReturnScanner() {
  const { user, loading: authLoading } = useAuth();

  // ── Core state ──
  const [activeItems, setActiveItems]   = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [searchQuery, setSearchQuery]   = useState("");
  const [isRoomLocked, setIsRoomLocked] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedIds, setProcessedIds] = useState([]); // successfully returned queue IDs

  // ── Scan Queue ──
  // Each entry: { id, type: 'request'|'item', requestId?, requestData?, barcode?, itemInfo?, condition, qtyToReturn }
  const [scanQueue, setScanQueue] = useState([]);

  // ── Global condition (applies to new items added) ──
  const [globalCondition, setGlobalCondition] = useState("Good");

  const scannerRef          = useRef(null);
  const scanningLockRef     = useRef(false);
  const scannerBufferRef    = useRef("");
  const lastKeyTimeRef      = useRef(Date.now());
  const globalConditionRef  = useRef(globalCondition);
  const activeItemsRef      = useRef([]);
  const scanQueueRef        = useRef([]);
  const searchInputRef      = useRef(null);
  // Debounce: prevent same code from being re-queued within 3 seconds
  const recentlyScannedRef  = useRef(new Set());

  useEffect(() => { globalConditionRef.current = globalCondition; }, [globalCondition]);
  useEffect(() => { activeItemsRef.current = activeItems; }, [activeItems]);
  useEffect(() => { scanQueueRef.current = scanQueue; }, [scanQueue]);

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

          if (item.stock_id) {
            const barcode = item.stock_barcode || item.barcode;
            if (!barcode) return;
            active.push({
              requestId: req.id, itemName: item.item_name || item.name || "Unknown Item",
              barcode, assignee: item.assigned_to || "Shared Group",
              requesterType: req.requester_type || "Unknown",
              requestedTime: req.requested_time || req.issued_time,
              lastReturnTime: req.last_return_time || null,
              isQtyMode: true,
              qtyRequested: item.qty_requested || item.quantity || 1,
              qtyReturned: item.qty_returned || 0,
              qtyOutstanding: (item.qty_requested || item.quantity || 1) - (item.qty_returned || 0),
              stockId: item.stock_id,
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
            lastReturnTime: req.last_return_time || null,
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

  // ── Socket ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.room_id) return;
    const sock = io(SOCKET_URL);
    sock.on('room-updated', (data) => {
      if (String(data.roomId) === String(user.room_id)) {
        setIsRoomLocked(!data.is_available);
        if (!data.is_available) {
          setScanQueue([]);
          setCameraActive(false);
          toast.error("Room has been locked. Scanner disabled.", { duration: 5000 });
        }
      }
    });
    return () => sock.disconnect();
  }, [user?.room_id]);

  // ── Add to Queue ─────────────────────────────────────────────────────────────
  const addToQueue = useCallback(async (rawCode) => {
    if (isRoomLocked) return;
    const code = (rawCode ?? "").toString().trim();
    if (!code) return;

    // Debounce: skip if scanned in the last 3 seconds
    if (recentlyScannedRef.current.has(code)) {
      toast("Already queued — scan a different code.", { icon: '🔁', duration: 1500 });
      return;
    }
    recentlyScannedRef.current.add(code);
    setTimeout(() => recentlyScannedRef.current.delete(code), 3000);

    // Check if already in queue
    const alreadyInQueue = scanQueueRef.current.some(
      entry => entry.barcode === code || String(entry.requestId) === code
    );
    if (alreadyInQueue) {
      toast("Already in return queue.", { icon: '⚠️', duration: 2000 });
      return;
    }

    // 1. Check for matching individual item barcode
    const matchItem = activeItemsRef.current.find(i => i.barcode === code);
    if (matchItem) {
      setScanQueue(prev => [...prev, {
        id: uid(),
        type: 'item',
        barcode: code,
        itemInfo: matchItem,
        condition: globalConditionRef.current,
        qtyToReturn: matchItem.isQtyMode ? matchItem.qtyOutstanding : 1,
      }]);
      toast.success(`Added: ${matchItem.itemName}`, { icon: '📦', duration: 2000 });
      return;
    }

    // 2. Try as Request QR
    const toastId = toast.loading("Checking QR code...");
    try {
      const res = await getRequestByQR(code);
      const req = res.data?.data || res.data;
      toast.dismiss(toastId);

      if (req && ['ISSUED', 'PARTIALLY RETURNED'].includes(req.status)) {
        // Check if requestId already in queue
        const reqAlreadyQueued = scanQueueRef.current.some(
          e => e.type === 'request' && String(e.requestId) === String(req.id)
        );
        if (reqAlreadyQueued) {
          toast("Request already in queue.", { icon: '⚠️', duration: 2000 });
          return;
        }
        setScanQueue(prev => [...prev, {
          id: uid(),
          type: 'request',
          requestId: req.id,
          requestData: req,
          condition: globalConditionRef.current,
          qtyToReturn: null,
        }]);
        const itemCount = (req.items || []).filter(
          it => !['RETURNED','CANCELLED'].includes((it.item_status || it.status || '').toUpperCase())
        ).length;
        toast.success(`Request #${req.id} queued (${itemCount} item${itemCount !== 1 ? 's' : ''})`, {
          icon: '🔖', duration: 2500
        });
      } else if (req && ['RETURNED', 'REJECTED', 'CANCELLED'].includes(req.status)) {
        toast.error(`Request #${req.id} is already ${req.status.toLowerCase()}.`);
      } else {
        toast.error("Code not found in active inventory or requests.");
      }
    } catch {
      toast.dismiss(toastId);
      toast.error("Barcode not found in active inventory or requests.");
    }
  }, [isRoomLocked]);

  // ── Remove from queue ────────────────────────────────────────────────────────
  const removeFromQueue = (entryId) => {
    setScanQueue(prev => prev.filter(e => e.id !== entryId));
    setProcessedIds(prev => prev.filter(id => id !== entryId));
  };

  // ── Update queue entry ───────────────────────────────────────────────────────
  const updateQueueEntry = (entryId, patch) => {
    setScanQueue(prev => prev.map(e => e.id === entryId ? { ...e, ...patch } : e));
  };

  // ── Return All ───────────────────────────────────────────────────────────────
  const returnAll = async () => {
    if (isRoomLocked || scanningLockRef.current || scanQueue.length === 0) return;
    scanningLockRef.current = true;
    setIsProcessing(true);

    const toastId = toast.loading(`Processing ${scanQueue.length} return(s)...`);
    const successful = [];
    const failed = [];

    for (const entry of scanQueue) {
      try {
        if (entry.type === 'request') {
          await returnRequest(entry.requestId);
          successful.push(entry.id);
        } else {
          const body = {
            barcode: entry.barcode,
            condition: entry.condition,
            requestId: entry.itemInfo?.requestId,
          };
          if (entry.itemInfo?.isQtyMode) body.qtyReturned = entry.qtyToReturn;
          await returnItemByBarcode(body);
          successful.push(entry.id);
        }
      } catch (err) {
        const msg = err.response?.data?.message || err.message || "Unknown error";
        failed.push({ entry, msg });
      }
    }

    toast.dismiss(toastId);

    if (failed.length === 0) {
      toast.success(`All ${successful.length} return(s) processed successfully!`, { duration: 4000 });
      setScanQueue([]);
      setProcessedIds([]);
    } else if (successful.length > 0) {
      toast.success(`${successful.length} returned. ${failed.length} failed.`, { duration: 5000 });
      setProcessedIds(successful);
      // Remove only the successful ones
      setScanQueue(prev => prev.filter(e => !successful.includes(e.id)));
      failed.forEach(({ entry, msg }) => {
        const label = entry.type === 'request'
          ? `Request #${entry.requestId}`
          : entry.barcode;
        toast.error(`Failed: ${label} — ${msg}`, { duration: 6000 });
      });
    } else {
      toast.error("All returns failed. Check the items and try again.", { duration: 5000 });
      failed.forEach(({ entry, msg }) => {
        const label = entry.type === 'request'
          ? `Request #${entry.requestId}`
          : entry.barcode;
        toast.error(`${label}: ${msg}`, { duration: 6000 });
      });
    }

    await fetchActiveItems();
    scanningLockRef.current = false;
    setIsProcessing(false);
  };

  // ── Keyboard scanner ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (isRoomLocked) return;
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;

      const now  = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;
      if (diff > 50) scannerBufferRef.current = "";

      if (e.key === "Enter") {
        if (scannerBufferRef.current.length > 3) {
          e.preventDefault();
          const code = scannerBufferRef.current;
          scannerBufferRef.current = "";
          addToQueue(code);
          if (document.activeElement === searchInputRef.current) {
            setSearchQuery("");
            searchInputRef.current.blur();
          }
        }
        return;
      }
      if (e.key.length === 1) scannerBufferRef.current += e.key;
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [addToQueue, isRoomLocked]);

  // ── Camera logic (Closes immediately after one successful scan) ──────────────
  useEffect(() => {
    const stopAndClear = async () => {
      const inst = scannerRef.current;
      if (!inst) return;
      try { if (typeof inst.stop === "function") await inst.stop(); } catch {}
      try { if (typeof inst.clear === "function") await inst.clear(); } catch {}
      scannerRef.current = null;
    };

    if (!cameraActive || isRoomLocked) {
      stopAndClear();
      return () => {};
    }

    if (scannerRef.current) return () => {};

    const html5QrCode = new Html5Qrcode("camera-reader");
    scannerRef.current = html5QrCode;

    const startScanner = async () => {
      let cameras = [];
      try { cameras = await Html5Qrcode.getCameras().catch(() => []); } catch { cameras = []; }
      if (!cameras || cameras.length === 0) {
        toast.error("No camera found or permission denied.");
        setCameraActive(false);
        scannerRef.current = null;
        return;
      }
      const chosenCamera =
        cameras.find(c => /back|rear|environment/i.test(c.label || "")) || cameras[0];
      try {
        await html5QrCode.start(
          chosenCamera.id,
          { fps: 10, qrbox: { width: 280, height: 160 } },
          (decodedText) => {
            // ⬇ CHANGE: Turn off the camera immediately upon a successful read
            setCameraActive(false); 
            addToQueue(decodedText);
          },
          () => {} // error frame callback — silently ignore
        );
      } catch {
        toast.error("Unable to start camera.");
        setCameraActive(false);
        try { await html5QrCode.clear(); } catch {}
        scannerRef.current = null;
      }
    };

    startScanner();
    return () => { stopAndClear(); };
  }, [cameraActive, addToQueue, isRoomLocked]);

  // ── Grouping for right panel ─────────────────────────────────────────────────
  const activeRequests = useMemo(() => {
    const map = {};
    activeItems.forEach(item => {
      if (!map[item.requestId]) {
        map[item.requestId] = {
          id: item.requestId,
          assignee: item.assignee,
          requesterType: item.requesterType,
          requestedTime: item.requestedTime,
          lastReturnTime: item.lastReturnTime,
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

  // Total items pending in queue
  const totalItemsInQueue = useMemo(() => scanQueue.reduce((acc, entry) => {
    if (entry.type === 'request') {
      const count = (entry.requestData?.items || []).filter(
        it => !['RETURNED','CANCELLED'].includes((it.item_status || it.status || '').toUpperCase())
      ).length;
      return acc + count;
    }
    return acc + (entry.qtyToReturn || 1);
  }, 0), [scanQueue]);

  // Items in queue (barcodes) for right-panel highlight
  const queuedBarcodes = useMemo(() => new Set(scanQueue.map(e => e.barcode).filter(Boolean)), [scanQueue]);
  const queuedRequestIds = useMemo(() => new Set(scanQueue.map(e => e.requestId).filter(Boolean)), [scanQueue]);

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
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

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
            <ScanBarcode size={28} className="text-primary" /> Return Scanner
          </h1>
          <p className="text-sm text-gray-500 font-medium mt-1">
            Scan item barcodes or request QR codes — all go into the queue. Confirm once to return everything.
          </p>
        </div>
        {scanQueue.length > 0 && (
          <div className="flex items-center gap-2 text-sm font-black text-primary bg-primary/5 border border-primary/20 px-4 py-2 rounded-xl">
            <Package size={16} />
            {scanQueue.length} scan{scanQueue.length !== 1 ? 's' : ''} · {totalItemsInQueue} item{totalItemsInQueue !== 1 ? 's' : ''} queued
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
        <div className="lg:col-span-5 space-y-5 sticky top-6">

          {/* Scanner box */}
          <div className={`bg-white rounded-2xl shadow-sm border border-black/5 p-6 space-y-5 transition-all ${isRoomLocked ? 'opacity-60 grayscale pointer-events-none' : ''}`}>

            {/* Camera toggle */}
            <div className="flex justify-between items-center">
              <div>
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest block">Scanner</label>
                {cameraActive && (
                  <p className="text-[10px] text-green-600 font-bold mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                    Live — waiting for scan...
                  </p>
                )}
              </div>
              <button
                disabled={isRoomLocked}
                onClick={() => setCameraActive(s => !s)}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                  cameraActive
                    ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                <Camera size={14} /> {cameraActive ? "Close Camera" : "Use Camera"}
              </button>
            </div>

            {cameraActive ? (
              <div id="camera-reader" className="w-full overflow-hidden rounded-xl border-4 border-primary/20 shadow-inner bg-black/5" />
            ) : (
              <div className="w-full text-center py-8 px-4 rounded-2xl border-2 border-dashed bg-gray-50 border-gray-200 text-gray-400">
                {isRoomLocked ? (
                  <><Lock size={32} className="mx-auto mb-2 opacity-50" /><span className="text-xs font-bold">Scanner is locked</span></>
                ) : (
                  <>
                    <QrCode size={32} className="mx-auto mb-2 opacity-50" />
                    <span className="text-xs font-bold block">Ready — scan barcodes or QR codes</span>
                    <span className="text-[10px] text-gray-300 mt-1 block">Physical scanner or use camera above</span>
                  </>
                )}
              </div>
            )}

            {/* Global condition selector */}
            <div className="space-y-2 pt-4 border-t border-black/5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Default Condition
              </label>
              <div className="grid grid-cols-3 gap-2">
                {["Good", "Damaged", "Defective"].map(label => (
                  <button
                    key={label}
                    disabled={isRoomLocked}
                    onClick={() => setGlobalCondition(label)}
                    className={`py-2 rounded-xl border-2 text-[10px] uppercase font-black tracking-wider transition-all ${
                      globalCondition === label
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "border-gray-200 bg-white text-gray-500 hover:border-primary/50"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Scan Queue ─────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between bg-gray-50/60">
              <div>
                <h2 className="font-black text-gray-800 text-sm">Return Queue</h2>
                <p className="text-[10px] font-medium text-gray-500 mt-0.5">
                  {scanQueue.length === 0
                    ? "Scan items or QR codes to add"
                    : `${scanQueue.length} scan(s) · ${totalItemsInQueue} item(s) pending`}
                </p>
              </div>
              {scanQueue.length > 0 && (
                <button
                  onClick={() => { setScanQueue([]); setProcessedIds([]); }}
                  disabled={isProcessing}
                  className="text-[10px] font-bold text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                  Clear All
                </button>
              )}
            </div>

            {scanQueue.length === 0 ? (
              <div className="p-8 text-center text-gray-300">
                <ScanBarcode size={36} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs font-bold text-gray-400">Queue is empty</p>
                <p className="text-[10px] text-gray-300 mt-1">Scan item barcodes or request QR codes</p>
              </div>
            ) : (
              <div className="divide-y divide-black/5 max-h-[340px] overflow-y-auto custom-scrollbar">
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

            {/* Return All button */}
            {scanQueue.length > 0 && (
              <div className="p-4 border-t border-black/5 bg-gray-50/40">
                <button
                  onClick={returnAll}
                  disabled={isProcessing || isRoomLocked}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-white text-sm font-black shadow-md hover:bg-primary/90 disabled:opacity-60 transition-all">
                  {isProcessing ? (
                    <><Loader2 size={18} className="animate-spin" /> Processing returns...</>
                  ) : (
                    <><CheckCircle size={18} /> Return All ({totalItemsInQueue} item{totalItemsInQueue !== 1 ? 's' : ''})</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────────────── */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
            <div className="p-5 bg-gray-50/80 border-b border-black/5 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <h2 className="font-black text-gray-800 text-lg">Active Borrowed Requests</h2>
                <p className="text-xs font-medium text-gray-500 mt-0.5">
                  {filteredRequests.length} request(s) holding items
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={fetchActiveItems}
                  disabled={loadingItems}
                  className="p-2 rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-primary hover:border-primary/30 transition-colors shadow-sm flex-shrink-0">
                  <RefreshCw size={15} className={loadingItems ? 'animate-spin' : ''} />
                </button>
                <div className="relative flex-1 sm:w-64">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    placeholder="Search ID, name, or barcode..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 bg-gray-50/30">
              {loadingItems ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                  <Loader2 className="animate-spin text-primary" size={32} />
                  <span className="font-bold text-sm">Fetching active inventory...</span>
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3 text-gray-300">
                    <CheckCircle size={32} />
                  </div>
                  <p className="text-gray-800 font-black text-lg">All caught up!</p>
                  <p className="text-gray-500 text-sm mt-1">No items are currently issued out.</p>
                </div>
              ) : (
                filteredRequests.map((req) => {
                  const isReqQueued    = queuedRequestIds.has(req.id);
                  const hasQueuedItem  = req.items.some(i => queuedBarcodes.has(i.barcode));

                  return (
                    <div
                      key={req.id}
                      className={`bg-white border rounded-2xl p-5 transition-all shadow-sm ${
                        isReqQueued
                          ? 'border-violet-400 bg-violet-50/30 ring-4 ring-violet-500/10'
                          : hasQueuedItem
                          ? 'border-primary/40 bg-primary/5 ring-2 ring-primary/10'
                          : 'border-black/5 hover:border-black/10'
                      }`}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="font-black text-gray-800 text-base leading-none">
                            <span className="text-gray-400 font-mono mr-1">#{req.id}</span>
                            {req.assignee}
                          </p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-md tracking-wider ${
                              req.requesterType === 'faculty'
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-green-50 text-green-600'
                            }`}>
                              {req.requesterType}
                            </span>
                            <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
                              <Clock size={12} /> {fmtDateTimePH(req.requestedTime)}
                            </span>
                            {isReqQueued && (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 uppercase tracking-wider flex items-center gap-1">
                                <CheckCircle size={10} /> In Queue
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-3 border border-black/5 space-y-2">
                        {req.items.map((item, i) => {
                          const isItemQueued = queuedBarcodes.has(item.barcode);
                          return (
                            <div
                              key={i}
                              className={`flex justify-between items-center text-xs p-2 rounded-lg transition-colors ${
                                isItemQueued
                                  ? 'bg-primary/10 border border-primary/20'
                                  : 'hover:bg-white border border-transparent'
                              }`}>
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <Package size={14} className={isItemQueued ? 'text-primary' : 'text-gray-400'} />
                                <span className={`font-bold truncate ${isItemQueued ? 'text-primary' : 'text-gray-700'}`}>
                                  {item.itemName}
                                </span>
                                <span className="font-mono text-[10px] text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-200 flex-shrink-0">
                                  {item.barcode}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {item.isQtyMode && (
                                  <span className="font-black text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded-md text-[10px]">
                                    ×{item.qtyOutstanding}
                                  </span>
                                )}
                                {isItemQueued && (
                                  <CheckCircle size={12} className="text-primary" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Queue Entry Sub-component ─────────────────────────────────────────────────
function QueueEntry({ entry, isProcessing, onRemove, onUpdate, wasProcessed }) {
  const [expanded, setExpanded] = useState(false);
  const isRequest = entry.type === 'request';

  const pendingItems = isRequest
    ? (entry.requestData?.items || []).filter(
        it => !['RETURNED','CANCELLED'].includes((it.item_status || it.status || '').toUpperCase())
      )
    : null;

  return (
    <div className={`p-4 transition-colors ${wasProcessed ? 'bg-green-50' : 'hover:bg-gray-50/50'}`}>
      <div className="flex items-start gap-3">

        {/* Icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
          wasProcessed ? 'bg-green-100' : isRequest ? 'bg-violet-100' : 'bg-primary/10'
        }`}>
          {wasProcessed
            ? <CheckCircle size={16} className="text-green-600" />
            : isRequest
            ? <QrCode size={16} className="text-violet-600" />
            : <Package size={16} className="text-primary" />
          }
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {isRequest ? (
            <>
              <p className="text-xs font-black text-gray-800 flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-md uppercase font-black tracking-wider">Bulk QR</span>
                {entry.requestData?.requester_name || entry.requestData?.requester_id || `Request #${entry.requestId}`}
              </p>
              <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                Request #{entry.requestId} · {pendingItems?.length ?? 0} item(s) pending
              </p>
              {pendingItems && pendingItems.length > 0 && (
                <button
                  onClick={() => setExpanded(s => !s)}
                  className="mt-1.5 text-[10px] font-bold text-violet-600 flex items-center gap-0.5 hover:text-violet-800 transition-colors">
                  {expanded ? 'Hide' : 'Show'} items
                  <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
              )}
              {expanded && (
                <ul className="mt-2 space-y-1 bg-violet-50/60 rounded-lg p-2 border border-violet-100">
                  {pendingItems.map((it, i) => (
                    <li key={i} className="text-[10px] text-gray-700 font-medium flex justify-between">
                      <span className="truncate pr-2">{it.item_name}</span>
                      <span className="font-black text-violet-700 flex-shrink-0">×{it.quantity || it.qty_requested}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className="text-xs font-black text-gray-800 truncate">{entry.itemInfo?.itemName || entry.barcode}</p>
              <p className="text-[10px] text-gray-500 font-medium mt-0.5 font-mono">{entry.barcode}</p>
              
              {/* Per-item condition */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {["Good", "Damaged", "Defective"].map(c => (
                  <button
                    key={c}
                    disabled={isProcessing}
                    onClick={() => onUpdate({ condition: c })}
                    className={`text-[9px] px-2 py-0.5 rounded-md border font-black uppercase tracking-wider transition-all ${
                      entry.condition === c
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-primary/40'
                    }`}>
                    {c}
                  </button>
                ))}
              </div>

              {/* Qty controls for qty mode */}
              {entry.itemInfo?.isQtyMode && (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-gray-400 font-bold">Qty:</span>
                  <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                    <button
                      disabled={isProcessing}
                      onClick={() => onUpdate({ qtyToReturn: Math.max(1, (entry.qtyToReturn || 1) - 1) })}
                      className="w-6 h-6 flex items-center justify-center rounded-md bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors">
                      <Minus size={11} />
                    </button>
                    <span className="w-7 text-center text-xs font-black text-gray-800">{entry.qtyToReturn}</span>
                    <button
                      disabled={isProcessing}
                      onClick={() => onUpdate({ qtyToReturn: Math.min(entry.itemInfo.qtyOutstanding, (entry.qtyToReturn || 1) + 1) })}
                      className="w-6 h-6 flex items-center justify-center rounded-md bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors">
                      <Plus size={11} />
                    </button>
                  </div>
                  <span className="text-[9px] text-gray-400">of {entry.itemInfo.qtyOutstanding}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Remove */}
        <button
          onClick={onRemove}
          disabled={isProcessing}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 mt-0.5">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}