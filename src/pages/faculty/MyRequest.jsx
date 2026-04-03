// src/pages/faculty/MyRequest.jsx
import React, { useState, useRef } from 'react';
import { Package, Clock, CheckCircle2, UploadCloud, Loader2, X, Search } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import toast from 'react-hot-toast';
import { getRequestByQR } from '../../api/requestAPI';

const StatusBadge = ({ status }) => {
  const colors = {
    'PENDING':            'bg-amber-50 text-amber-800 border-amber-200',
    'PENDING APPROVAL':   'bg-amber-50 text-amber-800 border-amber-200',
    'APPROVED':           'bg-blue-50 text-blue-800 border-blue-200',
    'ISSUED':             'bg-purple-50 text-purple-800 border-purple-200',
    'PARTIALLY RETURNED': 'bg-orange-50 text-orange-800 border-orange-200',
    'RETURNED':           'bg-emerald-50 text-emerald-800 border-emerald-200',
  };
  const colorClass = colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  return <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${colorClass}`}>{status}</span>;
};

export default function MyRequest() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const fileInputRef = useRef(null);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsScanning(true);
    toast.loading('Scanning image...', { id: 'qr-scan' });

    try {
      const html5QrCode = new Html5Qrcode("qr-file-reader");
      const decodedText = await html5QrCode.scanFile(file, true);
      toast.dismiss('qr-scan');
      
      toast.loading('Fetching details...', { id: 'fetch-req' });
      const { data } = await getRequestByQR(decodedText);
      toast.dismiss('fetch-req');

      setScanResult(data.data ?? data);
      setModalOpen(true);
      toast.success('Request loaded!');
    } catch (err) {
      toast.dismiss('qr-scan');
      toast.error('No valid QR code found in this image.');
    } finally {
      setIsScanning(false);
      e.target.value = ''; 
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#e0e5ec] dark:bg-darkSurface p-4 md:p-8">
      
      {/* Hidden Div required by Html5Qrcode */}
      <div id="qr-file-reader" className="hidden"></div>

      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500">
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary shadow-inner">
            <Search size={28} />
          </div>
          <h1 className="text-3xl font-black text-gray-800 tracking-tight mb-2">Check Request Status</h1>
          <p className="text-sm font-medium text-gray-500">Upload a screenshot of your QR code to track your items.</p>
        </div>

        <div className="bg-white/80 backdrop-blur-md p-10 rounded-3xl border border-black/5 shadow-sm text-center">
          <label className={`cursor-pointer flex flex-col items-center justify-center w-full max-w-sm mx-auto h-64 border-2 border-dashed rounded-3xl transition-all ${isScanning ? 'bg-gray-50 border-gray-300 pointer-events-none' : 'border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50'}`}>
            {isScanning ? (
              <Loader2 size={48} className="mb-4 text-primary/50 animate-spin" />
            ) : (
              <UploadCloud size={48} className="mb-4 text-primary" />
            )}
            <span className={`text-lg font-black tracking-tight ${isScanning ? 'text-gray-500' : 'text-primary'}`}>
              {isScanning ? 'Scanning Image...' : 'Tap to upload screenshot'}
            </span>
            <span className="text-xs font-medium text-gray-500 mt-2 px-8 leading-relaxed">
              Select an image from your gallery containing your request QR code.
            </span>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              disabled={isScanning}
            />
          </label>
        </div>
      </div>

      {/* --- Scan Result Modal --- */}
      {modalOpen && scanResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md relative overflow-hidden rounded-3xl border border-black/5 shadow-2xl animate-in zoom-in-95 duration-300">
            
            <div className="bg-gray-50 p-5 border-b border-black/5 flex justify-between items-center">
              <div>
                <h3 className="font-black text-gray-800 text-xl tracking-tight">#{scanResult.id}</h3>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">{scanResult.purpose || 'General Request'}</p>
              </div>
              <button onClick={() => { setModalOpen(false); setScanResult(null); }} className="p-2 bg-white rounded-full text-gray-400 hover:text-red-500 shadow-sm border border-black/5 transition-all hover:scale-110">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              
              <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-black/5 shadow-sm">
                <span className="text-gray-500 font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                  <Clock size={14}/> Status
                </span>
                <StatusBadge status={scanResult.status} />
              </div>

              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Package size={14} /> Requested Items
                </p>
                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                  {scanResult.items?.map((item, idx) => {
                    const isReturned = item.status === 'RETURNED' || item.item_status === 'RETURNED';
                    const displayAssignee = (item.assigned_to === 'Shared Group' || item.assigned_to === 'Shared') ? 'Requester' : item.assigned_to;
                    
                    return (
                      <div key={idx} className={`flex justify-between items-center p-3 rounded-2xl border transition-colors ${isReturned ? 'bg-emerald-50/50 border-emerald-100' : 'bg-white border-black/5 shadow-sm'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner flex-shrink-0 ${isReturned ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-50 text-gray-400'}`}>
                            {isReturned ? <CheckCircle2 size={18} /> : <Package size={18} />}
                          </div>
                          <div className="min-w-0 pr-2">
                            <span className={`font-black text-sm truncate block ${isReturned ? 'text-emerald-900 line-through opacity-60' : 'text-gray-800'}`}>
                              {item.item_name}
                            </span>
                            {displayAssignee && displayAssignee !== 'Requester' && (
                              <p className="text-[10px] font-bold text-gray-400 mt-0.5 truncate">Assigned: {displayAssignee}</p>
                            )}
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-black border flex-shrink-0 ${isReturned ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-black/5 text-gray-600'}`}>
                          ×{item.quantity || item.qty_requested || 1}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <button onClick={() => { setModalOpen(false); setScanResult(null); }} className="w-full bg-primary hover:bg-primary/90 text-white py-4 rounded-2xl font-black tracking-wide shadow-md shadow-primary/20 transition-all">
                Done Checking
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}