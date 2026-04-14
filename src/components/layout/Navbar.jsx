import React, { useState } from 'react';
import { Bell, Menu } from 'lucide-react'; // Added Menu icon
import { useAuth } from '../../hooks/useAuth.js';
import { useSocket } from '../../hooks/useSocket.js';

export default function Navbar({ pageTitle, onMenuClick }) {
  // ... (keep your existing hooks and socket logic) ...

  return (
    <header className="flex items-center justify-between px-4 md:px-6 py-4 neu-card rounded-none md:rounded-b-2xl mb-4 md:mb-6">
      <div className="flex items-center gap-3">
        {/* Hamburger Menu - Only visible on mobile */}
        <button 
          onClick={onMenuClick} 
          className="md:hidden p-1 mr-1 text-muted hover:text-primary active:scale-95 transition-transform"
        >
          <Menu size={24} />
        </button>

        <div>
          <h1 className="font-display font-semibold text-lg md:text-xl text-primary">{pageTitle}</h1>
          <p className="text-[10px] md:text-xs text-muted">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* ... (keep your existing notification bell logic exactly as it is) ... */}
      </div>
    </header>
  );
}