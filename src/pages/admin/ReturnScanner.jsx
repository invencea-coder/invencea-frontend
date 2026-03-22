import React, { useState, useEffect, useRef, useCallback } from "react";
import { ScanBarcode, Camera, Search, Loader2, CheckCircle, XCircle, Layers, Minus, Plus, Lock } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import toast from "react-hot-toast";
import api from "../../api/axiosClient.js"; // Needed to check room status
import { returnItemByBarcode, listRequests } from "../../api/requestAPI";
import { useAuth } from "../../context/AuthContext.jsx";
import NeumorphCard from "../../components/ui/NeumorphCard";

export default function ReturnScanner() {
  const { user, loading: authLoading } = useAuth();

  const [stagedBarcode, setStagedBarcode]   = useState("");
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [isProcessing, setIsProcessing]     = useState(false);
  const [condition, setCondition]           = useState("Good");
  const [cameraActive, setCameraActive]     = useState(false);
  const [qtyToReturn, setQtyToReturn]       = useState(1);
  const [activeItems, setActiveItems]       = useState([]);
  const [loadingItems, setLoadingItems]     = useState(true);
  const [searchQuery, setSearchQuery]       = useState("");
  
  // --- LOCKDOWN STATE ---
  const [isRoomLocked, setIsRoomLocked] = useState(false);

  const scannerRef       = useRef(null);
  const scanningLockRef  = useRef(false);
  const scannerBufferRef = useRef("");
  const lastKeyTimeRef   = useRef(Date.now());
  const conditionRef     = useRef(condition);
  const qtyToReturnRef   = useRef(qtyToReturn);
  const searchInputRef   = useRef(null);
  const activeItemsRef   = useRef([]);

  useEffect(() => { conditionRef.current   = condition;   }, [condition]);
  useEffect(() => { qtyToReturnRef.current = qtyToReturn; }, [qtyToReturn]);
  useEffect(() => { activeItemsRef.current = activeItems; }, [activeItems]);

  const fetchActiveItems = useCallback(async () => {
    if (!user?.room_id) return;
    try {
      setLoadingItems(true);
      
      // Fetch Room status and active requests simultaneously
      const [roomsRes, res] = await Promise.all([
        api.get('/admin/rooms').catch(() => ({ data: { data: [] } })),
        listRequests({ status: "ISSUED,PARTIALLY RETURNED" })
      ]);
      
      const myRoom = (roomsRes.data?.data || roomsRes.data || []).find(r => String(r.id) === String(user.room_id));
      if (myRoom) setIsRoomLocked(!myRoom.is_available);

      const requests = res?.data?.data || res.data || [];
      const active = [];
      requests.forEach((req) => {
        const isMyRoom = !req.room_id || String(req.room_id) === String(user.room_id);
        if (!isMyRoom) return;

        (req.items || []).forEach((item) => {
          const itemStatus    = (item.item_status || item.status || "").toString().toUpperCase();
          const requestStatus = (req.status || "").toString().toUpperCase();

          const isReturnable =
            itemStatus === "ISSUED" ||
            itemStatus === "PENDING" ||
            itemStatus === "BORROWED" ||
            (requestStatus === "ISSUED" && itemStatus !== "RETURNED" && itemStatus !== "CANCELLED");

          if (!isReturnable) return;

          if (item.stock_id) {
            const barcode = item.stock_barcode || item.barcode;
            if (!barcode) return;
            active.push({
              requestId:      req.id,
              itemName:       item.item_name || item.name || "Unknown Item",
              barcode,
              assignee:       item.assigned_to || "Shared Group",
              requesterType:  req.requester_type || "Unknown",
              requestedTime:  req.requested_time || req.issued_time,
              lastReturnTime: req.last_return_time || null,
              isQtyMode:      true,
              qtyRequested:   item.qty_requested || item.quantity || 1,
              qtyReturned:    item.qty_returned  || 0,
              qtyOutstanding: (item.qty_requested || item.quantity || 1) - (item.qty_returned || 0),
              stockId:        item.stock_id,
            });
            return;
          }

          const barcode = item.inventory_item_barcode || item.barcode || item.barcode_text;
          if (!barcode || barcode === "NO BARCODE") return;
          active.push({
            requestId:     req.id,
            itemName:      item.item_name || item.name || "Unknown Item",
            barcode,
            assignee:      item.assigned_to || req.requester_name || "Shared Group",
            requesterType: req.requester_type || "Unknown",
            requestedTime: req.requested_time || req.issued_time,
            lastReturnTime: req.last_return_time || null,
            isQtyMode:     false,
            qtyRequested:  null,
          });
        });
      });
      setActiveItems(active);
    } catch (err) {
      console.error("ReturnScanner Sync Error:", err);
      toast.error("Failed to load active items");
    } finally {
      setLoadingItems(false);
    }
  }, [user?.room_id]);

  useEffect(() => { if (!authLoading) fetchActiveItems(); }, [authLoading, fetchActiveItems]);

  const stageBarcode = useCallback((barcodeArg) => {
    // If locked, completely ignore any physical barcode scans
    if (isRoomLocked) return;
    
    const barcode = (barcodeArg ?? "").toString().trim();
    if (!barcode || scanningLockRef.current) return;
    setStagedBarcode(barcode);
    const match = activeItemsRef.current.find(i => i.barcode === barcode);
    if (match?.isQtyMode) setQtyToReturn(match.qtyOutstanding || 1);
    else setQtyToReturn(1);
  }, [isRoomLocked]);

  const confirmReturn = async () => {
    if (isRoomLocked) return;
    const barcode = stagedBarcode.trim();
    if (!barcode || scanningLockRef.current) return;
    scanningLockRef.current = true;
    setIsProcessing(true);

    const stagedItem = activeItemsRef.current.find(i => i.barcode === barcode);
    const isQtyMode  = stagedItem?.isQtyMode ?? false;
    const returnQty  = isQtyMode ? qtyToReturnRef.current : null;

    const toastId = toast.loading(`Returning ${barcode}...`);
    try {
      const body = { barcode, condition: conditionRef.current };
      if (isQtyMode && returnQty) body.qtyReturned = returnQty;

      const res = await returnItemByBarcode(body);
      const { requestStatus, itemsRemaining } = res?.data?.data || {};

      if (requestStatus === "RETURNED") {
        toast.success("Request fully returned!", { id: toastId });
      } else {
        toast.success(`Returned. ${itemsRemaining} item(s) still out.`, { id: toastId });
      }

      setScannedBarcode(barcode);
      setStagedBarcode("");
      setCondition("Good");
      setQtyToReturn(1);
      await fetchActiveItems();
    } catch (err) {
      console.error("Return error:", err);
      toast.error(err?.response?.data?.message || "Return failed", { id: toastId });
    } finally {
      scanningLockRef.current = false;
      setIsProcessing(false);
    }
  };

  const cancelStaged = () => { setStagedBarcode(""); setQtyToReturn(1); };

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (isRoomLocked) return; // Completely ignore keystrokes if locked
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
          stageBarcode(code);
          if (document.activeElement === searchInputRef.current) {
            setSearchQuery(""); searchInputRef.current.blur();
          }
        }
        return;
      }
      if (e.key.length === 1) scannerBufferRef.current += e.key;
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [stageBarcode, isRoomLocked]);

  useEffect(() => {
    let localStoppedByUs = false;
    const stopAndClear = async () => {
      const inst = scannerRef.current;
      if (!inst) return;
      try { if (typeof inst.stop === "function") await inst.stop(); } catch {}
      try { if (typeof inst.clear === "function") await inst.clear(); } catch {}
      scannerRef.current = null;
    };
    if (!cameraActive || isRoomLocked) { stopAndClear(); return () => {}; }
    if (scannerRef.current) return () => {};

    const html5QrCode = new Html5Qrcode("camera-reader");
    scannerRef.current = html5QrCode;

    const startScanner = async () => {
      let cameras = [];
      try { cameras = await Html5Qrcode.getCameras().catch(() => []); } catch { cameras = []; }
      if (!cameras || cameras.length === 0) {
        toast.error("No camera found or permission denied");
        setCameraActive(false); scannerRef.current = null; return;
      }
      const chosenCamera = cameras.find(c => /back|rear|environment/i.test(c.label || "")) || cameras[0];
      try {
        await html5QrCode.start(
          chosenCamera.id, { fps: 10, qrbox: { width: 300, height: 120 } },
          async (decodedText) => {
            try { if (typeof html5QrCode.stop === "function") await html5QrCode.stop(); } catch {}
            try { if (typeof html5QrCode.clear === "function") await html5QrCode.clear(); } catch {}
            scannerRef.current = null; localStoppedByUs = true; setCameraActive(false);
            stageBarcode(decodedText);
          }, () => {}
        );
      } catch {
        toast.error("Unable to start camera"); setCameraActive(false);
        try { if (typeof html5QrCode.clear === "function") await html5QrCode.clear(); } catch {}
        scannerRef.current = null;
      }
    };
    startScanner();
    return () => { if (!localStoppedByUs) stopAndClear(); };
  }, [cameraActive, stageBarcode, isRoomLocked]);

  const stagedItemInfo = stagedBarcode ? activeItems.find(i => i.barcode === stagedBarcode) || null : null;
  const filteredItems  = activeItems.filter(item => {
    const q = (searchQuery || "").toLowerCase();
    return (
      (item.barcode  || "").toLowerCase().includes(q) ||
      (item.itemName || "").toLowerCase().includes(q) ||
      String(item.requestId || "").includes(q)
    );
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* LOCKDOWN WARNING BANNER */}
      {isRoomLocked && (
        <div className="bg-red-50 border-2 border-red-200 p-4 rounded-2xl flex items-center gap-3 animate-fade-in">
          <div className="bg-red-100 text-red-600 p-2 rounded-xl flex-shrink-0">
            <Lock size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-red-800">Room is Unavailable</h3>
            <p className="text-xs text-red-700 mt-0.5">The return scanner is disabled. Items cannot be returned to the system while the room is locked.</p>
          </div>
        </div>
      )}

      <div className="text-center space-y-2 mb-8">
        <h1 className="text-3xl font-extrabold text-primary flex items-center justify-center gap-3">
          <ScanBarcode size={32} /> Return Scanner
        </h1>
        <p className="text-muted">Scan a barcode, then confirm the return below.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <NeumorphCard className={`p-6 space-y-6 transition-all ${isRoomLocked ? 'opacity-70 grayscale pointer-events-none' : ''}`}>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Scanner</label>
                <button disabled={isRoomLocked} onClick={() => setCameraActive(s => !s)} className="text-xs flex items-center gap-1 text-primary hover:underline">
                  <Camera size={14} /> {cameraActive ? "Close" : "Use Camera"}
                </button>
              </div>
              {cameraActive ? (
                <div id="camera-reader" className="w-full overflow-hidden rounded-xl border-4 border-primary/20" />
              ) : (
                <div className="w-full text-center p-5 rounded-2xl border-2 border-dashed bg-black/5 border-black/10 text-muted">
                  {isRoomLocked ? (
                    <>
                      <Lock size={28} className="mx-auto mb-2 opacity-40" />
                      <span className="text-xs font-medium">Scanner is locked</span>
                    </>
                  ) : (
                    <>
                      <ScanBarcode size={28} className="mx-auto mb-2 opacity-40" />
                      <span className="text-xs font-medium">Scan with USB/Bluetooth scanner or camera</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {!stagedItemInfo?.isQtyMode && (
              <div className="space-y-3 pt-4 border-t border-black/5">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Item Condition</label>
                <div className="grid grid-cols-3 gap-2">
                  {["Good", "Damaged", "Defective"].map(label => (
                    <button key={label} disabled={isRoomLocked} onClick={() => setCondition(label)}
                      className={`p-2 rounded-xl border-2 text-[10px] uppercase font-bold tracking-wider transition-all ${
                        condition === label ? "bg-primary/10 border-primary text-primary shadow-sm" : "border-transparent bg-black/[0.02] text-muted hover:bg-black/5"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-black/5 space-y-3">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Scanned Item</label>
              {stagedBarcode ? (
                <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <p className="font-mono font-bold text-primary text-base leading-none break-all">{stagedBarcode}</p>
                      {stagedItemInfo ? (
                        <>
                          <p className="text-sm font-semibold text-gray-800 mt-1 flex items-center gap-1 flex-wrap">
                            {stagedItemInfo.itemName}
                            {stagedItemInfo.isQtyMode && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 inline-flex items-center gap-0.5">
                                <Layers size={9} /> qty
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted">Request #{stagedItemInfo.requestId}</p>
                          <p className="text-[11px] text-muted">{stagedItemInfo.assignee}</p>
                          {stagedItemInfo.lastReturnTime && (
                            <p className="text-[10px] text-teal-600 font-bold mt-1">
                              ↩ Last partial: {new Date(stagedItemInfo.lastReturnTime).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-amber-600 mt-1">⚠ Not in active list — proceed carefully</p>
                      )}
                    </div>
                    {!stagedItemInfo?.isQtyMode && (
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg flex-shrink-0 ${
                        condition === "Good" ? "bg-green-100 text-green-700" :
                        condition === "Damaged" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                      }`}>{condition}</span>
                    )}
                  </div>

                  {stagedItemInfo?.isQtyMode && (
                    <div className="pt-2 border-t border-black/5">
                      <label className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-2">
                        Quantity Returning — {stagedItemInfo.qtyReturned} returned, {stagedItemInfo.qtyOutstanding} remaining
                      </label>
                      <div className="flex items-center gap-2 bg-black/5 p-1 rounded-lg w-fit">
                        <button disabled={isRoomLocked} onClick={() => setQtyToReturn(q => Math.max(1, q - 1))} className="w-8 h-8 flex items-center justify-center bg-white rounded text-muted hover:text-primary"><Minus size={14} /></button>
                        <span className="w-10 text-center text-sm font-bold">{qtyToReturn}</span>
                        <button disabled={isRoomLocked} onClick={() => setQtyToReturn(q => Math.min(stagedItemInfo.qtyOutstanding, q + 1))} className="w-8 h-8 flex items-center justify-center bg-white rounded text-muted hover:text-primary"><Plus size={14} /></button>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button onClick={cancelStaged} disabled={isProcessing || isRoomLocked}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-black/10 text-xs font-bold text-muted hover:bg-black/5 disabled:opacity-50">
                      <XCircle size={14} /> Cancel
                    </button>
                    <button onClick={confirmReturn} disabled={isProcessing || isRoomLocked}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-60">
                      {isProcessing ? <><Loader2 size={14} className="animate-spin" /> Processing...</> : <><CheckCircle size={14} /> Confirm Return</>}
                    </button>
                  </div>
                </div>
              ) : scannedBarcode ? (
                <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-4 text-center space-y-1">
                  <CheckCircle size={20} className="mx-auto text-green-500" />
                  <p className="text-xs font-bold text-green-700">Successfully Returned</p>
                  <p className="font-mono text-sm text-green-800">{scannedBarcode}</p>
                </div>
              ) : (
                <div className="rounded-2xl border-2 border-dashed border-black/10 bg-black/[0.02] p-4 text-center text-muted">
                  <p className="text-xs">No barcode scanned yet</p>
                </div>
              )}
            </div>
          </NeumorphCard>
        </div>

        <div className="lg:col-span-2">
          <NeumorphCard className="p-0 overflow-hidden h-full flex flex-col">
            <div className="p-4 bg-black/5 border-b flex justify-between items-center">
              <h2 className="font-bold">Active Borrowed Items</h2>
              <div className="relative w-48 lg:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input ref={searchInputRef} placeholder="Search by Barcode or Name..." className="neu-input w-full pl-8 text-xs py-1.5"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[500px]">
              {loadingItems ? (
                <div className="flex justify-center p-10"><Loader2 className="animate-spin text-primary" /></div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center p-10 text-muted">No active items match your criteria.</div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-black/[0.02] text-[10px] uppercase tracking-wider text-muted font-bold">
                    <tr>
                      <th className="px-4 py-3">Barcode</th>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3 text-right">Request / Returned At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, i) => (
                      <tr key={i} onClick={() => stageBarcode(item.barcode)}
                        className={`border-b border-black/5 cursor-pointer transition-colors ${stagedBarcode === item.barcode ? "bg-primary/10" : "hover:bg-black/[0.02]"}`}>
                        <td className="px-4 py-3 font-mono font-bold text-primary">
                          <div>{item.barcode}</div>
                          {item.isQtyMode && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 inline-flex items-center gap-0.5 mt-0.5">
                              <Layers size={9} /> ×{item.qtyOutstanding} remaining
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {item.itemName}
                          <span className="block text-[10px] text-muted font-normal mt-0.5">{item.assignee}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-right">
                          <span className="text-muted block">#{item.requestId}</span>
                          {item.lastReturnTime ? (
                            <span className="text-teal-600 font-bold block mt-0.5">
                              ↩ {new Date(item.lastReturnTime).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                            </span>
                          ) : item.requestedTime ? (
                            <span className="text-muted block mt-0.5">
                              {new Date(item.requestedTime).toLocaleDateString()}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </NeumorphCard>
        </div>
      </div>
    </div>
  );
}