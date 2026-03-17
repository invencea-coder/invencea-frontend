import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function NeumorphModal({ open, onClose, title, children, width = 'max-w-lg' }) {
  // Lock body scroll while open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else       document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  // ── FIX 1: Render into document.body via a Portal ──────────────────────────
  // This escapes ALL parent stacking contexts, overflow:hidden, and transform
  // properties that can silently break position:fixed modals.
  //
  // ── FIX 2: Backdrop uses onMouseDown instead of onClick ────────────────────
  // onClick fires AFTER mouseup. In React 18, state updates in event handlers
  // flush synchronously before the browser processes subsequent events, meaning
  // the same click that sets open=true can immediately hit the newly rendered
  // backdrop's onClick and call onClose — closing the modal in the same frame
  // it opened. onMouseDown fires before the modal exists in the DOM, so the
  // backdrop can only close the modal on a deliberate second interaction.
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
      onMouseDown={onClose}
    >
      {/* Inner card — stopPropagation so clicks inside don't reach backdrop */}
      <div
        className={`neu-card-lg w-full ${width} flex flex-col animate-slide-up`}
        style={{ maxHeight: 'calc(100dvh - 96px)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <h2 className="text-xl font-display font-semibold text-primary dark:text-darkText">
            {title}
          </h2>
          <button
            onMouseDown={(e) => e.stopPropagation()}
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
    </div>,
    document.body   // render outside the component tree entirely
  );
}
