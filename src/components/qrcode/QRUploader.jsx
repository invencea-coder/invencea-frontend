import React, { useRef, useState, useEffect } from 'react';
import { BrowserQRCodeReader } from '@zxing/library';
import { Upload, Bluetooth } from 'lucide-react';

export default function QRUploader({ onResult }) {
  const [kiosk, setKiosk] = useState(false);
  const [buffer, setBuffer] = useState('');
  const kioskRef = useRef(null);

  // Handle BLE / Bluetooth barcode scanner (sends as keyboard input)
  useEffect(() => {
    if (!kiosk) return;
    let buf = '';
    let timer;
    const handler = (e) => {
      if (e.key === 'Enter') {
        if (buf.trim()) onResult(buf.trim());
        buf = '';
        clearTimeout(timer);
      } else if (e.key.length === 1) {
        buf += e.key;
        clearTimeout(timer);
        timer = setTimeout(() => { buf = ''; }, 500);
      }
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); clearTimeout(timer); };
  }, [kiosk, onResult]);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const reader = new BrowserQRCodeReader();
      const img = URL.createObjectURL(file);
      const result = await reader.decodeFromImageUrl(img);
      onResult(result.getText());
      URL.revokeObjectURL(img);
    } catch {
      alert('Could not decode QR code from image');
    }
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-3">
      {/* File upload */}
      <label className="neu-btn flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary dark:text-darkText cursor-pointer">
        <Upload size={15} />
        Upload QR Image
        <input type="file" accept="image/*" onChange={handleFile} className="sr-only" />
      </label>

      {/* BLE/Kiosk toggle */}
      <button
        type="button"
        onClick={() => setKiosk(!kiosk)}
        className={`neu-btn flex items-center gap-2 px-4 py-2 text-sm font-medium ${kiosk ? 'text-success' : 'text-muted dark:text-darkMuted'}`}
      >
        <Bluetooth size={15} />
        {kiosk ? 'BLE Scanner Active — Scan now' : 'Enable BLE/Kiosk Scanner'}
      </button>

      {kiosk && (
        <p className="text-xs text-center text-muted dark:text-darkMuted animate-pulse-soft">
          Waiting for scanner input… Point scanner at barcode/QR.
        </p>
      )}
    </div>
  );
}
