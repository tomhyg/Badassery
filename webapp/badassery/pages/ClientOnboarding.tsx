
import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, X, Bot } from 'lucide-react';

interface ClientOnboardingProps {
  onBack: () => void;
  onComplete: () => void;
}

export const ClientOnboarding: React.FC<ClientOnboardingProps> = ({ onBack, onComplete }) => {
  const [step, setStep] = useState(2); // Start at Step 2 as per prompt

  return (
    <div className="max-w-4xl mx-auto py-8">
       {/* Header / Progress */}
       <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
             <h1 className="text-2xl font-bold text-slate-900">Client Onboarding</h1>
             <span className="text-sm font-medium text-slate-500">Step 2 of 4</span>
          </div>
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-2">
             <div className="bg-indigo-600 h-full w-1/2 rounded-full"></div>
          </div>
          <div className="flex justify-between text-xs font-medium text-slate-500 uppercase tracking-wide">
             <span className="text-indigo-600">Company Info</span>
             <span className="text-indigo-600">Spokesperson</span>
             <span>Podcast Preferences</span>
             <span>Review</span>
          </div>
       </div>

       {/* Step 2 Content */}
       <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
          <div className="mb-8">
             <h2 className="text-lg font-bold text-slate-900 mb-1">Step 2: Spokesperson Profile</h2>
             <p className="text-slate-500 text-sm">Who will be the podcast guest?</p>
          </div>

          <div className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                   <input type="text" defaultValue="Neil Gupta" className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                   <input type="text" defaultValue="CEO & Co-founder" className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
             </div>

             <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">LinkedIn URL</label>
                <input type="text" defaultValue="https://linkedin.com/in/neilgupta" className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
             </div>

             <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Short Bio (for pitches) *</label>
                <div className="relative">
                   <textarea 
                     rows={4} 
                     className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                     defaultValue="Neil is the CEO of MediVIE Tech, developing PULSAR - the first continuous blood pressure monitoring wearable for hospitals. Previously led safety systems at TORC Robotics."
                   />
                   <button className="absolute bottom-3 right-3 text-indigo-600 text-xs font-medium flex items-center gap-1 hover:bg-indigo-50 px-2 py-1 rounded">
                      <Bot size={14} /> Help me
                   </button>
                </div>
             </div>

             <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">Expertise Topics * (select all that apply)</label>
                <div className="flex flex-wrap gap-3 mb-3">
                   {['Medical Devices', 'Startups', 'HealthTech', 'Regulatory/FDA'].map(t => (
                      <label key={t} className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 cursor-pointer">
                         <input type="checkbox" defaultChecked className="text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                         <span className="text-sm font-medium text-indigo-900">{t}</span>
                      </label>
                   ))}
                   {['Fundraising', 'AI/ML', 'Leadership', 'Product Dev', 'Marketing'].map(t => (
                      <label key={t} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                         <input type="checkbox" className="text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                         <span className="text-sm font-medium text-slate-700">{t}</span>
                      </label>
                   ))}
                </div>
                <input type="text" placeholder="+ Add custom topic" className="bg-transparent text-sm border-b border-dashed border-slate-300 py-1 focus:outline-none focus:border-indigo-500 w-48 text-slate-600" />
             </div>

             <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">Unique Angles * (what makes them stand out?)</label>
                <div className="space-y-2">
                   {[
                      'Building FDA-approved wearables from France',
                      'Journey from automotive to medtech',
                      'Clinical validation with 50+ patients'
                   ].map((angle, i) => (
                      <div key={i} className="flex items-center gap-2">
                         <input type="text" defaultValue={angle} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                         <button className="text-slate-400 hover:text-red-500"><X size={16} /></button>
                      </div>
                   ))}
                   <div className="flex items-center gap-2">
                      <input type="text" placeholder="+ Add angle" className="flex-1 bg-white border border-dashed border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                   </div>
                </div>
             </div>

             <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">Sample Interview Questions (optional)</label>
                 <div className="space-y-2">
                   {[
                      'How do you navigate FDA approval as a European startup?',
                      "What's different about hardware vs software startups?"
                   ].map((q, i) => (
                      <div key={i} className="flex items-center gap-2">
                         <input type="text" defaultValue={q} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                         <button className="text-slate-400 hover:text-red-500"><X size={16} /></button>
                      </div>
                   ))}
                   <div className="flex items-center gap-2">
                      <input type="text" placeholder="+ Add question" className="flex-1 bg-white border border-dashed border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                   </div>
                </div>
             </div>
          </div>

          <div className="flex justify-between items-center mt-12 pt-6 border-t border-slate-100">
             <button onClick={onBack} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm">
                <ArrowLeft size={16} /> Back
             </button>
             <button onClick={onComplete} className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm">
                Next Step <ArrowRight size={16} />
             </button>
          </div>
       </div>
    </div>
  );
};
