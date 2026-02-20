import React, { useState } from 'react';
import { User, UserRole, Client } from '../types';
import { Shield, ChevronDown, ChevronRight } from 'lucide-react';

interface DevRoleSwitcherProps {
  currentUser: User;
  onSwitchRole: (newRole: UserRole, clientId?: string) => void;
  availableClients: Client[];
}

export const DevRoleSwitcher: React.FC<DevRoleSwitcherProps> = ({ currentUser, onSwitchRole, availableClients }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showClientsList, setShowClientsList] = useState(false);

  const roles: { role: UserRole; label: string; emoji: string }[] = [
    { role: 'admin', label: 'Admin (Ruth)', emoji: '👑' },
    { role: 'employee', label: 'Employee', emoji: '👔' },
    { role: 'client', label: 'Client', emoji: '👤' }
  ];

  const currentRoleData = roles.find(r => r.role === currentUser.role) || roles[0];

  // Get current client name if user is a client
  const getCurrentClientName = () => {
    if (currentUser.role === 'client') {
      const client = availableClients.find(c => c.id === currentUser.id);
      if (client) {
        return client.contact_name || client.identity?.firstName + ' ' + client.identity?.lastName || 'Client';
      }
    }
    return currentRoleData.label;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-slate-900 text-white rounded-lg shadow-2xl border-2 border-yellow-400">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-4 py-3 hover:bg-slate-800 transition-colors rounded-lg"
        >
          <Shield size={18} className="text-yellow-400" />
          <div className="text-left">
            <div className="text-xs text-slate-400 uppercase tracking-wide">Dev Mode</div>
            <div className="text-sm font-semibold">
              {currentRoleData.emoji} {getCurrentClientName()}
            </div>
          </div>
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div className="border-t border-slate-700 p-2 max-h-96 overflow-y-auto">
            <div className="text-xs text-yellow-400 px-2 py-1 mb-1 font-semibold">
              Switch Role:
            </div>
            {roles.map((roleData) => (
              <div key={roleData.role}>
                {roleData.role === 'client' ? (
                  <>
                    <button
                      onClick={() => setShowClientsList(!showClientsList)}
                      className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                        currentUser.role === roleData.role
                          ? 'bg-indigo-600 text-white font-semibold'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <span>{roleData.emoji}</span>
                      <span>{roleData.label}</span>
                      <ChevronRight
                        size={14}
                        className={`ml-auto transition-transform ${showClientsList ? 'rotate-90' : ''}`}
                      />
                    </button>
                    {showClientsList && (
                      <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-700 pl-2">
                        {availableClients.map((client) => {
                          const clientName = client.contact_name ||
                            (client.identity?.firstName + ' ' + client.identity?.lastName) ||
                            'Unknown Client';
                          const companyName = client.company_name || client.identity?.company || '';

                          return (
                            <button
                              key={client.id}
                              onClick={() => {
                                onSwitchRole('client', client.id);
                                setIsOpen(false);
                                setShowClientsList(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded text-xs flex flex-col gap-0.5 transition-colors ${
                                currentUser.role === 'client' && currentUser.id === client.id
                                  ? 'bg-indigo-700 text-white font-semibold'
                                  : 'hover:bg-slate-800 text-slate-300'
                              }`}
                            >
                              <span className="font-medium">{clientName}</span>
                              {companyName && (
                                <span className="text-slate-400 text-xs">{companyName}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() => {
                      onSwitchRole(roleData.role);
                      setIsOpen(false);
                      setShowClientsList(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                      currentUser.role === roleData.role
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <span>{roleData.emoji}</span>
                    <span>{roleData.label}</span>
                    {currentUser.role === roleData.role && (
                      <span className="ml-auto text-xs">✓</span>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 text-center">
        <div className="inline-block bg-yellow-400 text-slate-900 px-3 py-1 rounded-full text-xs font-bold shadow-lg">
          🚧 DEV ONLY
        </div>
      </div>
    </div>
  );
};
