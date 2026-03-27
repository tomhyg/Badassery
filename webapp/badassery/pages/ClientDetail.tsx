
import React, { useState } from 'react';
import { Client, Podcast } from '../types';
import { ArrowLeft, Edit2, PauseCircle, Mail, Phone, Bot, Target, List, BarChart3, Star, Eye, Plus, Rocket, ExternalLink } from 'lucide-react';
import { podcasts } from '../services/mockData';

interface ClientDetailProps {
  client: Client;
  onBack: () => void;
}

export const ClientDetail: React.FC<ClientDetailProps> = ({ client, onBack }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'matches' | 'wishlist' | 'outreach' | 'stats'>('matches');

  return (
    <div className="flex flex-col h-full space-y-6">
       {/* Header */}
       <div className="flex items-start justify-between">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-900 flex items-center gap-2 text-sm font-medium mb-4">
             <ArrowLeft size={16} /> Back
          </button>
          <div className="flex gap-2">
             <button className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50 flex items-center gap-1">
                <Edit2 size={12} /> Edit
             </button>
             <button className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50 flex items-center gap-1">
                <PauseCircle size={12} /> Pause
             </button>
          </div>
       </div>

       <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-6">
          <img src={client.logo_url} alt="" className="w-20 h-20 rounded-lg border border-slate-100 object-cover" />
          <div className="flex-1">
             <div className="flex justify-between items-start">
                <div>
                   <h1 className="text-2xl font-bold text-slate-900">{client.company_name}</h1>
                   <p className="text-slate-600 text-lg">{client.spokesperson.name}, {client.spokesperson.title}</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-800 text-sm font-bold capitalize">
                   <div className="w-2 h-2 bg-green-500 rounded-full" /> {client.status}
                </div>
             </div>
             
             <div className="flex gap-6 mt-4 text-sm text-slate-500">
                {client.email && <div className="flex items-center gap-2"><Mail size={14} /> {client.email}</div>}
                {client.phone && <div className="flex items-center gap-2"><Phone size={14} /> {client.phone}</div>}
                <div className="flex items-center gap-2 px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-medium">Industry: {client.industry}</div>
             </div>
          </div>
       </div>

       {/* Tabs */}
       <div className="flex-1 flex flex-col">
          <div className="flex border-b border-slate-200 mb-6">
             {[
                { id: 'profile', label: 'Profile', icon: List },
                { id: 'matches', label: 'AI Matches', icon: Target },
                { id: 'wishlist', label: 'Wishlist', icon: Star },
                { id: 'outreach', label: 'Outreach', icon: Mail },
                { id: 'stats', label: 'Stats', icon: BarChart3 }
             ].map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition-colors
                     ${activeTab === tab.id 
                        ? 'border-indigo-600 text-indigo-600' 
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
                  `}
                >
                   <tab.icon size={16} />
                   {tab.label}
                </button>
             ))}
          </div>

          <div className="flex-1">
             {/* AI MATCHES TAB */}
             {activeTab === 'matches' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                   <button className="w-full py-3 border-2 border-dashed border-indigo-200 bg-indigo-50/50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 hover:border-indigo-300 transition-colors flex items-center justify-center gap-2">
                      <Bot size={20} /> Generate New AI Matches
                   </button>
                   
                   <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <table className="w-full text-left text-sm">
                         <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                            <tr>
                               <th className="px-6 py-3 w-20">Score</th>
                               <th className="px-6 py-3">Podcast</th>
                               <th className="px-6 py-3">Why Match</th>
                               <th className="px-6 py-3 text-right">Action</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                            {[
                               { pod: podcasts[0], score: 9.2, reasons: ['Industry Match', 'Audience Fit', 'Recent Topic overlap'] },
                               { pod: podcasts[4], score: 8.8, reasons: ['Industry Match', 'Audience Fit', 'Style Match'] },
                               { pod: podcasts[2], score: 8.5, reasons: ['Audience Fit', 'Topics Match', 'European Founders Focus'] },
                            ].map((match, i) => (
                               <tr key={i} className="hover:bg-slate-50">
                                  <td className="px-6 py-4">
                                     <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{match.score}</span>
                                  </td>
                                  <td className="px-6 py-4">
                                     <div className="font-bold text-slate-900">{match.pod.show_name}</div>
                                  </td>
                                  <td className="px-6 py-4">
                                     <div className="flex flex-wrap gap-2">
                                        {match.reasons.map((r, idx) => (
                                           <span key={idx} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded flex items-center gap-1">
                                              {r} <span className="text-green-500">✓</span>
                                           </span>
                                        ))}
                                     </div>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                     <div className="flex justify-end gap-2">
                                        <button className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 flex items-center gap-1">
                                           <Plus size={12} /> Add
                                        </button>
                                        <button className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded text-xs font-bold hover:bg-slate-50">
                                           View
                                        </button>
                                     </div>
                                  </td>
                               </tr>
                            ))}
                         </tbody>
                      </table>
                   </div>
                </div>
             )}

             {/* WISHLIST TAB */}
             {activeTab === 'wishlist' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                   <div className="text-sm text-slate-500 mb-2">Podcasts Ruth added manually as good fits:</div>
                   <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <table className="w-full text-left text-sm">
                         <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                            <tr>
                               <th className="px-6 py-3">Podcast</th>
                               <th className="px-6 py-3">Added By</th>
                               <th className="px-6 py-3">Date</th>
                               <th className="px-6 py-3 text-right">Action</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                            {[
                               { name: 'NPR Health News', added: 'Ruth', date: 'Jan 12' },
                               { name: 'MedTech Talk', added: 'Ruth', date: 'Jan 14' },
                               { name: 'French Tech Radio', added: 'Ruth', date: 'Jan 16' },
                            ].map((item, i) => (
                               <tr key={i} className="hover:bg-slate-50">
                                  <td className="px-6 py-4 font-bold text-slate-900">{item.name}</td>
                                  <td className="px-6 py-4 text-slate-600">{item.added}</td>
                                  <td className="px-6 py-4 text-slate-500">{item.date}</td>
                                  <td className="px-6 py-4 text-right">
                                     <div className="flex justify-end gap-2">
                                        <button className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded text-xs font-bold hover:bg-slate-50">
                                           View
                                        </button>
                                        <button className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 flex items-center gap-1">
                                           <Rocket size={12} /> Outreach
                                        </button>
                                     </div>
                                  </td>
                               </tr>
                            ))}
                         </tbody>
                      </table>
                   </div>
                </div>
             )}

             {/* Placeholder for other tabs */}
             {(activeTab === 'profile' || activeTab === 'outreach' || activeTab === 'stats') && (
                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                   Content for {activeTab} coming soon...
                </div>
             )}
          </div>
       </div>
    </div>
  );
};
