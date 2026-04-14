import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  LayoutDashboard, Package, ClipboardList, BarChart3,
  DoorOpen, LogOut, ChevronLeft, ChevronRight,
  PlusCircle, FileText, User, ScanBarcode, Users, X
} from 'lucide-react';

const navByRole = {
  admin: [
    { label: 'Dashboard', icon: LayoutDashboard, to: '/admin' },
    { label: 'Inventory', icon: Package, to: '/admin/inventory' },
    { label: 'Process Requests', icon: ClipboardList, to: '/admin/requests', hasBadge: true },
    { label: 'Process Return', icon: ScanBarcode, to: '/admin/return-scanner' },
    { label: 'Reports & History', icon: BarChart3, to: '/admin/reports' },
    { label: 'Rooms', icon: DoorOpen, to: '/admin/rooms' },
  ],
  faculty: [
    { label: 'Dashboard', icon: LayoutDashboard, to: '/faculty' },
    { label: 'New Request', icon: PlusCircle, to: '/faculty/new-request' },
    { label: 'My Requests', icon: FileText, to: '/faculty/my-requests' },
  ],
  student: [
    { label: 'Dashboard', icon: LayoutDashboard, to: '/student' },
    { label: 'New Request', icon: PlusCircle, to: '/student/new-request' },
    { label: 'My Requests', icon: FileText, to: '/student/my-requests' },
  ],
  manager: [
    { label: 'Dashboard', icon: LayoutDashboard, to: '/manager', end: true },
    { label: 'Directory', icon: Users, to: '/manager/directory' },
  ],
};

export default function Sidebar({ pendingCount = 0, isOpen, setIsOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const nav = navByRole[user?.role] || [];

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // Auto-close mobile menu when a route changes
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname, setIsOpen]);

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden animate-fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`
          flex flex-col h-full bg-white neu-card rounded-none md:rounded-r-2xl
          transition-all duration-300 ease-in-out 
          fixed md:relative z-50 top-0 left-0
          ${collapsed ? 'md:w-16' : 'w-64 md:w-56'}
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{ minHeight: '100vh' }}
      >
        {/* Header/Logo section */}
        <div className={`flex items-center justify-between px-4 py-6 ${collapsed ? 'md:justify-center' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="neu-card-sm w-9 h-9 flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src="/favicon.ico" alt="Logo" className="w-full h-full object-contain" />
            </div>
            {(!collapsed || isOpen) && ( // Force expand text if mobile menu is open
              <div>
                <p className="font-display font-bold text-primary text-base leading-tight">InvenCEA</p>
                <p className="text-[10px] text-muted uppercase tracking-widest">Inventory</p>
              </div>
            )}
          </div>
          
          {/* Mobile Close Button */}
          <button 
            onClick={() => setIsOpen(false)} 
            className="md:hidden p-1 text-muted hover:text-primary"
          >
            <X size={20} />
          </button>
        </div>

        <hr className="neu-divider mx-3" />

        {/* User pill */}
        {(!collapsed || isOpen) && user && (
          <div className="mx-3 mb-4 neu-inset rounded-[10px] px-3 py-2.5 flex items-center gap-2 mt-4">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User size={13} className="text-primary" />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-primary truncate">{user.name || user.full_name}</p>
              <p className="text-[10px] text-muted capitalize">{user.role}</p>
            </div>
          </div>
        )}

        {/* Nav Links */}
        <nav className="flex-1 flex flex-col gap-1 px-2 overflow-y-auto mt-2">
          {nav.map(({ label, icon: Icon, to, hasBadge, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end || to.split('/').length === 2}
              onClick={() => setIsOpen(false)} // Close menu on tap
              className={({ isActive }) =>
                `sidebar-link flex items-center justify-between p-2 rounded-lg transition-colors ${
                  isActive ? 'bg-primary/10 text-primary font-bold' : 'text-muted hover:bg-black/5'
                } ${collapsed && !isOpen ? 'md:px-2' : ''}`
              }
            >
              <div className={`flex items-center gap-3 ${(collapsed && !isOpen) ? 'md:w-full md:justify-center' : ''} relative`}>
                <Icon size={17} className="flex-shrink-0" />
                {(!collapsed || isOpen) && <span>{label}</span>}
                
                {/* Collapsed Badge (Tiny Dot) */}
                {(collapsed && !isOpen) && hasBadge && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full animate-pulse"></span>
                )}
              </div>

              {/* Expanded Badge (Numbered Counter) */}
              {(!collapsed || isOpen) && hasBadge && pendingCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full font-bold shadow-sm animate-bounce">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <hr className="neu-divider mx-3 mt-2" />

        {/* Footer actions */}
        <div className="p-2 flex flex-col gap-1 mb-2">
          <button
            onClick={handleLogout}
            className={`sidebar-link flex items-center gap-3 p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors ${(collapsed && !isOpen) ? 'md:justify-center md:px-2' : ''}`}
          >
            <LogOut size={17} />
            {(!collapsed || isOpen) && <span>Log Out</span>}
          </button>
        </div>

        {/* Desktop Collapse toggle - Hidden on mobile */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex absolute -right-3 top-24 bg-white border border-black/10 shadow-sm rounded-full w-6 h-6 items-center justify-center text-muted hover:text-primary z-50 transition-colors"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>
    </>
  );
}