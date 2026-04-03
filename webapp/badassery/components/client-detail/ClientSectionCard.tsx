import React from 'react';

type Accent = 'indigo' | 'teal' | 'violet' | 'amber' | 'rose' | 'default';

interface Props {
  title: string;
  children: React.ReactNode;
  accent?: Accent;
  headerRight?: React.ReactNode;
}

const ACCENT: Record<Accent, string> = {
  indigo:  'from-indigo-50 to-slate-50',
  teal:    'from-teal-50 to-cyan-50',
  violet:  'from-violet-50 to-indigo-50',
  amber:   'from-amber-50 to-yellow-50',
  rose:    'from-rose-50 to-pink-50',
  default: 'from-slate-50 to-white',
};

export const ClientSectionCard: React.FC<Props> = ({ title, children, accent = 'default', headerRight }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div className={`px-6 py-4 bg-gradient-to-r ${ACCENT[accent]} border-b border-slate-100 flex items-center justify-between`}>
      <h2 className="font-bold text-slate-900 text-base">{title}</h2>
      {headerRight}
    </div>
    <div className="p-6">{children}</div>
  </div>
);
