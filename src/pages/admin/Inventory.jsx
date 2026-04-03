// src/pages/admin/Inventory.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Search, Plus, Filter, Package, BookOpen, Cpu, Settings, Trash2, Edit2, Archive, Layers, Lock, ChevronDown, ChevronRight, Folder, FlaskConical, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosClient.js';
import NeumorphCard from '../../components/ui/NeumorphCard.jsx';
import NeumorphButton from '../../components/ui/NeumorphButton.jsx';
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';
import NeumorphModal from '../../components/ui/NeumorphModal.jsx';
import { listInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem } from '../../api/inventoryAPI.js';

const parseMeta = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
};
const str = (v) => String(v ?? '');

export default function Inventory() {
  const { user } = useAuth();
  const roomId = Number(user?.room_id);

  const [items, setItems]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [searchQuery, setSearchQuery]   = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showModal, setShowModal]       = useState(false);
  const [isEdit, setIsEdit]             = useState(false);
  const [editId, setEditId]             = useState(null);
  const [saving, setSaving]             = useState(false);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  
  const [isRoomLocked, setIsRoomLocked] = useState(false);
  const [isLockedToFolder, setIsLockedToFolder] = useState(false); // New state to lock fields when adding to folder

  const defaultForm = {
    barcode:            '',
    name:               '',
    type:               'borrowable',
    inventory_mode:     'unit',     
    quantity_total:     1,
    quantity_available: 1,
    qty_total:          1,          
    qty_available:      1,          
    serial_number:      '',
    analog_digital:     'analog',
    authors:            '',
    year:               new Date().getFullYear().toString(),
    condition:          'Good',
    status:             'available',
  };
  const [form, setForm] = useState(defaultForm);

  const roomConfig = useMemo(() => {
    switch (roomId) {
      case 1: return { title: 'Archi-CE Inventory', icon: <Settings className="text-primary" size={24} />, searchPlaceholder: 'Search by folder name, serial, or barcode...' };
      case 2: return { title: 'ECE-CPE Inventory', icon: <Cpu className="text-blue-500" size={24} />, searchPlaceholder: 'Search by folder name, serial, or barcode...' };
      case 3: return { title: 'Thesis Archive', icon: <BookOpen className="text-amber-600" size={24} />, searchPlaceholder: 'Search by authors, year, title, or barcode...' };
      default: return { title: 'Global Inventory', icon: <Package className="text-primary" size={24} />, searchPlaceholder: 'Search inventory...' };
    }
  }, [roomId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [roomsRes, invRes] = await Promise.all([
        api.get('/admin/rooms').catch(() => ({ data: { data: [] } })),
        listInventory()
      ]);

      const myRoom = (roomsRes.data?.data || roomsRes.data || []).find(r => r.id === roomId);
      if (myRoom) setIsRoomLocked(!myRoom.is_available);

      const data = invRes.data?.data || {};
      const borrowables   = (data.items || []).map(i => ({ ...i, kind: 'borrowable', inventory_mode: 'unit' }));
      const consumables   = (data.consumables || []).map(i => ({ ...i, kind: 'consumable', inventory_mode: 'unit' }));
      const quantityItems = (data.quantityItems || []).map(i => ({ ...i, kind: 'quantity', inventory_mode: 'quantity' }));
      
      setItems([...borrowables, ...consumables, ...quantityItems]);
    } catch { toast.error('Failed to load inventory'); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadData(); }, []);

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // ── GROUPING LOGIC (The "Folder" Architecture) ──
  const groupedAndFilteredFolders = useMemo(() => {
    // 1. Group by inventory_type_id
    const groups = items.reduce((acc, curr) => {
      const tid = curr.inventory_type_id;
      if (!acc[tid]) {
        acc[tid] = {
          type_id: tid,
          name: curr.name,
          inventory_mode: curr.inventory_mode,
          kind: curr.kind,
          type_metadata: parseMeta(curr.type_metadata),
          units: [],
          total_qty: 0,
          available_qty: 0,
        };
      }
      acc[tid].units.push(curr);
      
      // Tally Quantities
      if (curr.inventory_mode === 'quantity') {
        acc[tid].total_qty += (curr.qty_total || 1);
        acc[tid].available_qty += (curr.qty_available || 0);
      } else if (curr.kind === 'consumable') {
        acc[tid].total_qty += (curr.quantity_total || 1);
        acc[tid].available_qty += (curr.quantity_available || 0);
      } else {
        acc[tid].total_qty += 1;
        acc[tid].available_qty += (curr.status === 'available' ? 1 : 0);
      }
      return acc;
    }, {});

    // 2. Filter & Search
    let result = Object.values(groups).map(folder => {
      // Filter out archived units from the folder unless 'showArchived' is active
      const validUnits = folder.units.filter(u => showArchived ? u.status === 'archived' : u.status !== 'archived');
      return { ...folder, units: validUnits };
    }).filter(folder => {
      // Hide empty folders
      if (folder.units.length === 0) return false;
      
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;

      // Search matches Folder Name OR specific Barcode/Serial inside it
      if (folder.name.toLowerCase().includes(q)) return true;
      if (roomId === 3) {
        const authors = str(folder.type_metadata.authors).toLowerCase();
        const year    = str(folder.type_metadata.year).toLowerCase();
        if (authors.includes(q) || year.includes(q)) return true;
      }
      
      return folder.units.some(u => {
        const itemMeta = parseMeta(u.item_metadata);
        return str(u.barcode).toLowerCase().includes(q) || str(itemMeta.serial_number).toLowerCase().includes(q);
      });
    });

    // Sort alphabetically
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [items, searchQuery, showArchived, roomId]);


  // ── MODAL ACTIONS ──
  const openAddModal = () => {
    if (isRoomLocked) return;
    setForm(defaultForm);
    setIsEdit(false);
    setEditId(null);
    setIsLockedToFolder(false); // Allow full editing
    setShowModal(true);
  };

  // Shortcut to add a new physical unit inside an existing Folder
  const openAddToFolderModal = (folder) => {
    if (isRoomLocked) return;
    setForm({
      ...defaultForm,
      name: folder.name,
      inventory_mode: folder.inventory_mode,
      type: folder.kind === 'consumable' ? 'consumable' : 'borrowable',
      authors: str(folder.type_metadata.authors),
      year: str(folder.type_metadata.year) || new Date().getFullYear().toString(),
    });
    setIsEdit(false);
    setEditId(null);
    setIsLockedToFolder(true); // Lock name/mode so it groups correctly in the DB
    setShowModal(true);
  };

  const openEditModal = useCallback((item) => {
    if (isRoomLocked) return;
    try {
      const itemMeta = parseMeta(item.item_metadata);
      const typeMeta = parseMeta(item.type_metadata);
      setForm({
        barcode:            str(item.barcode),
        name:               str(item.name),
        type:               item.kind === 'consumable' ? 'consumable' : 'borrowable',
        inventory_mode:     item.inventory_mode || 'unit',
        quantity_total:     item.quantity_total  ?? 1,
        quantity_available: item.quantity_available ?? 0,
        qty_total:          item.qty_total   ?? 1,
        qty_available:      item.qty_available ?? 0,
        serial_number:      str(itemMeta.serial_number),
        analog_digital:     itemMeta.analog_digital  || 'analog',
        authors:            str(typeMeta.authors),
        year:               str(typeMeta.year) || new Date().getFullYear().toString(),
        condition:          itemMeta.condition  || 'Good',
        status:             item.status         || 'available',
      });
      setEditId(item.item_id ?? item.id);
      setIsEdit(true);
      setIsLockedToFolder(false);
      setShowModal(true);
    } catch (err) { toast.error('Could not open edit form.'); }
  }, [isRoomLocked]);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setTimeout(() => { setForm(defaultForm); setIsEdit(false); setEditId(null); setIsLockedToFolder(false); }, 200);
  }, []);

  const handleSaveItem = async () => {
    if (isRoomLocked) return;
    if (!form.barcode.trim() || !form.name.trim()) return toast.error('Barcode and Name are required');
    setSaving(true);
    try {
      const isThesis = roomId === 3;
      const itemType = isThesis ? 'borrowable' : form.type;

      const itemMeta = { condition: form.condition };
      const typeMeta = {};
      
      if (roomId === 1 || roomId === 2) itemMeta.serial_number = form.serial_number;
      if (roomId === 2) itemMeta.analog_digital = form.analog_digital;
      if (isThesis) { typeMeta.authors = form.authors; typeMeta.year = form.year; }

      const payload = {
        barcode:        form.barcode.trim(),
        name:           form.name.trim(),
        type:           itemType,
        room_id:        user.room_id,
        status:         form.status,
        type_metadata:  typeMeta,
        item_metadata:  itemMeta,
        inventory_mode: form.inventory_mode,
      };

      if (form.inventory_mode === 'quantity') {
        payload.quantity_total = parseInt(form.qty_total, 10) || 1;
        if (isEdit) {
          payload.qty_total     = parseInt(form.qty_total, 10) || 1;
          payload.qty_available = parseInt(form.qty_available, 10);
        }
      } else if (itemType === 'consumable') {
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
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to save item'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, kind, inventory_mode) => {
    if (isRoomLocked) return;
    if (!window.confirm('Move this item to the Archive Bin?')) return;
    try {
      await deleteInventoryItem(id, kind, inventory_mode);
      toast.success('Item archived successfully');
      loadData();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to archive item'); }
  };

  const conditionColor = (cond) => {
    switch (cond) {
      case 'Damaged':   return 'text-amber-600 bg-amber-50 border border-amber-200';
      case 'Defective': return 'text-red-600 bg-red-50 border border-red-200';
      default:          return 'text-emerald-600 bg-emerald-50 border border-emerald-200';
    }
  };
  
  const statusColor = (status) => {
    switch (status) {
      case 'available':    return 'bg-green-100 text-green-700';
      case 'borrowed':     return 'bg-blue-100 text-blue-700';
      case 'unavailable':  return 'bg-red-100 text-red-700';
      case 'reserved':     return 'bg-purple-100 text-purple-700';
      case 'out_of_stock': return 'bg-red-100 text-red-700';
      case 'archived':     return 'bg-gray-800 text-gray-200';
      default:             return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      
      {isRoomLocked && (
        <div className="bg-red-50 border-2 border-red-200 p-4 rounded-2xl flex items-center gap-3 animate-fade-in">
          <div className="bg-red-100 text-red-600 p-2 rounded-xl flex-shrink-0"><Lock size={20} /></div>
          <div>
            <h3 className="text-sm font-bold text-red-800">Room is Unavailable</h3>
            <p className="text-xs text-red-700 mt-0.5">Inventory modifications are locked. You can view items, but adding, editing, or archiving is temporarily disabled.</p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-white rounded-2xl shadow-sm border border-black/5">{roomConfig.icon}</div>
          <div>
            <h1 className="text-2xl font-black text-gray-800 tracking-tight">{roomConfig.title}</h1>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-0.5">Manage Category Folders & Units</p>
          </div>
        </div>
        <NeumorphButton variant="primary" onClick={openAddModal} disabled={isRoomLocked}>
          {isRoomLocked ? <Lock size={16} className="mr-2" /> : <Plus size={16} className="mr-2" />} Create New Category
        </NeumorphButton>
      </div>

      <NeumorphCard className="p-4 flex gap-4">
        <NeumorphInput icon={<Search size={16} />} placeholder={roomConfig.searchPlaceholder} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1" />
        <NeumorphButton variant={showArchived ? 'primary' : 'outline'} className="px-4" onClick={() => setShowArchived(v => !v)}>
          <Archive size={16} className={showArchived ? 'mr-2' : ''} />{showArchived && 'Viewing Archive'}
        </NeumorphButton>
      </NeumorphCard>

      {/* ── FOLDER VIEW LIST ── */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-10"><div className="neu-spinner" /></div>
        ) : groupedAndFilteredFolders.length === 0 ? (
          <NeumorphCard className="p-10 text-center text-muted font-bold">{showArchived ? 'Archive bin is empty.' : 'No inventory folders found matching your criteria.'}</NeumorphCard>
        ) : (
          groupedAndFilteredFolders.map(folder => {
            const isExpanded = expandedFolders.has(folder.type_id);
            const isQtyMode  = folder.inventory_mode === 'quantity';
            
            return (
              <div key={folder.type_id} className="bg-white rounded-2xl border border-black/10 shadow-sm overflow-hidden transition-all">
                
                {/* ── LEVEL 1: FOLDER HEADER ── */}
                <div 
                  onClick={() => toggleFolder(folder.type_id)}
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      {isExpanded ? <Folder size={20} className="fill-primary/20" /> : <Folder size={20} />}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        {folder.name}
                        {roomId === 3 && folder.type_metadata?.year && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{folder.type_metadata.year}</span>}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        {isQtyMode ? (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase bg-violet-100 text-violet-700 inline-flex items-center gap-0.5"><Layers size={9}/> Quantity Mode</span>
                        ) : folder.kind === 'consumable' ? (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase bg-amber-100 text-amber-700">Consumable</span>
                        ) : (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase bg-blue-100 text-blue-700">Unit Tracking</span>
                        )}
                        {roomId === 3 && folder.type_metadata?.authors && (
                          <span className="text-[10px] text-gray-500 font-medium truncate max-w-[200px]">{folder.type_metadata.authors}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Available / Total</p>
                      <p className="font-black text-lg text-gray-800 leading-none mt-0.5">
                        <span className={folder.available_qty > 0 ? "text-emerald-600" : "text-red-500"}>{folder.available_qty}</span> 
                        <span className="text-gray-300 mx-1">/</span> 
                        {folder.total_qty}
                      </p>
                    </div>
                    <div className="text-gray-400">
                      {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                  </div>
                </div>

                {/* ── LEVEL 2: INSIDE THE FOLDER (UNITS) ── */}
                {isExpanded && (
                  <div className="bg-gray-50/80 border-t border-black/5 p-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Physical Units inside this folder ({folder.units.length})</span>
                      {!showArchived && (
                        <button disabled={isRoomLocked} onClick={() => openAddToFolderModal(folder)} className="text-[10px] font-black bg-white border border-gray-200 hover:border-primary hover:text-primary px-3 py-1.5 rounded-lg shadow-sm transition-all flex items-center gap-1 disabled:opacity-50 text-gray-600">
                          <Plus size={12} /> Add Unit to Folder
                        </button>
                      )}
                    </div>
                    
                    <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-100/50 border-b border-black/5 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                          <tr>
                            <th className="px-4 py-2">Barcode</th>
                            {!isQtyMode && folder.kind !== 'consumable' && <th className="px-4 py-2">{roomId === 3 ? 'Thesis Title & Authors' : 'Serial / Signal'}</th>}
                            <th className="px-4 py-2">Condition</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {folder.units.map(unit => {
                            const itemMeta = parseMeta(unit.item_metadata);
                            return (
                              <tr key={`${unit.kind}-${unit.item_id ?? unit.id}`} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 font-mono font-bold text-primary">{str(unit.barcode)}</td>
                                
                                {!isQtyMode && folder.kind !== 'consumable' && (
  <td className="px-4 py-3">
    {roomId === 3 ? (
      <div className="max-w-sm">
        <span className="block font-bold text-gray-800 line-clamp-1" title={itemMeta.title}>{itemMeta.title || '—'}</span>
        <span className="block text-[9px] text-gray-500 line-clamp-1 mt-0.5" title={itemMeta.authors}>{itemMeta.authors}</span>
        <span className="block text-[9px] text-blue-500 font-mono mt-0.5">{itemMeta.code}</span>
      </div>
    ) : (
      <>
        <span className="font-mono text-gray-700">{itemMeta.serial_number || '—'}</span>
        {roomId === 2 && itemMeta.analog_digital && itemMeta.analog_digital !== 'n/a' && (
          <span className="block text-[9px] font-black text-blue-500 uppercase mt-0.5">{itemMeta.analog_digital}</span>
        )}
      </>
    )}
  </td>
)}

                                <td className="px-4 py-3">
                                  {folder.kind === 'consumable' || isQtyMode ? <span className="text-muted">—</span> : (
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${conditionColor(itemMeta.condition)}`}>
                                      {itemMeta.condition || 'Good'}
                                    </span>
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  {isQtyMode ? (
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${unit.qty_available > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                      {unit.qty_available > 0 ? 'In Stock' : 'Out of Stock'}
                                    </span>
                                  ) : folder.kind === 'consumable' ? (
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${unit.quantity_available > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                      {unit.quantity_available > 0 ? 'In Stock' : 'Out of Stock'}
                                    </span>
                                  ) : (
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${statusColor(unit.status)}`}>{unit.status}</span>
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1">
                                    <button disabled={isRoomLocked} onClick={(e) => { e.stopPropagation(); openEditModal(unit); }} className={`p-1.5 rounded-lg transition-colors ${isRoomLocked ? 'text-gray-300 cursor-not-allowed' : 'text-blue-500 hover:bg-blue-50'}`} title="Edit">
                                      {isRoomLocked ? <Lock size={14} /> : <Edit2 size={14} />}
                                    </button>
                                    {!showArchived && (
                                      <button disabled={isRoomLocked} onClick={(e) => { e.stopPropagation(); handleDelete(unit.item_id ?? unit.id, unit.kind, unit.inventory_mode); }} className={`p-1.5 rounded-lg transition-colors ${isRoomLocked ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`} title="Move to Archive">
                                        {isRoomLocked ? <Lock size={14} /> : <Trash2 size={14} />}
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
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── ADD / EDIT MODAL ── */}
      <NeumorphModal open={showModal} onClose={closeModal} title={isEdit ? 'Edit Inventory Item' : isLockedToFolder ? `Add Unit to ${form.name}` : 'Create New Category & Item'}>
        <div className="space-y-6">
          
          {/* 1. THE TRACKING SELECTOR (Only show if creating completely new category) */}
          {!isEdit && !isLockedToFolder && roomId !== 3 && (
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">1. What kind of item is this?</label>
              <div className="grid grid-cols-3 gap-3">
                <button type="button" onClick={() => setForm({ ...form, inventory_mode: 'unit', type: 'borrowable' })}
                  className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-2 ${form.inventory_mode === 'unit' && form.type === 'borrowable' ? 'border-primary bg-primary/5 text-primary shadow-sm ring-2 ring-primary/20' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-primary/50'}`}>
                  <Tag size={16} />
                  <div>
                    <span className="block text-xs font-black">Unique Unit</span>
                    <span className="block text-[9px] font-medium opacity-70 mt-0.5 leading-tight">Serialized item (e.g. Laptops, Meters)</span>
                  </div>
                </button>

                <button type="button" onClick={() => setForm({ ...form, inventory_mode: 'quantity', type: 'borrowable' })}
                  className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-2 ${form.inventory_mode === 'quantity' ? 'border-violet-500 bg-violet-50 text-violet-700 shadow-sm ring-2 ring-violet-500/20' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-violet-300'}`}>
                  <Layers size={16} />
                  <div>
                    <span className="block text-xs font-black">Bulk / Batch</span>
                    <span className="block text-[9px] font-medium opacity-70 mt-0.5 leading-tight">Identical parts (e.g. Resistors)</span>
                  </div>
                </button>

                <button type="button" onClick={() => setForm({ ...form, inventory_mode: 'unit', type: 'consumable' })}
                  className={`p-3 rounded-xl border-2 text-left transition-all flex flex-col gap-2 ${form.type === 'consumable' ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm ring-2 ring-amber-500/20' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-amber-300'}`}>
                  <FlaskConical size={16} />
                  <div>
                    <span className="block text-xs font-black">Consumable</span>
                    <span className="block text-[9px] font-medium opacity-70 mt-0.5 leading-tight">Depletable supplies (e.g. Wires, Lead)</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* 2. THE DYNAMIC FORM FIELDS */}
          <div className={`space-y-4 ${!isEdit && !isLockedToFolder && roomId !== 3 ? 'pt-4 border-t border-black/5' : ''}`}>
            
            {roomId === 3 ? (
              /* ── THESIS ARCHIVE FIELDS ── */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NeumorphInput label="Thesis Title (Folder Name)" value={form.name} disabled={isLockedToFolder} onChange={e => setForm({ ...form, name: e.target.value })} />
                <NeumorphInput label="Barcode (Required)" value={form.barcode} disabled={isEdit} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="Scan or type barcode..." />
                <NeumorphInput label="Authors (comma-separated)" value={form.authors} disabled={isLockedToFolder} onChange={e => setForm({ ...form, authors: e.target.value })} />
                <NeumorphInput label="Year Published" type="number" value={form.year} disabled={isLockedToFolder} onChange={e => setForm({ ...form, year: e.target.value })} />
              </div>
            ) : (
              /* ── STANDARD INVENTORY FIELDS ── */
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <NeumorphInput label="Category / Item Name" value={form.name} disabled={isLockedToFolder} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Digital Multimeter" />
                  <NeumorphInput label="Barcode (Required)" value={form.barcode} disabled={isEdit} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="Scan or type barcode..." />
                </div>

                {/* Fields for Unique Units */}
                {form.inventory_mode === 'unit' && form.type === 'borrowable' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <NeumorphInput label="Serial Number" value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} placeholder="Optional" />
                    
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Condition</label>
                      <select className="neu-input w-full text-sm" value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}>
                        <option value="Good">Good</option>
                        <option value="Damaged">Damaged (Needs repair)</option>
                        <option value="Defective">Defective (Unusable)</option>
                      </select>
                    </div>

                    {roomId === 2 ? (
                      <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Signal Type</label>
                        <select className="neu-input w-full text-sm" value={form.analog_digital} onChange={e => setForm({ ...form, analog_digital: e.target.value })}>
                          <option value="analog">Analog</option>
                          <option value="digital">Digital</option>
                          <option value="n/a">Not Applicable</option>
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Status</label>
                        <select className="neu-input w-full text-sm" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                          <option value="available">Available</option>
                          <option value="unavailable">Unavailable (Hidden)</option>
                          <option value="archived">Archived (Bin)</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Fields for Bulk Items */}
                {form.inventory_mode === 'quantity' && (
                  <div className="grid grid-cols-2 gap-4 bg-violet-50/50 p-4 rounded-xl border border-violet-100">
                    <NeumorphInput label="Total Pieces in Batch" type="number" min="1" value={form.qty_total} onChange={e => setForm({ ...form, qty_total: e.target.value })} />
                    {isEdit && <NeumorphInput label="Currently Available" type="number" min="0" value={form.qty_available} onChange={e => setForm({ ...form, qty_available: e.target.value })} />}
                  </div>
                )}

                {/* Fields for Consumables */}
                {form.type === 'consumable' && (
                  <div className="grid grid-cols-2 gap-4 bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                    <NeumorphInput label="Total Starting Quantity" type="number" min="1" value={form.quantity_total} onChange={e => setForm({ ...form, quantity_total: e.target.value })} />
                    {isEdit && <NeumorphInput label="Remaining Quantity" type="number" min="0" value={form.quantity_available} onChange={e => setForm({ ...form, quantity_available: e.target.value })} />}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 3. BUTTONS */}
          <div className="pt-2 flex gap-3">
            <NeumorphButton variant="outline" className="flex-1 font-bold py-3" onClick={closeModal}>Cancel</NeumorphButton>
            <NeumorphButton variant="primary" className="flex-[2] font-black shadow-md shadow-primary/30 py-3" onClick={handleSaveItem} loading={saving}>
              {isEdit ? 'Save Changes' : isLockedToFolder ? `Add Unit to ${form.name}` : 'Create Category & Item'}
            </NeumorphButton>
          </div>
        </div>
      </NeumorphModal>
    </div>
  );
}