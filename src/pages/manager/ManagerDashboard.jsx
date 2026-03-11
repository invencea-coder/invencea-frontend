// src/pages/manager/ManagerDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Users, ShieldCheck, DoorOpen, Plus, Trash2, Loader2, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosClient';
import { useAuth } from '../../context/AuthContext';
import NeumorphCard from '../../components/ui/NeumorphCard';
import NeumorphInput from '../../components/ui/NeumorphInput';
import NeumorphButton from '../../components/ui/NeumorphButton';
import NeumorphModal from '../../components/ui/NeumorphModal';

const StatCard = ({ icon: Icon, label, value, color }) => (
  <NeumorphCard className="p-5 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner ${color}`}>
      <Icon size={22} />
    </div>
    <div>
      <p className="text-xs text-muted uppercase tracking-wide font-bold">{label}</p>
      <p className="text-2xl font-bold text-primary font-display">{value ?? '—'}</p>
    </div>
  </NeumorphCard>
);

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ admins: 0, faculty: 0, rooms: 0 });
  const [systemUsers, setSystemUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'faculty',
    room_id: ''
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, roomsRes] = await Promise.all([
        api.get('/manager/stats'),
        api.get('/manager/users'),
        api.get('/admin/rooms') // Assuming this endpoint is accessible, or you can create /manager/rooms
      ]);
      setStats(statsRes.data?.data || statsRes.data);
      setSystemUsers(usersRes.data?.data || usersRes.data);
      setRooms(roomsRes.data?.data || roomsRes.data);
    } catch (err) {
      console.error('Failed to load manager data', err);
      toast.error('Failed to load system data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleProvisionUser = async () => {
    if (!formData.name || !formData.email) return toast.error('Name and Email are required');
    if (formData.role === 'admin' && !formData.room_id) return toast.error('Admins must be assigned a room');

    setIsSubmitting(true);
    try {
      await api.post('/manager/users', formData);
      toast.success(`${formData.role} account provisioned! Welcome email sent.`);
      setIsModalOpen(false);
      setFormData({ name: '', email: '', role: 'faculty', room_id: '' });
      loadData(); // Refresh table
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to provision user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (id, name, role) => {
    if (String(id) === String(user.id)) return toast.error('You cannot delete yourself.');
    if (!window.confirm(`Are you sure you want to permanently revoke access for ${name}?`)) return;

    try {
      await api.delete(`/manager/users/${id}`);
      toast.success(`${role} access revoked.`);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete user');
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-primary" size={32}/></div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary">System Manager</h1>
          <p className="text-sm text-muted mt-1">Master Control: Provision accounts and manage laboratory access.</p>
        </div>
        <NeumorphButton variant="primary" onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
          <Plus size={16} /> Provision New User
        </NeumorphButton>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={ShieldCheck} label="Active Admins" value={stats.admins} color="bg-blue-100 text-blue-700" />
        <StatCard icon={Users} label="Faculty Members" value={stats.faculty} color="bg-emerald-100 text-emerald-700" />
        <StatCard icon={DoorOpen} label="Managed Rooms" value={stats.rooms} color="bg-amber-100 text-amber-700" />
      </div>

      {/* User Master List */}
      <NeumorphCard className="p-0 overflow-hidden">
        <div className="p-4 bg-black/5 border-b flex justify-between items-center">
          <h2 className="font-bold text-gray-800">Master Access Control List</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.02] text-xs uppercase tracking-wider text-muted font-bold border-b">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">System Role</th>
                <th className="px-6 py-4">Assigned Room</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {systemUsers.map((u) => (
                <tr key={u.id} className="hover:bg-black/[0.01] transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-primary">{u.name}</p>
                    <p className="text-[10px] text-muted flex items-center gap-1 mt-0.5"><Mail size={10}/> {u.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border shadow-sm
                      ${u.role === 'manager' ? 'bg-purple-100 text-purple-800 border-purple-200' : 
                        u.role === 'admin' ? 'bg-blue-100 text-blue-800 border-blue-200' : 
                        'bg-emerald-100 text-emerald-800 border-emerald-200'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-600">
                    {u.role === 'admin' ? (u.room_name ? `${u.room_name} (${u.room_code})` : <span className="text-red-500 text-xs">Unassigned</span>) : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {u.role !== 'manager' && (
                      <button onClick={() => handleDeleteUser(u.id, u.name, u.role)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Revoke Access">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </NeumorphCard>

      {/* Provisioning Modal */}
      <NeumorphModal open={isModalOpen} onClose={() => setIsModalOpen(false)} title="Provision Access">
        <div className="space-y-4 p-2">
          <NeumorphInput label="Full Name" placeholder="e.g. Engr. Juan Dela Cruz" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          <NeumorphInput label="Email Address (Gmail)" placeholder="juan@domain.edu" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted uppercase tracking-widest">System Role</label>
            <select className="neu-input w-full bg-white text-sm" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value, room_id: ''})}>
              <option value="faculty">Faculty Member (Request Items)</option>
              <option value="admin">Laboratory Admin (Manage Inventory)</option>
            </select>
          </div>

          {formData.role === 'admin' && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
              <label className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Assign to Laboratory Room</label>
              <select className="neu-input w-full bg-amber-50 border-amber-200 text-sm" value={formData.room_id} onChange={e => setFormData({...formData, room_id: e.target.value})}>
                <option value="" disabled>-- Select a Room --</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <NeumorphButton variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</NeumorphButton>
            <NeumorphButton variant="primary" onClick={handleProvisionUser} loading={isSubmitting}>Provision Account</NeumorphButton>
          </div>
        </div>
      </NeumorphModal>

    </div>
  );
}