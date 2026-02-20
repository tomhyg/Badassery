import React, { useState, useEffect } from 'react';
import { Client, getClientDisplayData } from '../types';
import { getClientById } from '../services/clientService';
import { TrendingUp, Mail, MessageSquare, Calendar, ExternalLink, Sparkles } from 'lucide-react';

interface ClientPortalProps {
  clientId: string;
  mockClient?: Client; // Optional mock client for dev mode
}

interface BookingStatus {
  id: string;
  showName: string;
  showLogo: string;
  topic: string;
  status: 'live' | 'recorded' | 'scheduled' | 'screening';
  statusLabel: string;
  date: string;
  time?: string;
  listenUrl?: string;
}

export const ClientPortal: React.FC<ClientPortalProps> = ({ clientId, mockClient }) => {
  const [client, setClient] = useState<Client | null>(mockClient || null);
  const [loading, setLoading] = useState(!mockClient);

  useEffect(() => {
    // If mockClient is provided, use it (dev mode)
    if (mockClient) {
      setClient(mockClient);
      setLoading(false);
    } else {
      // Otherwise load from Firestore
      loadClient();
    }
  }, [clientId, mockClient]);

  const loadClient = async () => {
    try {
      setLoading(true);
      const data = await getClientById(clientId);
      setClient(data);
    } catch (error) {
      console.error('Error loading client:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
        <div className="text-slate-500">Loading your portal...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
        <div className="text-red-600">Client not found</div>
      </div>
    );
  }

  const displayData = getClientDisplayData(client);

  // Mock data - will be replaced with real data from Firestore
  const stats = {
    podcastsIdentified: 45,
    outreachSent: 23,
    repliesReceived: 8,
    bookedEpisodes: 3
  };

  const bookings: BookingStatus[] = [
    {
      id: '1',
      showName: 'How I Built This',
      showLogo: 'https://picsum.photos/100/100?1',
      topic: 'FDA Journey',
      status: 'live',
      statusLabel: '🎉 LIVE',
      date: 'Jan 20',
      listenUrl: 'https://podcasts.apple.com'
    },
    {
      id: '2',
      showName: 'Health Tech Pod',
      showLogo: 'https://picsum.photos/100/100?2',
      topic: 'Wearables',
      status: 'recorded',
      statusLabel: '🟢 RECORDED',
      date: 'Jan 15'
    },
    {
      id: '3',
      showName: 'Startup FM',
      showLogo: 'https://picsum.photos/100/100?3',
      topic: 'Fundraising',
      status: 'scheduled',
      statusLabel: '🟢 RECORDING SCHEDULED',
      date: 'Feb 15',
      time: '2pm ET'
    },
    {
      id: '4',
      showName: 'French Tech Talk',
      showLogo: 'https://picsum.photos/100/100?4',
      topic: 'Hardware',
      status: 'screening',
      statusLabel: '🟡 SCREENING SCHEDULED',
      date: 'Jan 25',
      time: '10am'
    }
  ];

  const recentUpdates = [
    { date: 'Jan 20', text: 'Your episode on How I Built This is now LIVE!', type: 'success' },
    { date: 'Jan 18', text: 'Recording scheduled with Startup FM for Feb 15', type: 'info' },
    { date: 'Jan 17', text: 'Screening call scheduled with French Tech Talk', type: 'info' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl text-white">
              B
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">BADASSERY</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-900">Welcome, {client.identity?.firstName || 'Guest'}</div>
              <div className="text-xs text-slate-500">{displayData.company_name}</div>
            </div>
            <img
              src={displayData.logo_url}
              alt={displayData.company_name}
              className="w-10 h-10 rounded-full border-2 border-indigo-100"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Campaign Stats */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-6">YOUR PODCAST CAMPAIGN</h1>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              title="Podcasts Identified"
              value={stats.podcastsIdentified}
              icon="🎯"
              color="indigo"
            />
            <StatCard
              title="Outreach Sent"
              value={stats.outreachSent}
              icon="📧"
              color="blue"
            />
            <StatCard
              title="Replies Received"
              value={stats.repliesReceived}
              icon="💬"
              color="green"
            />
            <StatCard
              title="Booked Episodes"
              value={stats.bookedEpisodes}
              icon="🎉"
              color="purple"
            />
          </div>
        </div>

        {/* Bookings */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-4">YOUR BOOKINGS</h2>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Show
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Topic
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={booking.showLogo}
                            alt={booking.showName}
                            className="w-12 h-12 rounded-lg border border-slate-200"
                          />
                          <span className="font-medium text-slate-900">{booking.showName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {booking.topic}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="font-semibold text-sm">
                            {booking.statusLabel}
                          </div>
                          {booking.status === 'live' && booking.listenUrl && (
                            <a
                              href={booking.listenUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1"
                            >
                              🔗 Listen Now
                              <ExternalLink size={14} />
                            </a>
                          )}
                          {booking.status === 'recorded' && (
                            <span className="text-slate-500 text-sm">Awaiting publication</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-slate-900 font-medium">{booking.date}</div>
                        {booking.time && (
                          <div className="text-slate-500 text-sm">{booking.time}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Recent Updates */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">RECENT UPDATES</h2>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-200">
            {recentUpdates.map((update, index) => (
              <div
                key={index}
                className={`px-6 py-4 flex items-start gap-3 ${
                  update.type === 'success' ? 'bg-green-50' : 'bg-blue-50'
                }`}
              >
                <span className="text-2xl">
                  {update.type === 'success' ? '🎉' : '📅'}
                </span>
                <div>
                  <span className="font-semibold text-slate-900">{update.date}</span>
                  <span className="text-slate-700"> - {update.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="mt-8 bg-indigo-50 border border-indigo-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <Sparkles className="text-indigo-600 flex-shrink-0 mt-1" size={20} />
            <div className="text-sm text-indigo-800">
              <p className="font-semibold mb-1">Your Campaign in Action</p>
              <p>
                Our team is actively reaching out to podcasts on your behalf. You'll see updates here as we
                receive responses and schedule interviews. We focus on quality matches that align with your
                expertise and goals.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// Helper component for stat cards
const StatCard: React.FC<{
  title: string;
  value: number;
  icon: string;
  color: 'indigo' | 'blue' | 'green' | 'purple';
}> = ({ title, value, icon, color }) => {
  const colorClasses = {
    indigo: 'from-indigo-50 to-indigo-100 border-indigo-200 text-indigo-700',
    blue: 'from-blue-50 to-blue-100 border-blue-200 text-blue-700',
    green: 'from-green-50 to-green-100 border-green-200 text-green-700',
    purple: 'from-purple-50 to-purple-100 border-purple-200 text-purple-700'
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-6 shadow-sm`}>
      <div className="text-center">
        <div className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
          {title}
        </div>
        <div className="text-4xl font-bold mb-2">{value}</div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  );
};
