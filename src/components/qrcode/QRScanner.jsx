import React, { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/library';
import { Camera, CameraOff } from 'lucide-react';

export default function QRScanner({ onResult, onError }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [active, setActive] = useState(false);
  const [err, setErr] = useState(null);

  const start = async () => {
    try {
      setErr(null);
      readerRef.current = new BrowserQRCodeReader();
      const devices = await readerRef.current.listVideoInputDevices();
      const deviceId = devices[devices.length - 1]?.deviceId; // prefer back cam
      await readerRef.current.decodeFromVideoDevice(deviceId, videoRef.current, (result, error) => {
        if (result) {
          onResult(result.getText());
          stop();
        }
        if (error && !(error.name === 'NotFoundException')) {
          setErr(error.message);
          if (onError) onError(error);
        }
      });
      setActive(true);
    } catch (e) {
      setErr(e.message || 'Camera access denied');
    }
  };

  const stop = () => {
    readerRef.current?.reset();
    setActive(false);
  };

  useEffect(() => () => { readerRef.current?.reset(); }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="neu-inset rounded-[14px] overflow-hidden w-full max-w-xs aspect-square flex items-center justify-center">
        {active ? (
          <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted dark:text-darkMuted">
            <Camera size={36} />
            <p className="text-xs">Camera off</p>
          </div>
        )}
      </div>

      {err && <p className="text-xs text-red-500 text-center">{err}</p>}

      <button
        type="button"
        onClick={active ? stop : start}
        className={`neu-btn flex items-center gap-2 px-4 py-2 text-sm font-medium ${active ? 'text-warning' : 'text-primary dark:text-darkText'}`}
      >
        {active ? <><CameraOff size={15} /> Stop Scanner</> : <><Camera size={15} /> Start Scanner</>}
      </button>
    </div>
  );
}
