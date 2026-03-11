// src/pages/shared/MyRequests.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Package, Clock, CheckCircle2, ScanLine, X, MapPin, Calendar, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { getRequestByQR } from '../../api/requestAPI';
import NeumorphCard from '../../components/ui/NeumorphCard';

const StatusBadge = ({ status }) => {
  const colors = {
    'PENDING': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'PENDING APPROVAL': 'bg-amber-100 text-amber-800 border-amber-200',
    'APPROVED': 'bg-blue-100 text-blue-800 border-blue-200',
    'ISSUED': 'bg-green-100 text-green-800 border-green-200',
    'PARTIALLY RETURNED': 'bg-teal-100 text-teal-800 border-teal-200',
    'RETURNED': 'bg-gray-100 text-gray-600 border-gray-200',
  };
  const colorClass = colors[status] || 'bg-gray-100 text-gray-800';
  return <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${colorClass}`}>{status}</span>;
};

export default function MyRequests() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const scannerInputRef = useRef(null);

  // Keep hidden input strictly focused for the physical barcode scanner
  useEffect(() => {
    if (!modalOpen) {
      const focusInterval = setInterval(() => {
        if (document.activeElement !== scannerInputRef.current) {
          scannerInputRef.current?.focus();
        }
      }, 500);
      return () => clearInterval(focusInterval);
    }
  }, [modalOpen]);

  const handleScannerInput = async (e) => {
    if (e.key === 'Enter') {
      const code = e.target.value.trim();
      e.target.value = ''; 
      
      if (!code) return;
      
      setIsScanning(true);
      try {
        const { data } = await getRequestByQR(code);
        setScanResult(data.data);
        setModalOpen(true);
        toast.success('QR Code Read Successfully!');
      } catch (err) {
        toast.error('Invalid QR Code or Request not found.');
        setTimeout(() => scannerInputRef.current?.focus(), 100);
      } finally {
        setIsScanning(false);
      }
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      
      {/* Hidden input catching physical scanner data */}
      <input 
        ref={scannerInputRef}
        type="text" 
        className="absolute opacity-0 w-0 h-0" 
        onKeyDown={handleScannerInput}
      />

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-primary font-display mb-2">Check Request Status</h1>
        <p className="text-muted">Use the scanner provided to read the QR code you captured on your phone.</p>
      </div>

      <NeumorphCard className="p-12 flex flex-col items-center justify-center text-center space-y-6 border-2 border-dashed border-primary/20">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
          <div className="w-32 h-32 neu-inset rounded-full flex items-center justify-center relative z-10 bg-white">
            <ScanLine size={56} className={`text-primary ${isScanning ? 'animate-pulse' : ''}`} />
          </div>
        </div>
        
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Ready to Scan</h2>
          <p className="text-sm text-muted mt-2 max-w-sm mx-auto">
            Open the photo of your QR code on your phone, maximize the brightness, and hold it under the red laser.
          </p>
        </div>
      </NeumorphCard>

      {/* --- Scan Result Modal --- */}
      {modalOpen && scanResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="neu-card-lg w-full max-w-md relative bg-white overflow-hidden p-0">
            
            <div className="bg-primary/5 p-5 border-b border-primary/10 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-primary font-mono text-lg">#{scanResult.id}</h3>
                <p className="text-xs font-medium text-muted uppercase tracking-wider">{scanResult.purpose || 'General Request'}</p>
              </div>
              <button onClick={() => { setModalOpen(false); setScanResult(null); }} className="p-2 bg-white rounded-full text-muted hover:text-red-500 shadow-sm border border-black/5 transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              
              <div className="flex justify-between items-center bg-black/[0.02] p-4 rounded-xl border border-black/5">
                <span className="text-muted font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                  <Clock size={16}/> Status
                </span>
                <StatusBadge status={scanResult.status} />
              </div>

              <div>
                <p className="text-xs font-bold text-muted uppercase mb-2 tracking-wider flex items-center gap-1">
                  <Package size={14} /> Requested Items
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {scanResult.items?.map((item, idx) => {
                    const isReturned = item.status === 'RETURNED';
                    const displayAssignee = (item.assigned_to === 'Shared Group' || item.assigned_to === 'Shared') ? 'Requester' : item.assigned_to;
                    
                    return (
                      <div key={idx} className={`flex justify-between items-center p-3 rounded-xl border transition-colors ${isReturned ? 'bg-emerald-50 border-emerald-100' : 'bg-black/[0.02] border-black/5'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${isReturned ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-muted'}`}>
                            {isReturned ? <CheckCircle2 size={16} /> : <Package size={16} />}
                          </div>
                          <div>
                            <span className={`font-bold text-sm ${isReturned ? 'text-emerald-900 line-through opacity-70' : 'text-gray-800'}`}>
                              {item.item_name}
                            </span>
                            {displayAssignee && displayAssignee !== 'Requester' && (
                              <p className="text-[10px] font-bold text-muted mt-0.5">Assigned to: {displayAssignee}</p>
                            )}
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-bold border ${isReturned ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-white border-black/10 text-primary shadow-sm'}`}>
                          x{item.quantity}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <button onClick={() => { setModalOpen(false); setScanResult(null); }} className="w-full neu-btn text-primary py-3.5 font-bold uppercase tracking-wider text-sm">
                Done Checking
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}