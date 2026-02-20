
import React, { useState, useEffect } from 'react';
import { Outreach, OutreachStatus } from '../types';
import { Modal } from '../components/Modal';
import { MoreHorizontal, CheckCircle, Clock, Send, MessageSquare, Sparkles, RefreshCw, Paperclip, Edit3, Calendar, Award, Star, Mail, User } from 'lucide-react';
import { getPodcastForOutreach } from '../services/podcastService';

interface OutreachProps {
  items: Outreach[];
}

const COLUMNS: { id: OutreachStatus; label: string; color: string }[] = [
  { id: 'ready_for_outreach', label: 'Ready', color: 'bg-slate-500' },
  { id: '1st_email_sent', label: '1st Email', color: 'bg-blue-500' },
  { id: '1st_followup_sent', label: 'Follow Up 1', color: 'bg-indigo-500' },
  { id: '2nd_followup_sent', label: 'Follow Up 2', color: 'bg-violet-500' },
  { id: 'in_contact', label: 'In Contact', color: 'bg-amber-500' },
  { id: 'scheduling_screening', label: 'Scheduling', color: 'bg-orange-500' },
  { id: 'recording_scheduled', label: 'Booked', color: 'bg-green-500' },
];

export const OutreachBoard: React.FC<OutreachProps> = ({ items }) => {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<Outreach | null>(null);
  const [enrichedItems, setEnrichedItems] = useState<Outreach[]>(items);

  // Enrich outreach items with podcast data
  useEffect(() => {
    const enrichOutreach = async () => {
      const enriched = await Promise.all(
        items.map(async (item) => {
          if (item.podcast_itunes_id && !item.podcast) {
            const podcast = await getPodcastForOutreach(item.podcast_itunes_id);
            return { ...item, podcast };
          }
          return item;
        })
      );
      setEnrichedItems(enriched);
    };

    enrichOutreach();
  }, [items]);

  return (
    <div className="h-full flex flex-col">
       <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Outreach Pipeline</h1>
        <div className="flex gap-2">
            <select className="bg-white border border-slate-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none">
                <option>All Clients</option>
                <option>MediVIE Tech</option>
                <option>FinStack</option>
            </select>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4 mb-4">
        <div className="flex gap-4 h-full min-w-[1500px]">
          {COLUMNS.map(col => {
            const columnItems = enrichedItems.filter(i => i.status === col.id);
            return (
              <div key={col.id} className="w-80 flex-shrink-0 flex flex-col h-full bg-slate-100/50 rounded-xl border border-slate-200/60">
                {/* Column Header */}
                <div className="p-3 flex items-center justify-between border-b border-slate-200 bg-slate-50/50 rounded-t-xl">
                   <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                      <span className="font-semibold text-slate-700 text-sm uppercase tracking-wide">{col.label}</span>
                   </div>
                   <span className="bg-white px-2.5 py-0.5 rounded-md text-xs font-bold text-slate-500 border border-slate-200 shadow-sm">{columnItems.length}</span>
                </div>

                {/* Drop Zone */}
                <div className="flex-1 p-2 overflow-y-auto hide-scroll space-y-3">
                  {columnItems.map(item => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => setDraggedItem(item.id)}
                      onClick={() => setSelectedItem(item)}
                      className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group active:scale-95 select-none relative"
                    >
                      {/* Client Tag */}
                      <div className="flex justify-between items-start mb-3">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase rounded tracking-wider">
                          {item.client?.company_name || 'Unknown Client'}
                        </span>
                        <button className="text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal size={16} />
                        </button>
                      </div>

                      {/* Podcast Info with Artwork */}
                      {item.podcast ? (
                        <div className="flex gap-3 mb-3">
                          <img
                            src={item.podcast.imageUrl || 'https://via.placeholder.com/48'}
                            alt={item.podcast.title}
                            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-slate-900 text-sm line-clamp-2 mb-1">
                              {item.podcast.title}
                            </h4>
                            {item.podcast.ai_badassery_score && (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-md">
                                  <Award size={12} className="text-purple-600" />
                                  <span className="text-xs font-bold text-purple-700">
                                    {item.podcast.ai_badassery_score.toFixed(1)}
                                  </span>
                                </div>
                                {item.podcast.ai_global_percentile && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                                    {item.podcast.ai_global_percentile}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <h4 className="font-bold text-slate-900 text-sm mb-2 line-clamp-2">
                          {item.podcast_id || 'Unknown Podcast'}
                        </h4>
                      )}

                      {/* Subject Tag */}
                      <p className="text-xs text-slate-500 mb-3 truncate">
                        Topic: {item.subject_tag}
                      </p>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-50 text-xs text-slate-400">
                         <div className="flex items-center gap-1.5">
                            {item.status === 'booked' ? <CheckCircle size={14} className="text-green-500" /> : <Clock size={14} />}
                            {item.last_activity}
                         </div>
                         <div className="w-7 h-7 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                           {item.status === 'in_contact' ? <MessageSquare size={14} /> :
                            item.status === 'scheduling' ? <Calendar size={14} /> : <Send size={14} />}
                         </div>
                      </div>
                    </div>
                  ))}
                  {columnItems.length === 0 && (
                      <div className="h-full flex items-center justify-center text-slate-300 text-sm italic">Drop here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Areas */}
      <div className="grid grid-cols-2 gap-6 h-32 flex-shrink-0">
         <div className="bg-slate-100/50 rounded-xl border border-slate-200/60 p-4 border-dashed border-slate-300">
             <h3 className="font-semibold text-slate-700 text-xs uppercase tracking-wide mb-3">Parking Lot (Inactive)</h3>
             <div className="flex gap-3">
                 <div className="px-3 py-2 bg-white border border-slate-200 rounded text-xs text-slate-600 font-medium">Backlog (3)</div>
                 <div className="px-3 py-2 bg-white border border-slate-200 rounded text-xs text-slate-600 font-medium">Follow-up 1Mo (2)</div>
                 <div className="px-3 py-2 bg-white border border-slate-200 rounded text-xs text-slate-600 font-medium">Form (1)</div>
             </div>
         </div>
         <div className="bg-slate-100/50 rounded-xl border border-slate-200/60 p-4 border-dashed border-slate-300">
             <h3 className="font-semibold text-slate-700 text-xs uppercase tracking-wide mb-3">Closed</h3>
             <div className="flex gap-3">
                 <div className="px-3 py-2 bg-red-50 border border-red-100 rounded text-xs text-red-600 font-medium">Declined (8)</div>
                 <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-500 font-medium">No Reply (12)</div>
             </div>
         </div>
      </div>

      {/* AI Email Composer Modal (Existing) */}
      <Modal 
        isOpen={!!selectedItem} 
        onClose={() => setSelectedItem(null)} 
        title="AI Outreach Composer"
        maxWidth="max-w-2xl"
      >
        {selectedItem && (
          <div className="space-y-6">
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 flex items-start gap-3">
              <Sparkles className="text-indigo-600 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <h4 className="text-sm font-bold text-indigo-900">AI Strategy Insight</h4>
                <p className="text-sm text-indigo-700 mt-1">
                  This podcast recently discussed <strong>{selectedItem.subject_tag}</strong>. 
                  Highlighting {selectedItem.client.spokesperson.name}'s experience with similar challenges will maximize response rates.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Podcast Summary Card */}
              {selectedItem.podcast && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
                  <div className="flex gap-3">
                    <img
                      src={selectedItem.podcast.imageUrl || 'https://via.placeholder.com/64'}
                      alt={selectedItem.podcast.title}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 mb-1">{selectedItem.podcast.title}</h4>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        {selectedItem.podcast.rss_owner_name && (
                          <div className="flex items-center gap-1">
                            <User size={12} />
                            {selectedItem.podcast.rss_owner_name}
                          </div>
                        )}
                        {selectedItem.podcast.ai_badassery_score && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 rounded">
                            <Award size={12} className="text-purple-600" />
                            <span className="font-bold text-purple-700">
                              {selectedItem.podcast.ai_badassery_score.toFixed(1)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">To</label>
                <div className="flex items-center gap-2">
                   <input
                     type="text"
                     value={
                       selectedItem.podcast?.rss_owner_email ||
                       selectedItem.podcast?.website_email ||
                       selectedItem.podcast?.contact?.email_primary ||
                       "host@podcast.com"
                     }
                     className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50"
                     readOnly
                   />
                   {(selectedItem.podcast?.rss_owner_email || selectedItem.podcast?.website_email) && (
                     <span className="text-xs text-green-600 font-medium whitespace-nowrap px-2 py-1 bg-green-50 rounded">Verified ✓</span>
                   )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                <div className="relative">
                   <input
                     type="text"
                     defaultValue={`Guest Idea: ${selectedItem.subject_tag} expert for ${selectedItem.podcast?.title || 'your show'}`}
                     className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm pr-24 focus:ring-2 focus:ring-indigo-500 outline-none"
                   />
                   <button className="absolute right-2 top-1/2 -translate-y-1/2 text-xs flex items-center gap-1 text-indigo-600 font-medium hover:bg-indigo-50 px-2 py-1 rounded">
                     <RefreshCw size={12} /> Rewrite
                   </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message Body</label>
                <div className="relative border border-slate-300 rounded-lg shadow-sm">
                  <textarea
                    rows={8}
                    className="w-full px-4 py-3 text-sm rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none leading-relaxed"
                    defaultValue={`Hi ${selectedItem.podcast?.rss_owner_name || '[Host Name]'},\n\nI loved your recent episode about ${selectedItem.subject_tag} — specifically the point about scaling challenges. \n\nI represent ${selectedItem.client?.spokesperson?.name || 'our client'} from ${selectedItem.client?.company_name || 'their company'}, who recently navigated a similar transition in the ${selectedItem.client?.industry || 'business'} space.\n\nWould you be open to a 15-min chat about having them on to share their "trenches" story?\n\nBest,\nRuth`}
                  />
                  <div className="absolute bottom-3 left-3 flex gap-2">
                    <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
                      <Paperclip size={16} />
                    </button>
                    <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
                      <Sparkles size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
               <button className="text-slate-500 text-sm font-medium hover:text-slate-700">Save Draft</button>
               <div className="flex gap-3">
                 <button className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm font-medium hover:bg-slate-50 flex items-center gap-2">
                   <Edit3 size={16} /> Edit Strategy
                 </button>
                 <button 
                   onClick={() => { setSelectedItem(null); }}
                   className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2 shadow-sm hover:shadow"
                 >
                   <Send size={16} /> Send Email
                 </button>
               </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
