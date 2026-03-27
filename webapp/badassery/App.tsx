
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Podcasts } from './pages/Podcasts';
import { PodcastsReal } from './pages/PodcastsReal';
import { Clients } from './pages/Clients';
import { ClientDetailNew } from './pages/ClientDetailNew';
import { ClientOnboardingNew } from './pages/ClientOnboardingNew';
import { OutreachBoard } from './pages/Outreach';
import { OutreachList } from './pages/OutreachList';
import { OutreachKanban } from './pages/OutreachKanban';
import { Settings } from './pages/SettingsNew';
import { FirestoreDebug } from './pages/FirestoreDebug';
import { ClientPortal } from './pages/ClientPortal';
import { ChangePassword } from './pages/ChangePassword';
import { Login } from './pages/Login';
import { ClientLogin } from './pages/ClientLogin';
import { AIMatching } from './pages/AIMatching';
import { TestDataGenerator } from './pages/TestDataGenerator';
import { DevRoleSwitcher } from './components/DevRoleSwitcher';
import { currentUser as initialUser, podcasts, clients, outreachItems, activityLogs } from './services/mockData';
import { getCurrentUser, clearCurrentUser, User as ServiceUser, setCurrentUser as persistUser } from './services/userService';
import { UserRole, User } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  // Expose setActiveTab to window for console access (dev only)
  if (typeof window !== 'undefined') {
    (window as any).setActiveTab = setActiveTab;
  }
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [currentUser, setCurrentUser] = useState<User>(initialUser);
  const [loginMode, setLoginMode] = useState<'admin' | 'client'>('admin');
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Check for existing login on mount
  useEffect(() => {
    const savedUser = getCurrentUser();
    if (savedUser) {
      setCurrentUser({
        id: savedUser.id,
        display_name: savedUser.display_name,
        role: savedUser.role as UserRole,
        avatar_url: savedUser.avatar_url || 'https://i.pravatar.cc/150?u=user'
      });
      setMustChangePassword(savedUser.must_change_password ?? false);
      setIsAuthenticated(true);
    }
    setIsCheckingAuth(false);
  }, []);

  // Handle successful login
  const handleLoginSuccess = (user: ServiceUser) => {
    setCurrentUser({
      id: user.id,
      display_name: user.display_name,
      role: user.role as UserRole,
      avatar_url: user.avatar_url || 'https://i.pravatar.cc/150?u=user'
    });
    setMustChangePassword(user.must_change_password ?? false);
    setIsAuthenticated(true);
  };

  // Handle successful client login
  const handleClientLoginSuccess = (user: ServiceUser, clientId: string) => {
    setCurrentUser({
      id: clientId, // Use actual client ID for portal
      display_name: user.display_name,
      role: 'client' as UserRole,
      avatar_url: user.avatar_url || 'https://i.pravatar.cc/150?u=client'
    });
    setIsAuthenticated(true);
  };

  // Handle logout
  const handleLogout = () => {
    clearCurrentUser();
    setIsAuthenticated(false);
    setCurrentUser(initialUser);
    setActiveTab('dashboard');
  };

  // Handle role switching (dev mode only)
  const handleSwitchRole = (newRole: UserRole, clientId?: string) => {
    if (newRole === 'client') {
      // Switch to selected client user
      const selectedClient = clients.find(c => c.id === clientId);
      if (selectedClient) {
        const clientName = selectedClient.contact_name ||
          (selectedClient.identity?.firstName + ' ' + selectedClient.identity?.lastName) ||
          'Client';
        setCurrentUser({
          id: selectedClient.id || 'client_unknown',
          display_name: clientName,
          role: 'client',
          avatar_url: selectedClient.logo_url || selectedClient.links?.headshot || 'https://i.pravatar.cc/150?u=client'
        });
      }
    } else {
      // Switch to admin/employee
      setCurrentUser({
        id: 'user_1',
        display_name: 'Ruth',
        role: newRole,
        avatar_url: 'https://i.pravatar.cc/150?u=ruth'
      });
    }
    // Reset navigation when switching roles
    setActiveTab('dashboard');
    setSelectedClientId(null);
  };

  // Show loading while checking auth
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    if (loginMode === 'client') {
      return (
        <ClientLogin
          onLoginSuccess={handleClientLoginSuccess}
          onSwitchToAdmin={() => setLoginMode('admin')}
        />
      );
    }
    return (
      <Login
        onLoginSuccess={handleLoginSuccess}
        onSwitchToClient={() => setLoginMode('client')}
      />
    );
  }

  // Viewer role: only shows Podcasts page, with optional password change on first login
  if (currentUser.role === 'viewer') {
    if (mustChangePassword) {
      return (
        <ChangePassword
          userId={currentUser.id}
          displayName={currentUser.display_name}
          onComplete={() => setMustChangePassword(false)}
        />
      );
    }
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Minimal top bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-purple-700">Badassery</span>
            <span className="text-slate-400 text-sm">/ Podcasts</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{currentUser.display_name}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-red-600 transition-colors"
            >
              Log out
            </button>
          </div>
        </header>
        <PodcastsReal />
      </div>
    );
  }

  // Role-based rendering: If user is a client, show only the client portal
  if (currentUser.role === 'client') {
    // Find the mock client for dev mode
    const mockClient = clients.find(c => c.id === currentUser.id);

    return (
      <>
        <ClientPortal clientId={currentUser.id} mockClient={mockClient} />
        <DevRoleSwitcher currentUser={currentUser} onSwitchRole={handleSwitchRole} availableClients={clients} />
      </>
    );
  }

  // Admin/Employee view (full access)
  const handleNavigate = (tab: string) => {
    if (tab === 'logout') {
      handleLogout();
      return;
    }
    setActiveTab(tab);
    // Reset selection when changing main tabs unless navigating specifically
    if (tab !== 'client-detail' && tab !== 'client-onboarding') {
        setSelectedClientId(null);
    }
  };

  const handleClientClick = (id: string) => {
      setSelectedClientId(id);
      setActiveTab('client-detail');
  };

  const handleNewClientClick = () => {
      setActiveTab('client-onboarding');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard clients={clients} logs={activityLogs} onNavigate={handleNavigate} />;

      // Podcasts routes
      case 'podcasts':
        return <PodcastsReal />;
      case 'podcasts-new':
        return <div className="p-6"><h1 className="text-2xl font-bold">Add New Podcast (Coming Soon)</h1></div>;

      // Clients routes
      case 'clients':
        return (
            <Clients
                onClientClick={handleClientClick}
                onNewClientClick={handleNewClientClick}
            />
        );
      case 'client-detail':
        if (!selectedClientId) return <Clients onClientClick={handleClientClick} onNewClientClick={handleNewClientClick} />;
        return <ClientDetailNew clientId={selectedClientId} onBack={() => setActiveTab('clients')} />;
      case 'client-onboarding':
        return <ClientOnboardingNew onBack={() => setActiveTab('clients')} onComplete={() => setActiveTab('clients')} />;

      // Outreach routes
      case 'outreach':
        return <OutreachKanban />;
      case 'outreach-list':
        return <OutreachList />;
      case 'outreach-board':
        return <OutreachBoard items={outreachItems} />;
      case 'outreach-kanban':
        return <OutreachKanban />;

      // AI Matching route
      case 'ai-matching':
        return <AIMatching />;

      // Reports route
      case 'reports':
        return <div className="p-6"><h1 className="text-2xl font-bold">Reports (Coming Soon)</h1></div>;

      // Activity route
      case 'activity':
        return <div className="p-6"><h1 className="text-2xl font-bold">Activity Logs (Coming Soon)</h1></div>;

      // Settings & Debug
      case 'settings':
        return <Settings onNavigate={handleNavigate} />;
      case 'debug':
        return <FirestoreDebug />;
      case 'test-data':
        return <TestDataGenerator />;

      default:
        return <Dashboard clients={clients} logs={activityLogs} onNavigate={handleNavigate} />;
    }
  };

  return (
    <>
      <Layout user={currentUser} activeTab={activeTab.startsWith('client') ? 'clients' : activeTab} onNavigate={handleNavigate}>
        {renderContent()}
      </Layout>
      <DevRoleSwitcher currentUser={currentUser} onSwitchRole={handleSwitchRole} availableClients={clients} />
    </>
  );
};

export default App;
