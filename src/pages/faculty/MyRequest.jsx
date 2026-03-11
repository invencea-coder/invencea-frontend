// src/pages/faculty/MyRequest.jsx
import React, { useState, useRef } from 'react';
import { Package, Clock, CheckCircle2, UploadCloud, Loader2, X, MapPin, Calendar, Users } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
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

export default function MyRequest() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const fileInputRef = useRef(null);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsScanning(true);
    try {
      const html5QrCode = new Html5Qrcode("qr-file-reader");
      const decodedText = await html5QrCode.scanFile(file, true);
      const { data } = await getRequestByQR(decodedText);
      
      setScanResult(data.data);
      setModalOpen(true);
      toast.success('QR Code Read Successfully!');
    } catch (err) {
      toast.error('Could not read a valid QR code from this image.');
    } finally {
      setIsScanning(false);
      e.target.value = ''; 
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      
      <div id="qr-file-reader" className="hidden"></div>

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-primary font-display mb-2">Check Request Status</h1>
        <p className="text-muted">Upload the screenshot of your QR code to track your approval and items.</p>
      </div>

      <NeumorphCard className="p-12 flex flex-col items-center justify-center text-center space-y-6 border-2 border-dashed border-primary/20">
        <div className="relative">
          <div className="w-32 h-32 neu-inset rounded-full flex items-center justify-center relative z-10 bg-white">
            {isScanning ? <Loader2 size={56} className="text-primary animate-spin" /> : <UploadCloud size={56} className="text-primary" />}
          </div>
        </div>
        
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Upload QR Image</h2>
          <p className="text-sm text-muted mt-2 max-w-sm mx-auto mb-6">
            Select the photo of your QR code from your device gallery.
          </p>
          
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning}
            className="neu-btn-primary px-8 py-4 font-bold tracking-wider uppercase text-sm disabled:opacity-70 shadow-lg shadow-primary/20 hover:-translate-y-1 transition-all"
          >
            {isScanning ? 'Processing Image...' : 'Select File'}
          </button>
        </div>
      </NeumorphCard>

      {/* --- Scan Result Modal (Same styling as Student) --- */}
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