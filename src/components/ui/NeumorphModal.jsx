import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function NeumorphModal({ open, onClose, title, children, width = 'max-w-lg' }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(74,0,0,0.25)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className={`neu-card-lg w-full ${width} flex flex-col animate-slide-up`}
        style={{ maxHeight: 'calc(100vh - 80px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — fixed, never scrolls away */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <h2 className="text-xl font-display font-semibold text-primary dark:text-darkText">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="neu-btn w-8 h-8 flex items-center justify-center text-muted hover:text-primary dark:hover:text-darkText"
          >
            <X size={16} />
          </button>
        </div>
        <hr className="neu-divider mx-6 flex-shrink-0" />

        {/* Scrollable body */}
        <div className="px-6 pb-6 pt-2 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}
