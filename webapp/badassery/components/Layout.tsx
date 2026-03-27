import React, { useState } from 'react';
import { LayoutDashboard, Mic, Users, Send, Settings, LogOut, Bell, Menu, ChevronDown, ChevronRight, BarChart3, Activity, Sparkles } from 'lucide-react';
import { User } from '../types';
import { Brooklyn } from './Brooklyn';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  activeTab: string;
  onNavigate: (tab: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  submenu?: Array<{
    id: string;
    label: string;
  }>;
}

export const Layout: React.FC<LayoutProps> = ({ children, user, activeTab, onNavigate }) => {
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    podcasts: true,
    clients: true,
    outreach: true
  });

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'podcasts',
      label: 'Podcasts',
      icon: Mic,
      submenu: [
        { id: 'podcasts', label: 'Search' },
        { id: 'podcasts-new', label: 'Add New' }
      ]
    },
    {
      id: 'clients',
      label: 'Clients',
      icon: Users,
      submenu: [
        { id: 'clients', label: 'All' },
        { id: 'client-onboarding', label: 'Add New' }
      ]
    },
    {
      id: 'outreach',
      label: 'Outreach',
      icon: Send,
      submenu: [
        { id: 'outreach', label: 'Kanban' },
        { id: 'outreach-list', label: 'List' }
      ]
    },
    { id: 'ai-matching', label: 'AI Matching', icon: Sparkles },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'activity', label: 'Activity', icon: Activity }
  ];

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuId]: !prev[menuId]
    }));
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-lg">B</div>
             <span className="font-bold text-xl tracking-tight">BADASSERY</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <div key={item.id} className="space-y-1">
              {/* Main menu item */}
              <button
                onClick={() => {
                  if (item.submenu) {
                    toggleMenu(item.id);
                  } else {
                    onNavigate(item.id);
                  }
                }}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === item.id && !item.submenu
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon size={20} />
                  {item.label}
                </div>
                {item.submenu && (
                  expandedMenus[item.id] ?
                    <ChevronDown size={16} /> :
                    <ChevronRight size={16} />
                )}
              </button>

              {/* Submenu items */}
              {item.submenu && expandedMenus[item.id] && (
                <div className="ml-9 space-y-1">
                  {item.submenu.map(subItem => (
                    <button
                      key={subItem.id}
                      onClick={() => onNavigate(subItem.id)}
                      className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                        activeTab === subItem.id
                          ? 'bg-indigo-600 text-white font-medium'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {subItem.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={() => onNavigate('logout')}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white cursor-pointer rounded-lg hover:bg-slate-800 transition-colors"
          >
            <LogOut size={20} />
            <span className="text-sm font-medium">Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 flex-shrink-0 relative">
          {/* Brooklyn Spider Animation */}
          <div className="absolute inset-0 pointer-events-none z-10">
            <Brooklyn />
          </div>

          <div className="flex items-center gap-4 relative z-20">
            <Menu className="text-slate-400 lg:hidden" />
            {/* More space for Brooklyn! 🕷️ */}
          </div>

          <div className="flex items-center gap-6 relative z-20">
            <button className="relative text-slate-400 hover:text-slate-600">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-slate-900">{user.display_name}</div>
                <div className="text-xs text-slate-500 capitalize">{user.role}</div>
              </div>
              <img src={user.avatar_url} alt={user.display_name} className="w-9 h-9 rounded-full bg-indigo-100 border border-slate-200" />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6 scroll-smooth">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
