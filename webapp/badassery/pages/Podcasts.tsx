import React, { useState } from 'react';
import { Podcast, Outreach, Client } from '../types';
import { Modal } from '../components/Modal';
import { outreachItems, clients } from '../services/mockData';
import { 
  Search, Filter, Plus, Star, Mic, Youtube, Mail, ExternalLink, 
  Play, TrendingUp, Users, Twitter, Instagram, Globe, ChevronDown, 
  MoreHorizontal, CheckSquare, Square, Download, Edit2, Archive, Copy, Rocket, 
  Clock, CheckCircle, XCircle, ArrowRight
} from 'lucide-react';

interface PodcastsProps {
  podcasts: Podcast[];
}

export const Podcasts: React.FC<PodcastsProps> = ({ podcasts }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPodcast, setSelectedPodcast] = useState<Podcast | null>(null);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // Details Modal State
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'episodes' | 'outreach' | 'activity'>('overview');

  const filteredPodcasts = podcasts.filter(p => 
    p.show_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.classification.topics.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Header Area */}
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <h1 className="text-2xl font-bold text-slate-900">Podcasts</h1>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow transition-all"
        >
          <Plus size={16} /> Add Podcast
        </button>
      </div>

      {/* Main Content Layout */}
      <div className="flex flex-1 gap-6 overflow-hidden">
        
        {/* Sidebar Filters (Desktop) */}
        <aside className={`w-64 flex-shrink-0 overflow-y-auto custom-scrollbar pr-2 ${showFiltersMobile ? 'fixed inset-0 z-40 bg-white p-6' : 'hidden lg:block'}`}>
          <div className="flex items-center justify-between mb-4 lg:hidden">
             <h3 className="font-bold text-lg">Filters</h3>
             <button onClick={() => setShowFiltersMobile(false)}>Close</button>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wide">Filters</h3>
              
              {/* Rating Filter */}
              <div className="mb-6">
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Rating</label>
                  <span className="text-xs text-slate-500">4.0 - 5.0</span>
                </div>
                <input type="range" min="0" max="5" step="0.1" className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>0</span>
                  <span>5</span>
                </div>
              </div>

              {/* Reviews Filter */}
              <div className="mb-6">
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Reviews</label>
                  <span className="text-xs text-slate-500">50+</span>
                </div>
                <input type="range" min="0" max="10000" className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
              </div>

              {/* Badassery Score */}
              <div className="mb-6">
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Badassery Score</label>
                  <span className="text-xs text-slate-500">8+</span>
                </div>
                <input type="range" min="0" max="10" className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
              </div>

              {/* Categories */}
              <div className="mb-6">
                <label className="text-sm font-medium text-slate-700 mb-3 block">Categories</label>
                <div className="space-y-2">
                  {['Business', 'Health & Fitness', 'Technology', 'Society & Culture', 'Education'].map((cat) => (
                    <label key={cat} className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" defaultChecked={['Business', 'Health & Fitness'].includes(cat)} />
                      <span className="text-sm text-slate-600 group-hover:text-slate-900">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div className="mb-6">
                <label className="text-sm font-medium text-slate-700 mb-3 block">Language</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" defaultChecked />
                    <span className="text-sm text-slate-600">English</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                    <span className="text-sm text-slate-600">French</span>
                  </label>
                </div>
              </div>

              {/* Has Contact */}
              <div className="mb-6">
                 <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" defaultChecked />
                    <span className="text-sm font-medium text-slate-700">Email available</span>
                 </label>
              </div>

              {/* Audience Size */}
              <div className="mb-6">
                <label className="text-sm font-medium text-slate-700 mb-3 block">Audience Size</label>
                <div className="space-y-2">
                  {['Small (<10K)', 'Medium (10-100K)', 'Large (>100K)', 'Any'].map((size, i) => (
                    <label key={size} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="audience" className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" defaultChecked={i===1} />
                      <span className="text-sm text-slate-600">{size}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                Clear Filters
              </button>
            </div>
          </div>
        </aside>

        {/* Right Column: Search & Results */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Search Area */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-4 flex gap-2 flex-shrink-0">
            <div className="flex-1 relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
               <input 
                type="text" 
                placeholder="Search by name, topic, or host..." 
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
              Search
            </button>
            <button 
              className="lg:hidden px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600"
              onClick={() => setShowFiltersMobile(true)}
            >
              <Filter size={20} />
            </button>
          </div>

          {/* Results Header */}
          <div className="flex justify-between items-center mb-4 px-1 flex-shrink-0">
             <h2 className="font-semibold text-slate-700">Results <span className="text-slate-400 font-normal text-sm ml-2">Showing {filteredPodcasts.length} of 35,000 podcasts</span></h2>
             <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">Sort by:</span>
                <div className="relative">
                   <select className="appearance-none bg-white border border-slate-200 text-slate-700 py-1.5 pl-3 pr-8 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                      <option>Badassery Score</option>
                      <option>Rating</option>
                      <option>Review Count</option>
                   </select>
                   <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>
             </div>
          </div>

          {/* Scrollable Results List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2 pb-6">
            {filteredPodcasts.map(podcast => (
              <div key={podcast.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row gap-5 group">
                {/* Image */}
                <div className="relative flex-shrink-0">
                  <img 
                    src={podcast.artwork_url} 
                    alt={podcast.show_name} 
                    className="w-28 h-28 rounded-lg object-cover bg-slate-100 shadow-sm"
                  />
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                    EN
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col justify-between">
                   <div>
                      <div className="flex justify-between items-start">
                         <h3 
                            className="text-lg font-bold text-slate-900 hover:text-indigo-600 cursor-pointer transition-colors"
                            onClick={() => setSelectedPodcast(podcast)}
                         >
                            {podcast.show_name}
                         </h3>
                         <div className="flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-md">
                            <span className="text-xs font-bold text-indigo-700 uppercase">Score</span>
                            <span className="text-sm font-bold text-indigo-600">{podcast.badassery_score}</span>
                         </div>
                      </div>

                      <div className="flex items-center gap-4 mt-1 text-sm text-slate-600">
                         <div className="flex items-center gap-1">
                            <Star size={14} className="text-amber-400 fill-amber-400" />
                            <span className="font-semibold text-slate-900">{podcast.apple.rating}</span>
                            <span className="text-slate-400">({podcast.apple.review_count.toLocaleString()})</span>
                         </div>
                         <span className="text-slate-300">|</span>
                         <div className="flex items-center gap-2 text-slate-500 text-xs">
                           {podcast.classification.topics.slice(0, 3).map(t => (
                             <span key={t} className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-medium">{t}</span>
                           ))}
                         </div>
                      </div>
                      
                      {/* Social Icons Row */}
                      <div className="flex items-center gap-4 mt-4">
                         <button className="text-slate-400 hover:text-[#1DA1F2] transition-colors"><Twitter size={18} /></button>
                         <button className="text-slate-400 hover:text-[#E1306C] transition-colors"><Instagram size={18} /></button>
                         <button className={`transition-colors ${podcast.youtube.subscribers > 0 ? 'text-red-500 hover:text-red-600' : 'text-slate-300'}`}><Youtube size={18} /></button>
                         <button className="text-slate-400 hover:text-indigo-600 transition-colors"><Globe size={18} /></button>
                         <button className={`transition-colors ${podcast.contact.email_primary ? 'text-green-500 hover:text-green-600' : 'text-slate-300'}`} title={podcast.contact.email_primary ? "Email verified" : "No email"}><Mail size={18} /></button>
                      </div>
                   </div>

                   {/* Actions Row */}
                   <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                      <button 
                        onClick={() => setSelectedPodcast(podcast)}
                        className="text-sm font-medium text-slate-500 hover:text-slate-800"
                      >
                        View Details
                      </button>
                      
                      <div className="flex gap-2">
                        <button className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm">
                           Ignore
                        </button>
                        <div className="relative group/dropdown">
                          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2">
                             <Plus size={16} /> Add to Client <ChevronDown size={14} />
                          </button>
                          {/* Dropdown visualization */}
                          <div className="absolute right-0 bottom-full mb-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl hidden group-hover/dropdown:block z-10 p-1">
                             <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Select Client</div>
                             <button className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-md">MediVIE Tech</button>
                             <button className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-md">FinStack</button>
                             <div className="border-t border-slate-100 my-1"></div>
                             <button className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-md font-medium">+ New Client</button>
                          </div>
                        </div>
                      </div>
                   </div>
                </div>
              </div>
            ))}
            
            {/* Load More */}
            <div className="pt-2 pb-8 flex justify-center">
               <button className="px-6 py-2.5 bg-white border border-slate-300 text-slate-600 font-medium rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all shadow-sm">
                  Load More Podcasts...
               </button>
            </div>
          </div>
        </div>
      </div>

      {/* Page 3: Podcast Details Modal */}
      <Modal
        isOpen={!!selectedPodcast}
        onClose={() => { setSelectedPodcast(null); setActiveDetailTab('overview'); }}
        title="Podcast Details"
        maxWidth="max-w-4xl"
      >
        {selectedPodcast && (
          <div className="space-y-0">
             {/* Header */}
             <div className="flex items-start justify-between pb-6 border-b border-slate-100">
                <div className="flex gap-6">
                   <img src={selectedPodcast.artwork_url} className="w-24 h-24 rounded-lg shadow-md bg-slate-100" alt="" />
                   <div>
                      <h2 className="text-2xl font-bold text-slate-900">{selectedPodcast.show_name}</h2>
                      <div className="text-slate-600 text-sm mt-1">Host: Guy Raz</div>
                      <div className="flex items-center gap-3 mt-2 text-sm">
                         <div className="flex items-center gap-1 text-amber-500 font-bold">
                            <Star size={14} fill="currentColor" /> {selectedPodcast.apple.rating} <span className="text-slate-400 font-normal">({selectedPodcast.apple.review_count.toLocaleString()} reviews)</span>
                         </div>
                         <span className="text-slate-300">|</span>
                         <div className="text-indigo-600 font-bold">Badassery Score: {selectedPodcast.badassery_score}</div>
                      </div>
                      
                      <div className="flex gap-3 mt-3">
                         <button className="text-slate-400 hover:text-blue-400"><Twitter size={16} /></button>
                         <button className="text-slate-400 hover:text-pink-600"><Instagram size={16} /></button>
                         <button className="text-slate-400 hover:text-red-600"><Youtube size={16} /></button>
                         <button className="text-slate-400 hover:text-indigo-600"><Globe size={16} /></button>
                      </div>
                   </div>
                </div>
                <div className="flex gap-2">
                   <button className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50 flex items-center gap-1">
                      <Edit2 size={12} /> Edit
                   </button>
                   <button className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50 flex items-center gap-1">
                      <Archive size={12} /> Archive
                   </button>
                </div>
             </div>

             {/* Tabs */}
             <div className="flex gap-6 border-b border-slate-200 mb-6">
                {['Overview', 'Episodes', 'Outreach History', 'Activity'].map((tab) => {
                  const id = tab.toLowerCase().split(' ')[0] as any;
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveDetailTab(id)}
                      className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeDetailTab === id 
                          ? 'border-indigo-600 text-indigo-600' 
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {tab}
                    </button>
                  );
                })}
             </div>

             {/* Tab Content */}
             <div className="min-h-[400px]">
                {activeDetailTab === 'overview' && (
                  <div className="space-y-8 animate-in fade-in duration-300">
                     {/* Stats Row */}
                     <div className="grid grid-cols-5 gap-4">
                        {[
                          { label: 'Apple Rating', val: '4.8 ⭐' },
                          { label: 'Apple Reviews', val: '2,340' },
                          { label: 'YouTube Subs', val: '125K' },
                          { label: 'Episodes/Mo', val: '4.2' },
                          { label: 'Avg Length', val: '45 min' },
                        ].map((stat, i) => (
                          <div key={i} className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                             <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">{stat.label}</div>
                             <div className="font-bold text-slate-900">{stat.val}</div>
                          </div>
                        ))}
                     </div>

                     {/* Description */}
                     <div>
                        <h4 className="font-bold text-slate-900 mb-2">Description</h4>
                        <p className="text-sm text-slate-600 leading-relaxed">{selectedPodcast.description}</p>
                     </div>

                     <div className="grid grid-cols-2 gap-8">
                        {/* Topics & Audience */}
                        <div>
                           <h4 className="font-bold text-slate-900 mb-3">Topics & Audience</h4>
                           <div className="space-y-3">
                              <div>
                                 <span className="text-xs font-semibold text-slate-500 uppercase w-16 inline-block">Topics:</span>
                                 <div className="inline-flex gap-2 flex-wrap">
                                    {selectedPodcast.classification.topics.map(t => (
                                       <span key={t} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-medium">{t}</span>
                                    ))}
                                 </div>
                              </div>
                              <div className="text-sm text-slate-600">
                                 <span className="text-xs font-semibold text-slate-500 uppercase w-16 inline-block">Audience:</span>
                                 Founders, Executives, Business Enthusiasts
                              </div>
                              <div className="text-sm text-slate-600">
                                 <span className="text-xs font-semibold text-slate-500 uppercase w-16 inline-block">Style:</span>
                                 Interview
                              </div>
                           </div>
                        </div>

                        {/* Contact */}
                        <div>
                           <h4 className="font-bold text-slate-900 mb-3">Contact</h4>
                           <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-100">
                                 <div className="flex items-center gap-2">
                                    <Mail size={14} className="text-slate-400" />
                                    <span className="text-slate-700">{selectedPodcast.contact.email_primary || 'N/A'}</span>
                                    <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">PRIMARY</span>
                                 </div>
                                 <button className="text-slate-400 hover:text-indigo-600"><Copy size={14} /></button>
                              </div>
                              <div className="flex gap-4 text-xs text-slate-400 mt-2">
                                 <span>Sources:</span>
                                 <span className="flex items-center gap-1 text-green-600"><CheckCircle size={10} /> RSS</span>
                                 <span className="flex items-center gap-1 text-green-600"><CheckCircle size={10} /> Website</span>
                                 <span className="flex items-center gap-1 text-green-600"><CheckCircle size={10} /> Apple</span>
                              </div>
                           </div>
                        </div>
                     </div>

                     <div className="border-t border-slate-100 my-4"></div>

                     {/* Actions */}
                     <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <h4 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
                           <Rocket size={16} /> Actions
                        </h4>
                        <div className="flex justify-between items-center">
                           <div className="flex gap-3 items-center">
                              <select className="bg-white border border-indigo-200 text-indigo-900 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none min-w-[200px]">
                                 <option>Select client...</option>
                                 <option>MediVIE Tech</option>
                                 <option>FinStack</option>
                              </select>
                              <button className="px-4 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100">
                                 + Add to Wishlist
                              </button>
                           </div>
                           <div className="flex gap-2">
                              <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm flex items-center gap-2">
                                 <Rocket size={14} /> Start Outreach
                              </button>
                              <button className="p-2 bg-white border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50">
                                 <Copy size={16} />
                              </button>
                           </div>
                        </div>
                     </div>

                     {/* Outreach History */}
                     <div>
                        <h4 className="font-bold text-slate-900 mb-3">Outreach History</h4>
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                           <table className="w-full text-sm text-left">
                              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                 <tr>
                                    <th className="px-4 py-3">Client</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Last Activity</th>
                                    <th className="px-4 py-3">Result</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                 {outreachItems.filter(i => i.podcast_id === selectedPodcast.id).map(item => (
                                    <tr key={item.id}>
                                       <td className="px-4 py-3 font-medium text-slate-900">{item.client.company_name}</td>
                                       <td className="px-4 py-3">
                                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize
                                             ${item.status === 'recording_scheduled' || item.status === 'recorded' || item.status === 'live' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}
                                          `}>
                                             {item.status.replace(/_/g, ' ')}
                                          </span>
                                       </td>
                                       <td className="px-4 py-3 text-slate-500">{item.last_activity}</td>
                                       <td className="px-4 py-3 text-slate-600">
                                          {item.status === 'live' ? 'Episode aired' : item.status === 'recorded' ? 'Recorded' : 'In Progress'}
                                       </td>
                                    </tr>
                                 ))}
                                 {outreachItems.filter(i => i.podcast_id === selectedPodcast.id).length === 0 && (
                                    <tr>
                                       <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                                          No outreach history yet. Start a campaign!
                                       </td>
                                    </tr>
                                 )}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  </div>
                )}
             </div>
          </div>
        )}
      </Modal>

      {/* Page 4: Add Podcast Modal */}
      <Modal
         isOpen={isAddModalOpen}
         onClose={() => setIsAddModalOpen(false)}
         title="Add Podcast Manually"
         maxWidth="max-w-2xl"
      >
         <div className="space-y-8">
            {/* Option 1 */}
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
               <div className="mb-4">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-1">Option 1: Quick Add via URL</h4>
                  <p className="text-xs text-slate-500">Auto-fetches data from Apple Podcasts or Spotify</p>
               </div>
               <div className="flex gap-2">
                  <input 
                     type="text" 
                     placeholder="https://podcasts.apple.com/us/podcast/..." 
                     className="flex-1 border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                     Fetch Data
                  </button>
               </div>
            </div>

            <div className="relative flex items-center justify-center">
               <div className="absolute border-t border-slate-200 w-full"></div>
               <span className="relative bg-white px-4 text-xs font-medium text-slate-400 uppercase">Or Manual Entry</span>
            </div>

            {/* Option 2 */}
            <div>
               <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Option 2: Manual Entry</h4>
               <div className="grid grid-cols-1 gap-4">
                  <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Show Name *</label>
                     <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Host Name</label>
                        <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Language</label>
                        <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                           <option>English</option>
                           <option>French</option>
                           <option>Spanish</option>
                        </select>
                     </div>
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                     <textarea rows={3} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"></textarea>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Website URL</label>
                        <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label>
                        <input type="email" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                     </div>
                  </div>
                  
                  <div className="flex items-center gap-2 pt-2">
                     <input type="checkbox" id="protected" className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500" />
                     <label htmlFor="protected" className="text-sm text-slate-600">Mark as protected (won't be auto-archived)</label>
                  </div>
               </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
               <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
               <button onClick={() => setIsAddModalOpen(false)} className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 shadow-sm">
                  Save & Queue for Enrichment
               </button>
            </div>
         </div>
      </Modal>
    </div>
  );
};
