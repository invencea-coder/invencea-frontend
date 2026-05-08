import React, { useEffect, useState } from 'react';
import { Activity, Search, LogIn, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosClient.js';
import NeumorphCard from '../../components/ui/NeumorphCard.jsx';
import NeumorphInput from '../../components/ui/NeumorphInput.jsx';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const { data } = await api.get('/manager/audits');
        setLogs(data.data || []);
      } catch {
        toast.error('Failed to load audit logs.');
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => 
    log.name.toLowerCase().includes(search.toLowerCase()) || 
    log.user_id.toLowerCase().includes(search.toLowerCase()) ||
    log.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 text-primary rounded-xl"><Activity size={24} /></div>
          <div>
            <h1 className="text-2xl font-black text-gray-800 tracking-tight">System Audit Logs</h1>
            <p className="text-sm text-gray-500 font-medium">Tracking all login and logout events.</p>
          </div>
        </div>
      </div>

      <NeumorphCard className="p-0 overflow-hidden">
        <div className="p-4 border-b border-black/5 bg-gray-50">
          <NeumorphInput icon={<Search size={16} />} placeholder="Search by name, ID, or role..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-black/5 text-[10px] font-black uppercase text-gray-400 tracking-widest">
              <tr>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">IP Address</th>
                <th className="px-6 py-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {loading ? (
                <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-400">No logs found.</td></tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3">
                      <span className={`flex items-center gap-1.5 w-fit px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${log.action === 'LOGIN' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                        {log.action === 'LOGIN' ? <LogIn size={12} /> : <LogOut size={12} />} {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <p className="font-bold text-gray-800">{log.name}</p>
                      <p className="text-[10px] text-gray-500 font-mono">{log.user_id}</p>
                    </td>
                    <td className="px-6 py-3"><span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-black uppercase">{log.role}</span></td>
                    <td className="px-6 py-3 font-mono text-gray-500">{log.ip_address}</td>
                    <td className="px-6 py-3 text-gray-600">{new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </NeumorphCard>
    </div>
  );
}