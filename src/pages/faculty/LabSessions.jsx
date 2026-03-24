// src/pages/faculty/LabSessions.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, FlaskConical, Clock, Users, Copy, Check,
  Trash2, Loader2, ChevronDown, ChevronUp, PackageX
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axiosClient';
import { listInventory } from '../../api/inventoryAPI';
import NeumorphCard from '../../components/ui/NeumorphCard';
import NeumorphButton from '../../components/ui/NeumorphButton';
import NeumorphInput from '../../components/ui/NeumorphInput';
import NeumorphModal from '../../components/ui/NeumorphModal';

const purposeOptions = [
  'Laboratory Activity',
  'Class Demonstration / Instruction',
  'Thesis / Capstone Project',
  'Course Project / Assignment',
  'Research / Development',
  'Other',
];

function CodeBadge({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-2 font-mono text-xl font-bold tracking-widest text-primary bg-primary/5 border border-primary/20 px-4 py-2 rounded-xl hover:bg-primary/10 transition-colors"
    >
      {code}
      {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-muted" />}
    </button>
  );
}

export default function LabSessions() {
  const { user } = useAuth();
  const [sessions, setSessions]       = useState([]);
  const [inventory, setInventory]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showCreate, setShowCreate]   = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [expandedId, setExpandedId]   = useState(null);

  // Form state
  const [form, setForm] = useState({
    purpose: '', customPurpose: '',
    start_time: '', end_time: '',
  });
  const [cartItems, setCartItems]     = useState([]);
  const [itemSearch, setItemSearch]   = useState('');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/lab-sessions/my');
      setSessions(res.data?.data || []);
    } catch {
      toast.error('Failed to load lab sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    if (!user?.room_id) return;
    listInventory({ room_id: user.room_id })
      .then(res => {
        const items = (res.data?.data?.items || [])
          .filter(i => i.status === 'available')
          .reduce((acc, i) => {
            if (!acc.find(x => x.inventory_type_id === i.inventory_type_id)) acc.push(i);
            return acc;
          }, []);
        const consumables = (res.data?.data?.consumables || [])
          .filter(i => i.quantity_available > 0);
        setInventory([...items, ...consumables]);
      })
      .catch(() => {});
  }, [user?.room_id]);

  const addItem = (inv) => {
    const exists = cartItems.find(c => c.inventory_type_id === inv.inventory_type_id);
    if (exists) {
      setCartItems(cartItems.map(c =>
        c.inventory_type_id === inv.inventory_type_id
          ? { ...c, quantity: c.quantity + 1 }
          : c
      ));
    } else {
      setCartItems([...cartItems, {
        inventory_type_id: inv.inventory_type_id,
        name:     inv.name,
        quantity: 1,
        kind:     inv.kind || 'borrowable',
      }]);
    }
    setItemSearch('');
    toast.success(`${inv.name} added`);
  };

  const removeItem = (typeId) => setCartItems(cartItems.filter(c => c.inventory_type_id !== typeId));

  const handleCreate = async () => {
    const finalPurpose = form.purpose === 'Other' ? form.customPurpose.trim() : form.purpose;
    if (!finalPurpose)        return toast.error('Please select a purpose');
    if (!form.start_time)     return toast.error('Please set a start time');
    if (!form.end_time)       return toast.error('Please set an end time');
    if (!cartItems.length)    return toast.error('Please add at least one item');

    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await api.post('/lab-sessions', {
        room_id:    user.room_id,
        purpose:    finalPurpose,
        items:      cartItems,
        start_time: new Date(`${today}T${form.start_time}`).toISOString(),
        end_time:   new Date(`${today}T${form.end_time}`).toISOString(),
      });
      toast.success('Lab session created!');
      setShowCreate(false);
      setForm({ purpose: '', customPurpose: '', start_time: '', end_time: '' });
      setCartItems([]);
      fetchSessions();
      setExpandedId(res.data.data.id);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to create session');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id) => {
    try {
      await api.put(`/lab-sessions/${id}/deactivate`);
      toast.success('Session deactivated');
      fetchSessions();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to deactivate');
    }
  };

  const now = new Date();

  const sessionStatus = (s) => {
    if (!s.is_active) return { label: 'Deactivated', cls: 'bg-gray-100 text-gray-500' };
    if (now > new Date(s.end_time)) return { label: 'Ended', cls: 'bg-gray-100 text-gray-500' };
    if (now < new Date(s.start_time)) return { label: 'Upcoming', cls: 'bg-blue-100 text-blue-700' };
    return { label: 'Active', cls: 'bg-green-100 text-green-700' };
  };

  const filteredInv = inventory.filter(i =>
    i.name.toLowerCase().includes(itemSearch.toLowerCase())
  ).slice(0, 8);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary font-display mb-1">Lab Sessions</h1>
          <p className="text-muted text-sm">Create a session code so students can borrow items without waiting for approval.</p>
        </div>
        <NeumorphButton variant="primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} className="mr-2" /> New Session
        </NeumorphButton>
      </div>

      {/* Sessions list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={28} /></div>
      ) : sessions.length === 0 ? (
        <NeumorphCard className="p-12 text-center">
          <FlaskConical size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-bold text-gray-700">No lab sessions yet</p>
          <p className="text-sm text-muted mt-1">Create a session so students can join directly at the kiosk.</p>
        </NeumorphCard>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => {
            const status = sessionStatus(s);
            const isExpanded = expandedId === s.id;
            return (
              <NeumorphCard key={s.id} className="p-0 overflow-hidden">
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-black/[0.01]"
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center">
                      <FlaskConical size={22} className="text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <CodeBadge code={s.code} />
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${status.cls}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="text-sm text-muted">{s.purpose}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-muted flex items-center gap-1 justify-end">
                        <Clock size={12} />
                        {new Date(s.start_time).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        {' — '}
                        {new Date(s.end_time).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </p>
                      <p className="text-xs text-muted flex items-center gap-1 justify-end mt-0.5">
                        <Users size={12} /> {s.claim_count} student{s.claim_count !== 1 ? 's' : ''} claimed
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp size={18} className="text-muted" /> : <ChevronDown size={18} className="text-muted" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 border-t border-black/5 bg-black/[0.01] space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-bold text-muted uppercase mb-2">Items included</p>
                        <div className="space-y-1">
                          {(s.items || []).map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm bg-white p-2 rounded-lg border border-black/5">
                              <span>{item.name}</span>
                              <span className="font-bold text-primary">×{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-muted uppercase mb-2">Session info</p>
                        <div className="text-sm space-y-1">
                          <p><span className="text-muted">Room:</span> {s.room_name}</p>
                          <p><span className="text-muted">Claims:</span> {s.claim_count}</p>
                          <p><span className="text-muted">Created:</span> {new Date(s.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>

                    {s.is_active && now <= new Date(s.end_time) && (
                      <div className="flex justify-end pt-2 border-t border-black/5">
                        <NeumorphButton
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeactivate(s.id)}
                          className="text-red-500 border-red-200 hover:bg-red-50"
                        >
                          <Trash2 size={14} className="mr-1" /> Deactivate Session
                        </NeumorphButton>
                      </div>
                    )}
                  </div>
                )}
              </NeumorphCard>
            );
          })}
        </div>
      )}

      {/* Create Session Modal */}
      <NeumorphModal open={showCreate} onClose={() => setShowCreate(false)} title="Create Lab Session" size="lg">
        <div className="space-y-5 mt-2">

          {/* Purpose */}
          <div>
            <label className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2 block">Purpose / Activity</label>
            <select
              className="neu-input w-full bg-white text-sm"
              value={form.purpose}
              onChange={e => setForm({ ...form, purpose: e.target.value, customPurpose: '' })}
            >
              <option value="" disabled>-- Select Purpose --</option>
              {purposeOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {form.purpose === 'Other' && (
            <NeumorphInput
              placeholder="Specify purpose..."
              value={form.customPurpose}
              onChange={e => setForm({ ...form, customPurpose: e.target.value })}
            />
          )}

          {/* Time range */}
          <div className="grid grid-cols-2 gap-4">
            <NeumorphInput
              label="Start Time"
              type="time"
              value={form.start_time}
              onChange={e => setForm({ ...form, start_time: e.target.value })}
            />
            <NeumorphInput
              label="End Time"
              type="time"
              value={form.end_time}
              onChange={e => setForm({ ...form, end_time: e.target.value })}
            />
          </div>

          {/* Item picker */}
          <div>
            <label className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2 block">Items to include</label>
            <div className="relative mb-3">
              <NeumorphInput
                placeholder="Search inventory..."
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                className="w-full"
              />
              {itemSearch && filteredInv.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-black/10 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {filteredInv.map(inv => (
                    <button
                      key={inv.inventory_type_id}
                      onClick={() => addItem(inv)}
                      className="w-full text-left px-4 py-3 hover:bg-primary/5 border-b border-black/5 flex justify-between items-center text-sm"
                    >
                      <span>{inv.name}</span>
                      <Plus size={14} className="text-primary" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {cartItems.length === 0 ? (
              <div className="p-6 text-center text-muted border-2 border-dashed border-black/10 rounded-xl text-sm">
                <PackageX size={24} className="mx-auto mb-2 opacity-30" />
                No items added yet
              </div>
            ) : (
              <div className="space-y-2">
                {cartItems.map(item => (
                  <div key={item.inventory_type_id} className="flex justify-between items-center p-3 bg-white border border-black/5 rounded-xl">
                    <span className="text-sm font-medium">{item.name}</span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 bg-black/5 rounded-lg p-1">
                        <button
                          onClick={() => setCartItems(cartItems.map(c =>
                            c.inventory_type_id === item.inventory_type_id
                              ? { ...c, quantity: Math.max(1, c.quantity - 1) }
                              : c
                          ))}
                          className="w-6 h-6 flex items-center justify-center bg-white rounded text-muted hover:text-primary text-sm font-bold"
                        >−</button>
                        <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                        <button
                          onClick={() => setCartItems(cartItems.map(c =>
                            c.inventory_type_id === item.inventory_type_id
                              ? { ...c, quantity: c.quantity + 1 }
                              : c
                          ))}
                          className="w-6 h-6 flex items-center justify-center bg-white rounded text-muted hover:text-primary text-sm font-bold"
                        >+</button>
                      </div>
                      <button onClick={() => removeItem(item.inventory_type_id)} className="text-red-400 hover:text-red-600 p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2 border-t border-black/5">
            <NeumorphButton variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancel</NeumorphButton>
            <NeumorphButton variant="primary" className="flex-1" onClick={handleCreate} loading={submitting}>
              <FlaskConical size={16} className="mr-2" /> Create Session
            </NeumorphButton>
          </div>
        </div>
      </NeumorphModal>
    </div>
  );
}
