import React from 'react';
import { ExternalLink } from 'lucide-react';

interface Props {
  label: string;
  value?: string | number | boolean | null;
  isLink?: boolean;
  mono?: boolean;
  multiline?: boolean;
}

export const ClientInfoField: React.FC<Props> = ({ label, value, isLink, mono, multiline }) => {
  const isEmpty = value === null || value === undefined || value === '';

  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      {isEmpty ? (
        <p className="text-sm text-slate-300">—</p>
      ) : typeof value === 'boolean' ? (
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {value ? 'Yes' : 'No'}
        </span>
      ) : isLink && typeof value === 'string' ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 hover:underline truncate max-w-full"
        >
          <span className="truncate">{value}</span>
          <ExternalLink size={12} className="flex-shrink-0" />
        </a>
      ) : multiline ? (
        <p className={`text-sm text-slate-900 leading-relaxed whitespace-pre-wrap ${mono ? 'font-mono' : ''}`}>{String(value)}</p>
      ) : (
        <p className={`text-sm text-slate-900 truncate ${mono ? 'font-mono' : ''}`}>{String(value)}</p>
      )}
    </div>
  );
};
