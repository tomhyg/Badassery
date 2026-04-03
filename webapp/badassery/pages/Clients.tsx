
import React, { useState, useEffect } from 'react';
import { Client, getClientDisplayData, Outreach } from '../types';
import { Plus, Search, ArrowRight, Circle, Loader2, ChevronDown, ChevronRight, ExternalLink, Sparkles, Trash2, RefreshCw } from 'lucide-react';
import { InitialsAvatar } from '../components/InitialsAvatar';
import { AIOnboardingModal } from '../components/AIOnboardingModal';
import { deleteClient, createClient, updateClient } from '../services/clientService';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
  const [aiOnboardingClientId, setAiOnboardingClientId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // New Client modal
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ firstName: '', lastName: '', email: '' });
  const [creatingNewClient, setCreatingNewClient] = useState(false);
  const [newClientPassword, setNewClientPassword] = useState('');
  const [newClientError, setNewClientError] = useState('');
  const [pwdCopied, setPwdCopied] = useState(false);

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

  const generatePassword = () => {
    const word = newClient.firstName ? newClient.firstName.charAt(0).toUpperCase() + newClient.firstName.slice(1).toLowerCase() : 'Client';
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${word}${num}!`;
  };

  const handleCreateNewClient = async () => {
    if (!newClient.firstName || !newClient.lastName || !newClient.email) return;
    setCreatingNewClient(true);
    setNewClientError('');
    setNewClientPassword('');
    try {
      const tempPassword = generatePassword();
      const now = new Date().toISOString();
      const clientId = await createClient({
        identity: {
          firstName: newClient.firstName,
          lastName: newClient.lastName,
          email: newClient.email,
        },
        contact_name: `${newClient.firstName} ${newClient.lastName}`.trim(),
        email: newClient.email,
        status: 'onboarding',
        onboardingCompleted: false,
        forcePasswordChange: true,
        stats: {
          total_outreach_started: 0,
          total_bookings: 0,
        },
        metadata: { startDateUtc: now, submitDateUtc: now, clientStatus: 'Onboarding' },
        source: 'Manual Entry',
      } as any);

      const fns = getFunctions(undefined, 'us-central1');
      const createFn = httpsCallable<{ email: string; password: string }, { uid: string; alreadyExists?: boolean }>(
        fns, 'createClientAccount'
      );
      const result = await createFn({ email: newClient.email, password: tempPassword });
      const { uid } = result.data;

      await updateClient(clientId, { authUid: uid });
      setNewClientPassword(tempPassword);
      loadClients();
    } catch (err: any) {
      setNewClientError(err.message || 'Failed to create client');
    } finally {
      setCreatingNewClient(false);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    const clientObj = clients.find(c => c.id === clientId);
    setDeletingId(clientId);
    try {
      if (clientObj?.authUid) {
        try {
          const fns = getFunctions(undefined, 'us-central1');
          const deleteFn = httpsCallable(fns, 'deleteClientAccount');
          await deleteFn({ uid: clientObj.authUid });
        } catch (e) {
          console.warn('Could not delete Firebase Auth account:', e);
        }
      }
      await deleteClient(clientId);
      setDeleteConfirmId(null);
      loadClients();
    } catch (err: any) {
      alert('Failed to delete client: ' + (err.message || 'Unknown error'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const fns = getFunctions();
      for (const c of clients) {
        try {
          if ((c as any).authUid) {
            const deleteFn = httpsCallable(fns, 'deleteClientAccount');
            await deleteFn({ uid: (c as any).authUid });
          }
          await deleteClient(c.id!);
        } catch (err) {
          console.warn('Failed to delete client', c.id, err);
        }
      }
      setShowDeleteAll(false);
      loadClients();
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <>
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
        <div className="flex items-center gap-2">
          {clients.length > 0 && (
            <button
              onClick={() => setShowDeleteAll(true)}
              className="border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-400 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Trash2 size={15} /> Delete all
            </button>
          )}
          <button
            onClick={() => { setShowNewClient(true); setNewClient({ firstName: '', lastName: '', email: '' }); setNewClientPassword(''); setNewClientError(''); setPwdCopied(false); }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow"
          >
            <Plus size={16} /> New Client
          </button>
        </div>
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
                                    <InitialsAvatar name={client.contact_name || '?'} src={client.logo_url} size="sm" />
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
                                 <div className="flex items-center justify-end gap-2">
                                    <button
                                       onClick={(e) => { e.stopPropagation(); setAiOnboardingClientId(client.id); }}
                                       className="p-1.5 text-purple-400 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                       title="AI Onboarding"
                                    >
                                       <Sparkles size={14} />
                                    </button>
                                    <button
                                       onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(client.id); }}
                                       className="p-1.5 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                       title="Delete client"
                                    >
                                       <Trash2 size={14} />
                                    </button>
                                    <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-600 transition-colors inline-block" />
                                 </div>
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

    {/* New Client Modal */}
    {showNewClient && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">New Client</h2>
          <p className="text-sm text-slate-500 mb-5">
            Creates the Firestore record and Firebase Auth login in one step.
          </p>

          {newClientPassword ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✅</span>
                  <p className="text-sm font-semibold text-green-800">Compte créé !</p>
                </div>
                <p className="text-xs text-slate-600">
                  Envoie ces identifiants à <strong>{newClient.email}</strong> :
                </p>
                <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-xs">Email</span>
                    <span className="font-mono text-slate-800 text-xs">{newClient.email}</span>
                  </div>
                  <div className="border-t border-slate-100" />
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-slate-500 text-xs">Mot de passe</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-indigo-700 text-sm tracking-wide">{newClientPassword}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(newClientPassword);
                          setPwdCopied(true);
                          setTimeout(() => setPwdCopied(false), 2000);
                        }}
                        className="text-xs text-indigo-500 hover:text-indigo-700 border border-indigo-200 rounded px-2 py-0.5 transition-colors"
                      >
                        {pwdCopied ? '✓ Copié' : 'Copier'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setShowNewClient(false); setNewClientPassword(''); setPwdCopied(false); }}
                className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {newClientError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{newClientError}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">First Name *</label>
                  <input value={newClient.firstName} onChange={e => setNewClient(p => ({ ...p, firstName: e.target.value }))} placeholder="Jane" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Last Name *</label>
                  <input value={newClient.lastName} onChange={e => setNewClient(p => ({ ...p, lastName: e.target.value }))} placeholder="Doe" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Email *</label>
                <input type="email" value={newClient.email} onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))} placeholder="jane@example.com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowNewClient(false)}
                  disabled={creatingNewClient}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateNewClient}
                  disabled={creatingNewClient || !newClient.firstName || !newClient.lastName || !newClient.email}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creatingNewClient ? <><RefreshCw size={14} className="animate-spin" /> Creating…</> : 'Create Client'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}

    {/* AI Onboarding Modal */}
    {aiOnboardingClientId && (
      <AIOnboardingModal
        clientId={aiOnboardingClientId}
        client={clients.find(c => c.id === aiOnboardingClientId) ?? null}
        onClose={() => setAiOnboardingClientId(null)}
        onSaved={() => { setAiOnboardingClientId(null); loadClients(); }}
      />
    )}

    {/* Delete Confirmation Modal */}
    {deleteConfirmId && (() => {
      const target = clients.find(c => c.id === deleteConfirmId);
      const name = target
        ? (`${target.identity?.firstName || ''} ${target.identity?.lastName || ''}`.trim() || target.contact_name || 'this client')
        : 'this client';
      return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Delete Client</h2>
                <p className="text-sm text-slate-500">This cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-slate-700 mb-6">
              Are you sure you want to delete <strong>{name}</strong>?
              This will permanently remove all their data.
              {target?.authUid && ' Their login account will also be deleted.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={deletingId === deleteConfirmId}
                className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteClient(deleteConfirmId)}
                disabled={deletingId === deleteConfirmId}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deletingId === deleteConfirmId
                  ? <><RefreshCw size={14} className="animate-spin" /> Deleting…</>
                  : 'Yes, Delete'
                }
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {/* Delete All confirmation modal */}
    {showDeleteAll && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Trash2 size={20} className="text-red-500" />
            </div>
            <h2 className="font-bold text-slate-900">Delete all clients?</h2>
          </div>
          <p className="text-sm text-slate-500 mb-6">
            This will permanently delete all <span className="font-semibold text-slate-700">{clients.length} client{clients.length !== 1 ? 's' : ''}</span> and their Firebase Auth accounts. This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDeleteAll(false)}
              disabled={deletingAll}
              className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={deletingAll}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {deletingAll
                ? <><RefreshCw size={14} className="animate-spin" /> Deleting…</>
                : <><Trash2 size={14} /> Delete all</>
              }
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};
