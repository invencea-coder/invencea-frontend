import React, { useState, useEffect, useCallback } from 'react';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { Upload, Trash2, Users, GraduationCap, Loader2, Search, Plus, AlertTriangle } from 'lucide-react';
import api from '../../api/axiosClient';
import NeumorphCard from '../../components/ui/NeumorphCard';
import NeumorphButton from '../../components/ui/NeumorphButton';
import NeumorphInput from '../../components/ui/NeumorphInput';
import NeumorphModal from '../../components/ui/NeumorphModal';

export default function ManagerDirectory() {
  const [activeTab, setActiveTab] = useState('students'); // 'students' | 'faculty'
  const [data, setData] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Search and Add Modal states
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addingSingle, setAddingSingle] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', identifier: '' });

  // NEW: Reset PIN Modal states
  const [resetModalData, setResetModalData] = useState(null); // { id, name }
  const [resettingPin, setResettingPin] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // ⚡ THE FIX: Changed '/manager/users' to '/manager/faculty'
      const endpoint = activeTab === 'students' ? '/manager/students' : '/manager/faculty';
      const res = await api.get(endpoint);
      
      const fetchedData = res.data?.data || [];
      setData(fetchedData);
      setSelectedIds([]); 
      setSearchQuery(''); // Clear search when switching tabs or reloading
    } catch (err) {
      toast.error(`Failed to load ${activeTab}`);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter Data based on Search Query
  const filteredData = data.filter(item => {
    const query = searchQuery.toLowerCase();
    if (activeTab === 'students') {
      return item.full_name?.toLowerCase().includes(query) || item.student_id?.toLowerCase().includes(query);
    } else {
      return item.name?.toLowerCase().includes(query) || item.email?.toLowerCase().includes(query);
    }
  });

  // Handle CSV Upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const parsedData = results.data;
        if (parsedData.length === 0) return toast.error("CSV file is empty.");

        const firstRow = parsedData[0];
        if (activeTab === 'students' && (!firstRow.full_name || !firstRow.student_id)) {
          return toast.error("CSV must have 'full_name' and 'student_id' columns.");
        }
        if (activeTab === 'faculty' && (!firstRow.name || !firstRow.email)) {
          return toast.error("CSV must have 'name' and 'email' columns.");
        }

        setUploading(true);
        try {
          const endpoint = activeTab === 'students' ? '/manager/students/bulk' : '/manager/faculty/bulk';
          const payload = activeTab === 'students' ? { students: parsedData } : { faculty: parsedData };
          
          const res = await api.post(endpoint, payload);
          toast.success(res.data.message || 'Import successful');
          loadData();
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to import data');
        } finally {
          setUploading(false);
          e.target.value = null; 
        }
      },
      error: () => toast.error("Error parsing CSV file."),
    });
  };

  // Handle Manual Single Add
  const handleSingleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.identifier.trim()) {
      return toast.error("Please fill in all fields.");
    }

    setAddingSingle(true);
    try {
      const endpoint = activeTab === 'students' ? '/manager/students/bulk' : '/manager/faculty/bulk';
      const payload = activeTab === 'students' 
        ? { students: [{ full_name: addForm.name.trim(), student_id: addForm.identifier.trim() }] }
        : { faculty: [{ name: addForm.name.trim(), email: addForm.identifier.trim() }] };
      
      const res = await api.post(endpoint, payload);
      toast.success(res.data.message || 'Added successfully');
      setAddForm({ name: '', identifier: '' });
      setIsAddModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add user');
    } finally {
      setAddingSingle(false);
    }
  };

  // Handle PIN Reset 
  const handleResetPinClick = (id, name) => {
    setResetModalData({ id, name });
  };

  const confirmResetPin = async () => {
    if (!resetModalData) return;
    setResettingPin(true);
    try {
      await api.put(`/manager/students/${resetModalData.id}/reset-pin`);
      toast.success(`PIN for ${resetModalData.name} has been reset to 1234.`);
      setResetModalData(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset PIN.');
    } finally {
      setResettingPin(false);
    }
  };

  // Handle Checkbox Selection
  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredData.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredData.map(d => d.id));
    }
  };

  // Handle Bulk Delete
  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} records?`)) return;

    try {
      const endpoint = activeTab === 'students' ? '/manager/students/bulk' : '/manager/faculty/bulk';
      await api.delete(endpoint, { data: { ids: selectedIds } });
      toast.success('Records deleted successfully');
      loadData();
    } catch (err) {
      toast.error('Failed to delete records');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary">System Directory</h1>
          <p className="text-sm text-muted mt-1">Manage Students and Faculty rosters manually or via CSV.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-black/10 pb-2">
        <button 
          className={`flex items-center gap-2 px-4 py-2 font-bold rounded-t-lg transition-colors ${activeTab === 'students' ? 'text-primary border-b-2 border-primary' : 'text-muted hover:text-primary'}`}
          onClick={() => setActiveTab('students')}
        >
          <GraduationCap size={18} /> Students
        </button>
        <button 
          className={`flex items-center gap-2 px-4 py-2 font-bold rounded-t-lg transition-colors ${activeTab === 'faculty' ? 'text-primary border-b-2 border-primary' : 'text-muted hover:text-primary'}`}
          onClick={() => setActiveTab('faculty')}
        >
          <Users size={18} /> Faculty Members
        </button>
      </div>

      {/* Toolbar: Search, Add Single, Upload, Delete */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface p-4 rounded-xl shadow-sm border border-black/5">
        
        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input 
            type="text" 
            placeholder={`Search ${activeTab}...`} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="neu-input w-full pl-9 py-2 text-sm bg-white"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {selectedIds.length > 0 ? (
            <NeumorphButton variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 flex items-center gap-2" onClick={handleBulkDelete}>
              <Trash2 size={16} /> Delete Selected ({selectedIds.length})
            </NeumorphButton>
          ) : (
            <>
              <NeumorphButton variant="outline" className="flex items-center gap-2" onClick={() => setIsAddModalOpen(true)}>
                <Plus size={16} /> Add Single {activeTab === 'students' ? 'Student' : 'Faculty'}
              </NeumorphButton>

              <label className="relative cursor-pointer">
                <NeumorphButton variant="primary" as="span" className="flex items-center gap-2 pointer-events-none" loading={uploading}>
                  <Upload size={16} /> Bulk Upload CSV
                </NeumorphButton>
                <input type="file" accept=".csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileUpload} />
              </label>
            </>
          )}
        </div>
      </div>

      {/* Data Table */}
      <NeumorphCard className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-primary" size={32}/></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/[0.02] text-xs uppercase tracking-wider text-muted font-bold border-b">
                <tr>
                  <th className="px-6 py-4 w-12">
                    <input type="checkbox" checked={selectedIds.length === filteredData.length && filteredData.length > 0} onChange={toggleSelectAll} className="rounded border-gray-300"/>
                  </th>
                  <th className="px-6 py-4">{activeTab === 'students' ? 'Full Name' : 'Name'}</th>
                  <th className="px-6 py-4">{activeTab === 'students' ? 'Student ID' : 'Email Address'}</th>
                  
                  {/* Action Header */}
                  {activeTab === 'students' && (
                    <th className="px-6 py-4 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filteredData.length === 0 ? (
                  <tr><td colSpan={activeTab === 'students' ? "4" : "3"} className="px-6 py-8 text-center text-muted">No records found.</td></tr>
                ) : (
                  filteredData.map((row) => (
                    <tr key={row.id} className="hover:bg-black/[0.01] transition-colors">
                      <td className="px-6 py-4">
                        <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleSelect(row.id)} className="rounded border-gray-300"/>
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-800">{activeTab === 'students' ? row.full_name : row.name}</td>
                      <td className="px-6 py-4 text-gray-600 font-mono text-xs">{activeTab === 'students' ? row.student_id : row.email}</td>
                      
                      {/* Action column for resetting PIN */}
                      {activeTab === 'students' && (
                        <td className="px-6 py-4 text-right">
                            <NeumorphButton 
                              variant="outline" 
                              size="sm" 
                              className="text-amber-600 border-amber-200 hover:bg-amber-50 text-[10px] py-1.5"
                              onClick={() => handleResetPinClick(row.id, row.full_name)}
                            >
                              Reset PIN
                            </NeumorphButton>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </NeumorphCard>

      {/* Manual Add Modal */}
      <NeumorphModal open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title={`Add New ${activeTab === 'students' ? 'Student' : 'Faculty Member'}`}>
        <form onSubmit={handleSingleAdd} className="space-y-4 p-2 mt-2">
          <NeumorphInput 
            label={activeTab === 'students' ? 'Full Name' : 'Name'} 
            placeholder={activeTab === 'students' ? 'e.g. Juan D. Dela Cruz' : 'e.g. Engr. Maria Santos'} 
            value={addForm.name} 
            onChange={e => setAddForm({...addForm, name: e.target.value})} 
            autoFocus
          />
          <NeumorphInput 
            label={activeTab === 'students' ? 'Student ID' : 'Email Address'} 
            placeholder={activeTab === 'students' ? 'e.g. 2025-123456' : 'e.g. maria.santos@domain.edu'} 
            type={activeTab === 'students' ? 'text' : 'email'}
            value={addForm.identifier} 
            onChange={e => setAddForm({...addForm, identifier: e.target.value})} 
          />
          {activeTab === 'students' && (
            <p className="text-[11px] text-amber-600 font-medium">Note: Default login PIN will be set to '1234'.</p>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t mt-4">
            <NeumorphButton variant="outline" type="button" onClick={() => setIsAddModalOpen(false)}>Cancel</NeumorphButton>
            <NeumorphButton variant="primary" type="submit" loading={addingSingle}>Save Record</NeumorphButton>
          </div>
        </form>
      </NeumorphModal>

      {/* NEW: Confirm PIN Reset Modal */}
      <NeumorphModal 
        open={!!resetModalData} 
        onClose={() => setResetModalData(null)} 
        title="Confirm PIN Reset" 
        size="sm"
      >
        <div className="text-center pb-2">
          <div className="w-16 h-16 bg-amber-50 border border-amber-200 text-amber-500 rounded-full flex items-center justify-center mx-auto shadow-inner mb-4">
            <AlertTriangle size={28} />
          </div>
          <h3 className="text-lg font-black text-gray-800">Reset Student PIN?</h3>
          <p className="text-sm font-medium text-gray-500 mt-2 max-w-[280px] mx-auto leading-relaxed">
            You are about to reset the PIN for <strong className="text-gray-800">{resetModalData?.name}</strong> back to the default <span className="font-mono bg-gray-100 text-gray-800 px-1 py-0.5 rounded">1234</span>.
          </p>
          
          <div className="flex gap-3 pt-6 border-t border-black/5 mt-6">
            <NeumorphButton 
              variant="outline" 
              className="flex-1 py-3 font-bold" 
              onClick={() => setResetModalData(null)} 
              disabled={resettingPin}
            >
              Cancel
            </NeumorphButton>
            <NeumorphButton 
              variant="primary" 
              className="flex-1 py-3 font-bold shadow-md shadow-primary/20 bg-amber-500 hover:bg-amber-600 border-none text-white" 
              onClick={confirmResetPin} 
              loading={resettingPin}
            >
              Yes, Reset PIN
            </NeumorphButton>
          </div>
        </div>
      </NeumorphModal>

    </div>
  );
}