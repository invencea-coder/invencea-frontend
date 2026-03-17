// src/pages/admin/Inventory.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Search, Plus, Filter, Package, BookOpen, Cpu, Settings, Trash2, Edit2, Archive } from 'lucide-react';
import toast from 'react-hot-toast';
import NeumorphCard from '../../components/ui/NeumorphCard.jsx';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';
import NeumorphModal from '../../components/ui/NeumorphModal.jsx';
import { listInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem } from '../../api/inventoryAPI.js'; 

export default function Inventory() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false); // <-- NEW: Archive Toggle State
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form State
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
    condition: 'Good',    // Physical condition
    status: 'available'   // Borrowable logic
  };
  const [form, setForm] = useState(defaultForm);

  // --- Branch Configurations ---
  const roomConfig = useMemo(() => {
    switch (Number(user?.room_id)) {
      case 1: // ACEIS
        return {
          title: 'Archi-CE Inventory',
          icon: <Settings className="text-primary" size={24} />,
          columns: ['Barcode', 'Item Name', 'Type', 'Serial / Qty', 'Condition', 'Status', 'Actions'],
          searchPlaceholder: 'Search by item name or barcode...',
        };
      case 2: // ECEIS
        return {
          title: 'ECE-CPE Inventory',
          icon: <Cpu className="text-blue-500" size={24} />,
          columns: ['Barcode', 'Item Name', 'Type', 'Serial / Qty', 'Signal', 'Condition', 'Status', 'Actions'],
          searchPlaceholder: 'Search by item name or barcode...',
        };
      case 3: // CPEIS (Thesis Archive)
        return {
          title: 'Thesis Archive',
          icon: <BookOpen className="text-amber-600" size={24} />,
          columns: ['Barcode', 'Thesis Title', 'Authors', 'Year', 'Condition', 'Status', 'Actions'],
          searchPlaceholder: 'Search by authors, year, or barcode...',
        };
      default: // Master Admin
        return {
          title: 'Global Inventory',
          icon: <Package className="text-primary" size={24} />,
          columns: ['Barcode', 'Name/Title', 'Room', 'Condition', 'Status', 'Actions'],
          searchPlaceholder: 'Search inventory...',
        };
    }
  }, [user]);

  // --- Data Loading ---
  const loadData = async () => {
    setLoading(true);
    try {
      const res = await listInventory();
      const borrowables = (res.data?.data?.items || []).map(i => ({...i, kind: 'borrowable'}));
      const consumables = (res.data?.data?.consumables || []).map(i => ({...i, kind: 'consumable'}));
      setItems([...borrowables, ...consumables]);
    } catch (e) {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // --- Dynamic Filtering & Sorting ---
  const filteredAndSortedItems = useMemo(() => {
    let result = items;

    // 1. Archive vs Active Filter (NEW)
    result = result.filter(item => {
      if (showArchived) return item.status === 'archived';
      return item.status !== 'archived';
    });

    // 2. Search Filter
    const q = searchQuery.toLowerCase();
    if (q) {
      result = result.filter(item => {
        if (Number(user?.room_id) === 3) {
          const authors = (item.type_metadata?.authors || '').toLowerCase();
          const year = (item.type_metadata?.year || '').toLowerCase();
          return authors.includes(q) || year.includes(q) || item.barcode.toLowerCase().includes(q) || (item.name || '').toLowerCase().includes(q);
        } else {
          return (item.name || '').toLowerCase().includes(q) || item.barcode.toLowerCase().includes(q);
        }
      });
    }

    // 3. Sorting
    result.sort((a, b) => {
      if (Number(user?.room_id) === 3) {
        return parseInt(b.type_metadata?.year || 0) - parseInt(a.type_metadata?.year || 0);
      } else {
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
        return (a.name || '').localeCompare(b.name || '');
      }
    });

    return result;
  }, [items, searchQuery, user?.room_id, showArchived]);

  // --- Modal Handlers ---
  const openAddModal = () => {
    setForm(defaultForm);
    setIsEdit(false);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setForm({
      barcode: item.barcode,
      name: item.name,
      type: item.kind,
      quantity_total: item.quantity_total || 1,
      quantity_available: item.quantity_available || 0,
      serial_number: item.item_metadata?.serial_number || '',
      analog_digital: item.item_metadata?.analog_digital || 'analog',
      authors: item.type_metadata?.authors || '',
      year: item.type_metadata?.year || new Date().getFullYear().toString(),
      condition: item.item_metadata?.condition || 'Good',
      status: item.status || 'available'
    });
    setEditId(item.item_id);
    setIsEdit(true);
    setShowModal(true);
  };

  // --- Form Submission (Add & Edit) ---
  const handleSaveItem = async () => {
    if (!form.barcode || !form.name) return toast.error("Barcode and Name/Title are required");
    
    setSaving(true);
    try {
      const payload = {
        barcode: form.barcode,
        name: form.name,
        type: Number(user.room_id) === 3 ? 'borrowable' : form.type, // Thesis is 1-to-1 borrowable
        room_id: user.room_id,
        status: form.status, 
        type_metadata: {},
        item_metadata: { condition: form.condition } // Inject physical condition
      };

      if (payload.type === 'consumable') {
        payload.quantity_total = parseInt(form.quantity_total, 10);
        if (isEdit) payload.quantity_available = parseInt(form.quantity_available, 10);
      }

      if (Number(user.room_id) === 1) { 
        payload.item_metadata.serial_number = form.serial_number;
      } else if (Number(user.room_id) === 2) { 
        payload.item_metadata.serial_number = form.serial_number;
        payload.item_metadata.analog_digital = form.analog_digital;
      } else if (Number(user.room_id) === 3) { 
        payload.type_metadata = { authors: form.authors, year: form.year };
      }

      if (isEdit) {
        await updateInventoryItem(editId, payload);
        toast.success('Item updated successfully!');
      } else {
        await addInventoryItem(payload);
        toast.success('Item added successfully!');
      }

      setShowModal(false);
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  // --- Deletion ---
  const handleDelete = async (id, kind) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    try {
      await deleteInventoryItem(id, kind);
      toast.success('Item moved to Archive Bin');
      loadData();
    } catch (e) {
      toast.error('Failed to delete item');
    }
  };

  // Condition Badge Color Helper
  const getConditionColor = (cond) => {
    switch(cond) {
      case 'Good': return 'text-emerald-600 bg-emerald-50';
      case 'Damaged': return 'text-amber-600 bg-amber-50';
      case 'Defective': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // Status Badge Color Helper
  const getStatusColor = (status) => {
    switch(status) {
      case 'available': return 'bg-green-100 text-green-700';
      case 'borrowed': return 'bg-blue-100 text-blue-700';
      case 'unavailable': return 'bg-red-100 text-red-700';
      case 'reserved': return 'bg-purple-100 text-purple-700';
      case 'archived': return 'bg-gray-800 text-gray-200'; // Added color for archived tag
      default: return 'bg-gray-100 text-gray-700';
    }
  };

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
            <p className="text-xs text-muted">Manage your specific branch assets</p>
          </div>
        </div>
        <NeumorphButton variant="primary" onClick={openAddModal}>
          <Plus size={16} className="mr-2" /> Add New Item
        </NeumorphButton>
      </div>

      {/* Toolbar */}
      <NeumorphCard className="p-4 flex gap-4">
        <NeumorphInput icon={<Search size={16} />} placeholder={roomConfig.searchPlaceholder} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1" />
        
        {/* NEW: Archive Toggle Button */}
        <NeumorphButton 
          variant={showArchived ? "primary" : "outline"} 
          className="px-4 transition-all" 
          onClick={() => setShowArchived(!showArchived)}
        >
          <Archive size={16} className={showArchived ? "mr-2" : ""} />
          {showArchived && "Viewing Archive"}
        </NeumorphButton>

        <NeumorphButton variant="outline" className="px-4"><Filter size={16} /></NeumorphButton>
      </NeumorphCard>

      {/* Dynamic Data Table */}
      <NeumorphCard className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-10"><div className="neu-spinner" /></div>
        ) : filteredAndSortedItems.length === 0 ? (
          <div className="p-10 text-center text-muted">
            {showArchived ? "Archive bin is empty." : "No items found matching your criteria."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-black/5 text-xs uppercase text-muted font-bold">
                <tr>
                  {roomConfig.columns.map(col => <th key={col} className="px-6 py-4 whitespace-nowrap">{col}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filteredAndSortedItems.map(item => (
                  <tr key={`${item.kind}-${item.item_id}`} className={`hover:bg-black/[0.02] transition-colors ${item.status === 'archived' ? 'opacity-70 bg-gray-50' : ''}`}>
                    <td className="px-6 py-4 font-mono font-medium text-xs">{item.barcode}</td>
                    
                    {Number(user?.room_id) === 3 ? (
                      <>
                        <td className="px-6 py-4 font-bold text-gray-800">{item.name}</td>
                        <td className="px-6 py-4 text-xs">{item.type_metadata?.authors || '—'}</td>
                        <td className="px-6 py-4 font-mono text-xs">{item.type_metadata?.year || '—'}</td>
                      </>
                    ) : Number(user?.room_id) === 2 ? (
                      <>
                        <td className="px-6 py-4 font-bold text-gray-800">{item.name}</td>
                        <td className="px-6 py-4 capitalize text-xs">{item.kind}</td>
                        <td className="px-6 py-4 font-mono text-xs">
                          {item.kind === 'consumable' ? <span className="text-blue-600 font-bold">{item.quantity_available} / {item.quantity_total} Qty</span> : item.item_metadata?.serial_number || '—'}
                        </td>
                        <td className="px-6 py-4 uppercase text-xs font-bold text-blue-600">{item.item_metadata?.analog_digital || '—'}</td>
                      </>
                    ) : Number(user?.room_id) === 1 ? (
                      <>
                        <td className="px-6 py-4 font-bold text-gray-800">{item.name}</td>
                        <td className="px-6 py-4 capitalize text-xs">{item.kind}</td>
                        <td className="px-6 py-4 font-mono text-xs">
                          {item.kind === 'consumable' ? <span className="text-blue-600 font-bold">{item.quantity_available} / {item.quantity_total} Qty</span> : item.item_metadata?.serial_number || '—'}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 font-bold text-gray-800">{item.name}</td>
                        <td className="px-6 py-4">{item.room_code || 'Global'}</td>
                      </>
                    )}

                    {/* Condition Column */}
                    <td className="px-6 py-4">
                      {item.kind === 'consumable' ? <span className="text-xs text-muted">—</span> : (
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${getConditionColor(item.item_metadata?.condition || 'Good')}`}>
                          {item.item_metadata?.condition || 'Good'}
                        </span>
                      )}
                    </td>

                    {/* Status Column */}
                    <td className="px-6 py-4">
                      {item.kind === 'consumable' ? (
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${item.quantity_available > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {item.quantity_available > 0 ? 'In Stock' : 'Out of Stock'}
                        </span>
                      ) : (
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${getStatusColor(item.status)}`}>
                          {item.status}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 flex items-center gap-1">
                      <button onClick={() => openEditModal(item)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Edit / Restore">
                        <Edit2 size={16} />
                      </button>
                      {!showArchived && (
                        <button onClick={() => handleDelete(item.item_id, item.kind)} className="p-2 text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Move to Archive">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </NeumorphCard>

      {/* Dynamic Add / Edit Modal */}
      <NeumorphModal open={showModal} onClose={() => setShowModal(false)} title={isEdit ? "Edit Inventory Item" : "Add New Inventory Item"}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NeumorphInput label="Barcode (Required)" value={form.barcode} disabled={isEdit} onChange={e => setForm({...form, barcode: e.target.value})} placeholder="Scan or type..." />
            
            {/* Borrowable Status Override (Only for physical items) */}
            {form.type === 'borrowable' && (
              <div>
                <label className="text-xs font-bold text-muted uppercase mb-1 block">Borrowing Status</label>
                <select className="neu-input w-full" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                  <option value="available">Available (Visible to Students)</option>
                  <option value="unavailable">Unavailable (Hidden)</option>
                  <option value="reserved">Reserved (Hidden)</option>
                  <option value="archived">Archived (Bin)</option>
                  {form.status === 'borrowed' && <option value="borrowed" disabled>Currently Borrowed</option>}
                </select>
              </div>
            )}
          </div>

          {Number(user?.room_id) === 3 ? (
            <>
              <NeumorphInput label="Thesis Title" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NeumorphInput label="Authors (Comma separated)" value={form.authors} onChange={e => setForm({...form, authors: e.target.value})} />
                <NeumorphInput label="Year Published" type="number" value={form.year} onChange={e => setForm({...form, year: e.target.value})} />
              </div>
            </>
          ) : (
            <>
              <NeumorphInput label="Item Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-muted uppercase mb-1 block">Item Type</label>
                  <select className="neu-input w-full" disabled={isEdit} value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                    <option value="borrowable">Borrowable Equipment</option>
                    <option value="consumable">Consumable Material (Batch)</option>
                  </select>
                </div>

                {form.type === 'consumable' ? (
                  <div className="flex gap-2">
                    <NeumorphInput label="Total Qty" type="number" min="1" value={form.quantity_total} onChange={e => setForm({...form, quantity_total: e.target.value})} />
                    {isEdit && <NeumorphInput label="Available Qty" type="number" min="0" value={form.quantity_available} onChange={e => setForm({...form, quantity_available: e.target.value})} />}
                  </div>
                ) : (
                  <NeumorphInput label="Serial Number (Optional)" value={form.serial_number} onChange={e => setForm({...form, serial_number: e.target.value})} />
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {form.type === 'borrowable' && (
                  <div>
                    <label className="text-xs font-bold text-muted uppercase mb-1 block">Physical Condition</label>
                    <select className="neu-input w-full" value={form.condition} onChange={e => setForm({...form, condition: e.target.value})}>
                      <option value="Good">Good</option>
                      <option value="Damaged">Damaged (Needs repair)</option>
                      <option value="Defective">Defective (Unusable)</option>
                    </select>
                  </div>
                )}

                {Number(user?.room_id) === 2 && form.type === 'borrowable' && (
                  <div>
                    <label className="text-xs font-bold text-muted uppercase mb-1 block">Signal Type</label>
                    <select className="neu-input w-full" value={form.analog_digital} onChange={e => setForm({...form, analog_digital: e.target.value})}>
                      <option value="analog">Analog</option>
                      <option value="digital">Digital</option>
                      <option value="n/a">Not Applicable</option>
                    </select>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="pt-4 flex gap-2">
            <NeumorphButton variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</NeumorphButton>
            <NeumorphButton variant="primary" className="flex-1" onClick={handleSaveItem} loading={saving}>{isEdit ? 'Save Changes' : 'Add Item'}</NeumorphButton>
          </div>
        </div>
      </NeumorphModal>
    </div>
  );
}