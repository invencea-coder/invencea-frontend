// src/pages/kiosk/KioskStatus.jsx
import React, { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Package, Scan, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getRequestByQR } from '../../api/requestAPI';
import NeumorphCard from '../../components/ui/NeumorphCard';
import NeumorphButton from '../../components/ui/NeumorphButton';

export default function KioskStatus() {
  const [requestData, setRequestData] = useState(null);
  const [scanning, setScanning] = useState(true);

  // Status mapping for visual timeline
  const statusConfig = {
    'PENDING APPROVAL': { color: 'text-amber-500', step: 1, text: 'Awaiting Admin Approval' },
    'PENDING': { color: 'text-blue-500', step: 2, text: 'Ready to Issue at Counter' },
    'ISSUED': { color: 'text-purple-500', step: 3, text: 'Currently Borrowed' },
    'PARTIALLY RETURNED': { color: 'text-orange-500', step: 4, text: 'Missing Items - Partial Return' },
    'RETURNED': { color: 'text-emerald-500', step: 5, text: 'Fully Returned & Cleared' },
    'REJECTED': { color: 'text-red-500', step: 0, text: 'Request Denied/Archived' },
  };

  useEffect(() => {
    let scanner = null;
    if (scanning && !requestData) {
      setTimeout(() => {
        try {
          scanner = new Html5QrcodeScanner("kiosk-reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
          scanner.render(async (result) => {
            scanner.pause(true);
            toast.loading('Checking status...', { id: 'kiosk' });
            try {
              const res = await getRequestByQR(result);
              setRequestData(res.data.data);
              setScanning(false);
              toast.success('Found!', { id: 'kiosk' });
            } catch (e) {
              toast.error('Invalid QR or Request not found', { id: 'kiosk' });
              setTimeout(() => scanner.resume(), 2000);
            }
          }, () => {});
        } catch (e) { console.error(e); }
      }, 100);
    }
    return () => { if (scanner) scanner.clear().catch(()=>{}); };
  }, [scanning, requestData]);

  const currentStep = requestData ? statusConfig[requestData.status]?.step : 0;

  return (
    <div className="min-h-screen bg-[#e0e5ec] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-primary flex items-center justify-center gap-3">
            <Scan size={36} /> InvenCEA Tracker
          </h1>
          <p className="text-gray-600 mt-2">Scan your receipt QR to check request status</p>
        </div>

        <NeumorphCard className="p-8">
          {scanning ? (
            <div className="flex flex-col items-center">
              <div id="kiosk-reader" className="w-full max-w-sm rounded-xl overflow-hidden border-4 border-primary/20 bg-black/5"></div>
              <p className="mt-6 text-sm text-muted animate-pulse">Present your QR code to the camera...</p>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in zoom-in duration-300">
              
              {/* Top Banner */}
              <div className="text-center">
                <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-white shadow-sm border ${statusConfig[requestData.status].color.replace('text', 'border')}`}>
                  {requestData.status}
                </span>
                <h2 className="text-2xl font-bold text-gray-800 mt-4">Request #{requestData.id}</h2>
                <p className="text-sm text-muted">{requestData.room_code || 'Global'} • {new Date(requestData.created_at).toLocaleDateString()}</p>
              </div>

              {/* Progress Timeline Tracker */}
              {requestData.status !== 'REJECTED' && (
                <div className="relative pt-4 pb-8">
                  <div className="absolute top-1/2 left-0 w-full h-1 bg-black/5 -translate-y-1/2 rounded-full z-0"></div>
                  <div className="absolute top-1/2 left-0 h-1 bg-primary transition-all duration-700 -translate-y-1/2 rounded-full z-0" style={{ width: `${(currentStep / 5) * 100}%` }}></div>
                  
                  <div className="relative z-10 flex justify-between">
                    {[
                      { icon: <Clock/>, label: 'Approved' },
                      { icon: <Package/>, label: 'Issued' },
                      { icon: <AlertCircle/>, label: 'Partial Return' },
                      { icon: <CheckCircle/>, label: 'Cleared' }
                    ].map((step, idx) => (
                       <div key={idx} className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md transition-all ${currentStep > (idx + 1) ? 'bg-primary text-white scale-110' : 'bg-[#e0e5ec] text-muted border-2 border-white'}`}>
                          {React.cloneElement(step.icon, { size: 18 })}
                       </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Items List */}
              <div className="bg-black/5 p-4 rounded-xl border border-black/5">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Items in Request</h3>
                <div className="space-y-2">
                  {requestData.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border border-black/5">
                      <div>
                        <p className="font-bold text-sm text-gray-800">{item.item_name}</p>
                        <p className="text-[10px] font-mono text-muted">{item.inventory_item_barcode || 'Batch Item'}</p>
                      </div>
                      <span className={`text-xs font-bold uppercase ${item.item_status === 'RETURNED' ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {item.item_status || 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Deadlines & Info */}
              {requestData.return_deadline && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center">
                  <p className="text-xs font-bold text-red-500 uppercase">Return Deadline</p>
                  <p className="font-mono text-red-700 font-bold text-lg">{new Date(requestData.return_deadline).toLocaleString()}</p>
                </div>
              )}

              <NeumorphButton className="w-full py-4" variant="primary" onClick={() => { setRequestData(null); setScanning(true); }}>
                <Scan size={18} className="mr-2"/> Scan Another Request
              </NeumorphButton>
            </div>
          )}
        </NeumorphCard>
      </div>
    </div>
  );
}