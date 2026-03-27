
import React, { useState, useEffect } from 'react';
import { Client, getClientDisplayData, Outreach } from '../types';
import { Plus, Search, Filter, ArrowRight, Circle, Loader2, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { getAllClients, searchClients } from '../services/clientService';
import { getAllOutreachV2Cached } from '../services/outreachServiceV2';

interface ClientsProps {
  onClientClick: (id: string) => void;
  onNewClientClick: () => void;
}

export const Clients: React.FC<ClientsProps> = ({ onClientClick, onNewClientClick }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [displayClients, setDisplayClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [outreach, setOutreach] = useState<Outreach[]>([]);

  // Load clients and outreach from Firestore on mount
  useEffect(() => {
    loadClients();
    loadOutreach();
  }, []);

  const loadOutreach = async () => {
    try {
      const data = await getAllOutreachV2Cached();
      setOutreach(data);
    } catch (err) {
      console.error('Error loading outreach:', err);
    }
  };

  // Toggle row expansion
  const toggleRow = (clientId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId);
    } else {
      newExpanded.add(clientId);
    }
    setExpandedRows(newExpanded);
  };

  // Get outreach for a specific client
  const getClientOutreach = (clientId: string) => {
    return outreach.filter(o => o.client_id === clientId);
  };

  // Calculate goal percentage
  const getGoalPercentage = (booked: number, goal: number) => {
    if (!goal || goal === 0) return null;
    return Math.round((booked / goal) * 100);
  };

  // Update display clients when clients or filters change
  useEffect(() => {
    updateDisplayClients();
  }, [clients, statusFilter]);

  const loadClients = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedClients = await getAllClients();
      setClients(fetchedClients);
    } catch (err) {
      console.error('Error loading clients:', err);
      setError('Failed to load clients. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateDisplayClients = () => {
    let filtered = clients;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(client => {
        const status = client.status || client.metadata?.clientStatus?.toLowerCase();
        return status === statusFilter;
      });
    }

    // Convert to display format
    const display = filtered.map(client => getClientDisplayData(client));
    setDisplayClients(display);
  };

  const handleSearch = async (term: string) => {
    setSearchTerm(term);

    if (term.trim() === '') {
      updateDisplayClients();
      return;
    }

    try {
      const results = await searchClients(term);
      const display = results.map(client => getClientDisplayData(client));
      setDisplayClients(display);
    } catch (err) {
      console.error('Error searching clients:', err);
    }
  };
  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
        <button 
          onClick={onNewClientClick}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow"
        >
          <Plus size={16} /> New Client
        </button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm shadow-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm cursor-pointer"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="onboarding">Onboarding</option>
          <option value="paused">Paused</option>
          <option value="churned">Churned</option>
        </select>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          {error}
        </div>
      )}

      {!loading && !error && (

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col">
         <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
               <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium uppercase tracking-wider">
                  <tr>
                     <th className="px-4 py-4 w-10"></th>
                     <th className="px-4 py-4 w-10"></th>
                     <th className="px-4 py-4">Name</th>
                     <th className="px-4 py-4">Company</th>
                     <th className="px-4 py-4">Status</th>
                     <th className="px-4 py-4 text-center">Matches</th>
                     <th className="px-4 py-4 text-center">Outreach</th>
                     <th className="px-4 py-4 text-center">Booked</th>
                     <th className="px-4 py-4 text-center">Goal</th>
                     <th className="px-4 py-4 text-center">% Complete</th>
                     <th className="px-4 py-4"></th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {displayClients.map(client => {
                     const clientOutreach = getClientOutreach(client.id);
                     const isExpanded = expandedRows.has(client.id);
                     const goalPct = getGoalPercentage(client.stats.total_bookings, client.stats.goal_bookings);

                     return (
                        <React.Fragment key={client.id}>
                           <tr
                              onClick={() => onClientClick(client.id)}
                              className="hover:bg-slate-50 cursor-pointer transition-colors group"
                           >
                              <td className="px-4 py-4">
                                 <button
                                    onClick={(e) => toggleRow(client.id, e)}
                                    className="p-1 hover:bg-slate-200 rounded transition-colors"
                                 >
                                    {isExpanded ? (
                                       <ChevronDown size={16} className="text-slate-500" />
                                    ) : (
                                       <ChevronRight size={16} className="text-slate-400" />
                                    )}
                                 </button>
                              </td>
                              <td className="px-4 py-4">
                                 <Circle size={10} className={`fill-current ${
                                    client.status === 'active' ? 'text-blue-500' :
                                    client.status === 'onboarding' ? 'text-amber-400' :
                                    client.status === 'paused' ? 'text-slate-400' : 'text-slate-300'
                                 }`} />
                              </td>
                              <td className="px-4 py-4">
                                 <div className="flex items-center gap-3">
                                    <img src={client.logo_url} className="w-8 h-8 rounded-full bg-slate-100 object-cover" alt="" />
                                    <span className="font-bold text-slate-900">{client.contact_name}</span>
                                 </div>
                              </td>
                              <td className="px-4 py-4 text-slate-600">
                                 {client.company_name}
                              </td>
                              <td className="px-4 py-4">
                                 <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                    ${client.status === 'active' ? 'bg-green-100 text-green-800' :
                                      client.status === 'onboarding' ? 'bg-amber-100 text-amber-800' :
                                      'bg-slate-100 text-slate-600'}
                                 `}>
                                    {client.status}
                                 </span>
                              </td>
                              <td className="px-4 py-4 text-center font-medium text-slate-700">{client.stats.matches || 0}</td>
                              <td className="px-4 py-4 text-center font-medium text-slate-700">{client.stats.total_outreach_started}</td>
                              <td className="px-4 py-4 text-center font-bold text-indigo-600">{client.stats.total_bookings}</td>
                              <td className="px-4 py-4 text-center font-medium text-slate-600">
                                 {client.stats.goal_bookings || '-'}
                              </td>
                              <td className="px-4 py-4 text-center">
                                 {goalPct !== null ? (
                                    <span className={`font-bold ${
                                       goalPct >= 100 ? 'text-green-600' :
                                       goalPct >= 50 ? 'text-amber-600' :
                                       'text-slate-600'
                                    }`}>
                                       {goalPct}%
                                    </span>
                                 ) : (
                                    <span className="text-slate-400">-</span>
                                 )}
                              </td>
                              <td className="px-4 py-4 text-right">
                                 <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-600 transition-colors inline-block" />
                              </td>
                           </tr>

                           {/* Expanded Row - Outreach Details */}
                           {isExpanded && (
                              <tr className="bg-slate-50">
                                 <td colSpan={11} className="px-6 py-4">
                                    <div className="ml-8">
                                       <h4 className="text-sm font-semibold text-slate-700 mb-3">
                                          Outreach Pipeline ({clientOutreach.length})
                                       </h4>
                                       {clientOutreach.length > 0 ? (
                                          <div className="space-y-2 max-h-60 overflow-y-auto">
                                             {clientOutreach.slice(0, 10).map(o => (
                                                <div
                                                   key={o.id}
                                                   className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200"
                                                >
                                                   <div className="flex items-center gap-3">
                                                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                         o.status === 'live' || o.status === 'recorded' ? 'bg-green-100 text-green-700' :
                                                         o.status === 'recording_scheduled' || o.status === 'screening_scheduled' ? 'bg-blue-100 text-blue-700' :
                                                         o.status === 'in_contact' ? 'bg-indigo-100 text-indigo-700' :
                                                         o.status.includes('email_sent') || o.status.includes('followup') ? 'bg-amber-100 text-amber-700' :
                                                         'bg-slate-100 text-slate-600'
                                                      }`}>
                                                         {o.status.replace(/_/g, ' ')}
                                                      </span>
                                                      <span className="text-sm font-medium text-slate-900">
                                                         {o.podcast_name || 'Unknown Podcast'}
                                                      </span>
                                                   </div>
                                                   {o.podcast_url && (
                                                      <a
                                                         href={o.podcast_url}
                                                         target="_blank"
                                                         rel="noopener noreferrer"
                                                         onClick={(e) => e.stopPropagation()}
                                                         className="text-slate-400 hover:text-indigo-600"
                                                      >
                                                         <ExternalLink size={14} />
                                                      </a>
                                                   )}
                                                </div>
                                             ))}
                                             {clientOutreach.length > 10 && (
                                                <p className="text-xs text-slate-500 text-center py-2">
                                                   +{clientOutreach.length - 10} more outreach records
                                                </p>
                                             )}
                                          </div>
                                       ) : (
                                          <p className="text-sm text-slate-500">No outreach records yet</p>
                                       )}
                                    </div>
                                 </td>
                              </tr>
                           )}
                        </React.Fragment>
                     );
                  })}
               </tbody>
            </table>
         </div>
         <div className="p-4 border-t border-slate-200 bg-slate-50 text-slate-500 text-xs font-medium">
            Showing {displayClients.length} clients
         </div>
      </div>
      )}
    </div>
  );
};
