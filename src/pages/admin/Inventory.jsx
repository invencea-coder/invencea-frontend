// src/pages/admin/Inventory.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Search, Plus, Filter, Package, BookOpen, Cpu, Settings, Trash2, Edit2, Archive } from 'lucide-react';
import toast from 'react-hot-toast';
import NeumorphCard from '../../components/ui/NeumorphCard.jsx';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';
import NeumorphModal from '../../components/ui/NeumorphModal.jsx';
import { listInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem } from '../../api/inventoryAPI.js';

// ─── Safe metadata parser ────────────────────────────────────────────────────
// pg returns JSONB as objects, but some API paths (json_agg, aggregates) may
// serialize them as strings. This ensures we always get a plain object back.
const parseMeta = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
};

// ─── Safe string barcode ─────────────────────────────────────────────────────
// PostgreSQL numeric columns return JS numbers. Always coerce to string
// before calling .toLowerCase() or .includes() to avoid TypeError.
const str = (v) => String(v ?? '');

export default function Inventory() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const defaultForm = {
    barcode: '',
    name: '',
    type: 'borrowable',
    quantity_total: 1,
    quantity_available: 1,
    serial_number: '',
    analog_digital: 'analog',
    authors: '',
    year: new Date().getFullYear().toString(),
    condition: 'Good',
    status: 'available',
  };
  const [form, setForm] = useState(defaultForm);

  // ─── Room config ──────────────────────────────────────────────────────────
  const roomConfig = useMemo(() => {
    switch (Number(user?.room_id)) {
      case 1:
        return {
          title: 'Archi-CE Inventory',
          icon: <Settings className="text-primary" size={24} />,
          columns: ['Barcode', 'Item Name', 'Type', 'Serial / Qty', 'Condition', 'Status', 'Actions'],
          searchPlaceholder: 'Search by item name or barcode...',
        };
      case 2:
        return {
          title: 'ECE-CPE Inventory',
          icon: <Cpu className="text-blue-500" size={24} />,
          columns: ['Barcode', 'Item Name', 'Type', 'Serial / Qty', 'Signal', 'Condition', 'Status', 'Actions'],
          searchPlaceholder: 'Search by item name or barcode...',
        };
      case 3:
        return {
          title: 'Thesis Archive',
          icon: <BookOpen className="text-amber-600" size={24} />,
          columns: ['Barcode', 'Thesis Title', 'Authors', 'Year', 'Condition', 'Status', 'Actions'],
          searchPlaceholder: 'Search by authors, year, or barcode...',
        };
      default:
        return {
          title: 'Global Inventory',
          icon: <Package className="text-primary" size={24} />,
          columns: ['Barcode', 'Name/Title', 'Room', 'Condition', 'Status', 'Actions'],
          searchPlaceholder: 'Search inventory...',
        };
    }
  }, [user]);

  // ─── Data loading ─────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      const res = await listInventory();
      const borrowables = (res.data?.data?.items || []).map(i => ({ ...i, kind: 'borrowable' }));
      const consumables = (res.data?.data?.consumables || []).map(i => ({ ...i, kind: 'consumable' }));
      setItems([...borrowables, ...consumables]);
    } catch {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // ─── Filtering & sorting ──────────────────────────────────────────────────
  const filteredAndSortedItems = useMemo(() => {
    let result = items;

    // Archive vs active
    result = result.filter(item =>
      showArchived ? item.status === 'archived' : item.status !== 'archived'
    );

    // Search — FIX: always coerce barcode to string before .toLowerCase()
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(item => {
        const barcode = str(item.barcode).toLowerCase();
        const name    = str(item.name).toLowerCase();
        if (Number(user?.room_id) === 3) {
          const meta    = parseMeta(item.type_metadata);
          const authors = str(meta.authors).toLowerCase();
          const year    = str(meta.year).toLowerCase();
          return authors.includes(q) || year.includes(q) || barcode.includes(q) || name.includes(q);
        }
        return name.includes(q) || barcode.includes(q);
      });
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (Number(user?.room_id) === 3) {
        const metaA = parseMeta(a.type_metadata);
        const metaB = parseMeta(b.type_metadata);
        return parseInt(metaB.year || 0) - parseInt(metaA.year || 0);
      }
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return str(a.name).localeCompare(str(b.name));
    });

    return result;
  }, [items, searchQuery, user?.room_id, showArchived]);

  // ─── Modal handlers ───────────────────────────────────────────────────────
  const openAddModal = () => {
    setForm(defaultForm);
    setIsEdit(false);
    setEditId(null);
    setShowModal(true);
  };

  // FIX: wrap in try-catch so any unexpected error is reported, not silently swallowed.
  // FIX: use parseMeta() so metadata is always a plain object regardless of how it
  //      arrived (pg object, JSON string, or null).
  const openEditModal = useCallback((item) => {
    try {
      const itemMeta = parseMeta(item.item_metadata);
      const typeMeta = parseMeta(item.type_metadata);

      setForm({
        barcode:          str(item.barcode),
        name:             str(item.name),
        type:             item.kind === 'consumable' ? 'consumable' : 'borrowable',
        quantity_total:   item.quantity_total  ?? 1,
        quantity_available: item.quantity_available ?? 0,
        serial_number:    str(itemMeta.serial_number),
        analog_digital:   itemMeta.analog_digital  || 'analog',
        authors:          str(typeMeta.authors),
        year:             str(typeMeta.year) || new Date().getFullYear().toString(),
        condition:        itemMeta.condition  || 'Good',
        status:           item.status         || 'available',
      });

      // item_id is aliased in the DB query (ii.id AS item_id).
      // Fall back to item.id if item_id is missing (defensive).
      setEditId(item.item_id ?? item.id);
      setIsEdit(true);
      setShowModal(true);
    } catch (err) {
      console.error('openEditModal error:', err);
      toast.error('Could not open edit form. Check console for details.');
    }
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    // Small delay so close animation finishes before resetting form
    setTimeout(() => { setForm(defaultForm); setIsEdit(false); setEditId(null); }, 200);
  }, []);

  // ─── Save (add + edit) ────────────────────────────────────────────────────
  const handleSaveItem = async () => {
    if (!form.barcode.trim() || !form.name.trim()) {
      return toast.error('Barcode and Name/Title are required');
    }

    setSaving(true);
    try {
      const isThesis     = Number(user.room_id) === 3;
      const isECE        = Number(user.room_id) === 2;
      const isArchi      = Number(user.room_id) === 1;
      const itemType     = isThesis ? 'borrowable' : form.type;

      const itemMeta = { condition: form.condition };
      const typeMeta = {};

      if (isArchi || isECE) itemMeta.serial_number = form.serial_number;
      if (isECE)            itemMeta.analog_digital = form.analog_digital;
      if (isThesis) { typeMeta.authors = form.authors; typeMeta.year = form.year; }

      const payload = {
        barcode:      form.barcode.trim(),
        name:         form.name.trim(),
        type:         itemType,
        room_id:      user.room_id,
        status:       form.status,
        type_metadata: typeMeta,
        item_metadata: itemMeta,
      };

      if (itemType === 'consumable') {
        payload.quantity_total = parseInt(form.quantity_total, 10) || 1;
        if (isEdit) payload.quantity_available = parseInt(form.quantity_available, 10);
      }

      if (isEdit) {
        await updateInventoryItem(editId, payload);
        toast.success('Item updated successfully!');
      } else {
        await addInventoryItem(payload);
        toast.success('Item added successfully!');
      }

      closeModal();
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete / archive ─────────────────────────────────────────────────────
  const handleDelete = async (id, kind) => {
    if (!window.confirm('Move this item to the Archive Bin?')) return;
    try {
      await deleteInventoryItem(id, kind);
      toast.success('Item moved to Archive Bin');
      loadData();
    } catch {
      toast.error('Failed to delete item');
    }
  };

  // ─── Badge helpers ────────────────────────────────────────────────────────
  const conditionColor = (cond) => {
    switch (cond) {
      case 'Damaged':   return 'text-amber-600 bg-amber-50';
      case 'Defective': return 'text-red-600 bg-red-50';
      default:          return 'text-emerald-600 bg-emerald-50';
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case 'available':   return 'bg-green-100 text-green-700';
      case 'borrowed':    return 'bg-blue-100 text-blue-700';
      case 'unavailable': return 'bg-red-100 text-red-700';
      case 'reserved':    return 'bg-purple-100 text-purple-700';
      case 'archived':    return 'bg-gray-800 text-gray-200';
      default:            return 'bg-gray-100 text-gray-700';
    }
  };

  const roomId = Number(user?.room_id);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-white rounded-2xl shadow-sm border border-black/5">
            {roomConfig.icon}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">{roomConfig.title}</h1>
            <p className="text-xs text-muted">Manage your branch assets</p>
          </div>
        </div>
        <NeumorphButton variant="primary" onClick={openAddModal}>
          <Plus size={16} className="mr-2" /> Add New Item
        </NeumorphButton>
      </div>

      {/* Toolbar */}
      <NeumorphCard className="p-4 flex gap-4">
        <NeumorphInput
          icon={<Search size={16} />}
          placeholder={roomConfig.searchPlaceholder}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <NeumorphButton
          variant={showArchived ? 'primary' : 'outline'}
          className="px-4 transition-all"
          onClick={() => setShowArchived(v => !v)}
        >
          <Archive size={16} className={showArchived ? 'mr-2' : ''} />
          {showArchived && 'Viewing Archive'}
        </NeumorphButton>
        <NeumorphButton variant="outline" className="px-4"><Filter size={16} /></NeumorphButton>
      </NeumorphCard>

      {/* Table */}
      <NeumorphCard className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-10"><div className="neu-spinner" /></div>
        ) : filteredAndSortedItems.length === 0 ? (
          <div className="p-10 text-center text-muted">
            {showArchived ? 'Archive bin is empty.' : 'No items found matching your criteria.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-black/5 text-xs uppercase text-muted font-bold">
                <tr>
                  {roomConfig.columns.map(col => (
                    <th key={col} className="px-6 py-4 whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filteredAndSortedItems.map(item => {
                  const itemMeta = parseMeta(item.item_metadata);
                  const typeMeta = parseMeta(item.type_metadata);
                  return (
                    <tr
                      key={`${item.kind}-${item.item_id ?? item.id}`}
                      className={`hover:bg-black/[0.02] transition-colors ${item.status === 'archived' ? 'opacity-70 bg-gray-50' : ''}`}
                    >
                      {/* Barcode — always coerce to string */}
                      <td className="px-6 py-4 font-mono font-medium text-xs">{str(item.barcode)}</td>

                      {/* Room-specific columns */}
                      {roomId === 3 ? (
                        <>
                          <td className="px-6 py-4 font-bold text-gray-800">{item.name}</td>
                          <td className="px-6 py-4 text-xs">{typeMeta.authors || '—'}</td>
                          <td className="px-6 py-4 font-mono text-xs">{typeMeta.year || '—'}</td>
                        </>
                      ) : roomId === 2 ? (
                        <>
                          <td className="px-6 py-4 font-bold text-gray-800">{item.name}</td>
                          <td className="px-6 py-4 capitalize text-xs">{item.kind}</td>
                          <td className="px-6 py-4 font-mono text-xs">
                            {item.kind === 'consumable'
                              ? <span className="text-blue-600 font-bold">{item.quantity_available} / {item.quantity_total} Qty</span>
                              : itemMeta.serial_number || '—'}
                          </td>
                          <td className="px-6 py-4 uppercase text-xs font-bold text-blue-600">
                            {itemMeta.analog_digital || '—'}
                          </td>
                        </>
                      ) : roomId === 1 ? (
                        <>
                          <td className="px-6 py-4 font-bold text-gray-800">{item.name}</td>
                          <td className="px-6 py-4 capitalize text-xs">{item.kind}</td>
                          <td className="px-6 py-4 font-mono text-xs">
                            {item.kind === 'consumable'
                              ? <span className="text-blue-600 font-bold">{item.quantity_available} / {item.quantity_total} Qty</span>
                              : itemMeta.serial_number || '—'}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 font-bold text-gray-800">{item.name}</td>
                          <td className="px-6 py-4">{item.room_code || 'Global'}</td>
                        </>
                      )}

                      {/* Condition */}
                      <td className="px-6 py-4">
                        {item.kind === 'consumable' ? (
                          <span className="text-xs text-muted">—</span>
                        ) : (
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${conditionColor(itemMeta.condition)}`}>
                            {itemMeta.condition || 'Good'}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        {item.kind === 'consumable' ? (
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${item.quantity_available > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {item.quantity_available > 0 ? 'In Stock' : 'Out of Stock'}
                          </span>
                        ) : (
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${statusColor(item.status)}`}>
                            {item.status}
                          </span>
                        )}
                      </td>

                      {/* Actions
                          FIX: e.stopPropagation() prevents the click from bubbling to
                          the modal backdrop, which would open-then-immediately-close the modal. */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                            className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          {!showArchived && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(item.item_id ?? item.id, item.kind); }}
                              className="p-2 text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Move to Archive"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </NeumorphCard>

      {/* Add / Edit Modal */}
      <NeumorphModal
        open={showModal}
        onClose={closeModal}
        title={isEdit ? 'Edit Inventory Item' : 'Add New Inventory Item'}
      >
        <div className="space-y-4">

          {/* Row 1: Barcode + Status (borrowable only) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NeumorphInput
              label="Barcode (Required)"
              value={form.barcode}
              disabled={isEdit}
              onChange={e => setForm({ ...form, barcode: e.target.value })}
              placeholder="Scan or type barcode..."
            />

            {form.type === 'borrowable' && (
              <div>
                <label className="text-xs font-bold text-muted uppercase mb-1 block">Borrowing Status</label>
                <select
                  className="neu-input w-full"
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value })}
                >
                  <option value="available">Available (Visible to Students)</option>
                  <option value="unavailable">Unavailable (Hidden)</option>
                  <option value="reserved">Reserved (Hidden)</option>
                  <option value="archived">Archived (Bin)</option>
                  {/* Only render this option when the item is currently borrowed
                      so the select always has a matching option for its value */}
                  {form.status === 'borrowed' && (
                    <option value="borrowed" disabled>Currently Borrowed</option>
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Room 3 (Thesis) fields */}
          {roomId === 3 ? (
            <>
              <NeumorphInput
                label="Thesis Title"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NeumorphInput
                  label="Authors (comma-separated)"
                  value={form.authors}
                  onChange={e => setForm({ ...form, authors: e.target.value })}
                />
                <NeumorphInput
                  label="Year Published"
                  type="number"
                  value={form.year}
                  onChange={e => setForm({ ...form, year: e.target.value })}
                />
              </div>
            </>
          ) : (
            <>
              {/* Item Name */}
              <NeumorphInput
                label="Item Name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />

              {/* Type + Qty or Serial */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-muted uppercase mb-1 block">Item Type</label>
                  <select
                    className="neu-input w-full"
                    disabled={isEdit}
                    value={form.type}
                    onChange={e => setForm({ ...form, type: e.target.value })}
                  >
                    <option value="borrowable">Borrowable Equipment</option>
                    <option value="consumable">Consumable Material (Batch)</option>
                  </select>
                </div>

                {form.type === 'consumable' ? (
                  <div className="flex gap-2">
                    <NeumorphInput
                      label="Total Qty"
                      type="number"
                      min="1"
                      value={form.quantity_total}
                      onChange={e => setForm({ ...form, quantity_total: e.target.value })}
                    />
                    {isEdit && (
                      <NeumorphInput
                        label="Available Qty"
                        type="number"
                        min="0"
                        value={form.quantity_available}
                        onChange={e => setForm({ ...form, quantity_available: e.target.value })}
                      />
                    )}
                  </div>
                ) : (
                  <NeumorphInput
                    label="Serial Number (Optional)"
                    value={form.serial_number}
                    onChange={e => setForm({ ...form, serial_number: e.target.value })}
                  />
                )}
              </div>

              {/* Condition + Signal type (ECE only) */}
              {form.type === 'borrowable' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-muted uppercase mb-1 block">Physical Condition</label>
                    <select
                      className="neu-input w-full"
                      value={form.condition}
                      onChange={e => setForm({ ...form, condition: e.target.value })}
                    >
                      <option value="Good">Good</option>
                      <option value="Damaged">Damaged (Needs repair)</option>
                      <option value="Defective">Defective (Unusable)</option>
                    </select>
                  </div>

                  {roomId === 2 && (
                    <div>
                      <label className="text-xs font-bold text-muted uppercase mb-1 block">Signal Type</label>
                      <select
                        className="neu-input w-full"
                        value={form.analog_digital}
                        onChange={e => setForm({ ...form, analog_digital: e.target.value })}
                      >
                        <option value="analog">Analog</option>
                        <option value="digital">Digital</option>
                        <option value="n/a">Not Applicable</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Footer buttons */}
          <div className="pt-4 flex gap-2">
            <NeumorphButton variant="outline" className="flex-1" onClick={closeModal}>
              Cancel
            </NeumorphButton>
            <NeumorphButton variant="primary" className="flex-1" onClick={handleSaveItem} loading={saving}>
              {isEdit ? 'Save Changes' : 'Add Item'}
            </NeumorphButton>
          </div>
        </div>
      </NeumorphModal>
    </div>
  );
}
