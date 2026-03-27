import React, { useState, useEffect, useMemo } from 'react';
import { ActivityLog, Client, Outreach } from '../types';
import { Mail, Clock, Users, Trophy, AlertTriangle, CheckCircle, Calendar, Send, Loader2 } from 'lucide-react';
import { getAllOutreachV2Cached } from '../services/outreachServiceV2';
import {
  calculateDashboardStats,
  calculateNeedsAttention,
  calculatePipelineData,
  generateRecentActivity,
  getDateFilterLabel,
  DateFilter
} from '../services/dashboardService';

interface DashboardProps {
  clients: Client[];
  logs: ActivityLog[];
  onNavigate: (tab: string) => void;
}

type DateFilterType = 'today' | 'week' | 'month' | 'year' | 'custom';

export const Dashboard: React.FC<DashboardProps> = ({ clients, logs, onNavigate }) => {
  // Date filter state
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('month');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Outreach data state
  const [outreach, setOutreach] = useState<Outreach[]>([]);
  const [loading, setLoading] = useState(true);

  // Load outreach data on mount
  useEffect(() => {
    loadOutreach();
  }, []);

  const loadOutreach = async () => {
    try {
      setLoading(true);
      const data = await getAllOutreachV2Cached();
      setOutreach(data);
    } catch (error) {
      console.error('Error loading outreach:', error);
    } finally {
      setLoading(false);
    }
  };

  // Build date filter object
  const dateFilter: DateFilter = useMemo(() => ({
    type: dateFilterType,
    startDate: customStartDate ? new Date(customStartDate) : undefined,
    endDate: customEndDate ? new Date(customEndDate) : undefined,
  }), [dateFilterType, customStartDate, customEndDate]);

  // Calculate all stats from real data
  const stats = useMemo(() =>
    calculateDashboardStats(clients, outreach, dateFilter),
    [clients, outreach, dateFilter]
  );

  const needsAttention = useMemo(() =>
    calculateNeedsAttention(outreach),
    [outreach]
  );

  const pipelineData = useMemo(() =>
    calculatePipelineData(outreach),
    [outreach]
  );

  const recentActivity = useMemo(() =>
    generateRecentActivity(outreach, 5),
    [outreach]
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <div className="flex items-center gap-3">
          {/* Date Filter */}
          <select
            value={dateFilterType}
            onChange={(e) => setDateFilterType(e.target.value as DateFilterType)}
            className="text-sm font-medium text-slate-600 bg-white px-3 py-1.5 rounded-md shadow-sm border border-slate-200 cursor-pointer"
          >
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>

          {/* Custom Date Range */}
          {dateFilterType === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="text-sm px-2 py-1.5 border border-slate-200 rounded-md"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="text-sm px-2 py-1.5 border border-slate-200 rounded-md"
              />
            </div>
          )}

          {/* Today's Date */}
          <div className="text-sm font-medium text-slate-500 bg-white px-3 py-1.5 rounded-md shadow-sm border border-slate-200">
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          <span className="ml-2 text-slate-600">Loading dashboard data...</span>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Clients', val: stats.activeClients, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', nav: 'clients' },
          { label: 'Active Outreach', val: stats.activeOutreach, icon: Mail, color: 'text-indigo-600', bg: 'bg-indigo-50', nav: 'outreach-kanban' },
          { label: 'Awaiting Reply', val: stats.awaitingReply, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', nav: 'outreach-kanban' },
          { label: `Booked (${getDateFilterLabel(dateFilterType)})`, val: stats.bookedThisPeriod, icon: Trophy, color: 'text-green-600', bg: 'bg-green-50', nav: 'outreach-kanban' },
        ].map((stat, i) => (
          <div
            key={i}
            onClick={() => onNavigate(stat.nav)}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
          >
            <div>
              <div className="text-slate-500 text-sm font-medium mb-1">{stat.label}</div>
              <div className="text-3xl font-bold text-slate-900">
                {loading ? '-' : stat.val}
              </div>
            </div>
            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon size={24} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Needs Attention */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Needs Attention
            </h2>
          </div>
          <div className="p-6 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : needsAttention.length > 0 ? (
              needsAttention.map((item, i) => (
                <div
                  key={i}
                  onClick={() => onNavigate('outreach-kanban')}
                  className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                    item.type === 'warn' ? 'bg-amber-50 border-amber-100 hover:bg-amber-100' :
                    item.type === 'success' ? 'bg-green-50 border-green-100 hover:bg-green-100' :
                    'bg-blue-50 border-blue-100 hover:bg-blue-100'
                  }`}
                >
                  {item.type === 'warn' ? (
                    <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
                  ) : item.type === 'success' ? (
                    <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={18} />
                  ) : (
                    <Calendar className="text-blue-500 flex-shrink-0 mt-0.5" size={18} />
                  )}
                  <span className={`text-sm font-medium ${
                    item.type === 'warn' ? 'text-amber-900' :
                    item.type === 'success' ? 'text-green-900' :
                    'text-blue-900'
                  }`}>
                    {item.text}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center text-slate-400 py-8">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                <p>All caught up! No items need attention.</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-lg font-bold text-slate-900">Recent Activity</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : recentActivity.length > 0 ? (
              recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  onClick={() => onNavigate('outreach-kanban')}
                  className="p-4 flex items-start gap-4 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    activity.action === 'BOOKED' || activity.action === 'RECORDED' || activity.action === 'LIVE' ? 'bg-green-100 text-green-600' :
                    activity.action === 'REPLY' ? 'bg-blue-100 text-blue-600' :
                    activity.action === 'PITCHED' || activity.action === 'FOLLOW-UP' ? 'bg-indigo-100 text-indigo-600' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {activity.action === 'BOOKED' || activity.action === 'RECORDED' || activity.action === 'LIVE' ? (
                      <Trophy size={14} />
                    ) : activity.action === 'REPLY' ? (
                      <Mail size={14} />
                    ) : (
                      <Send size={14} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        activity.action === 'BOOKED' || activity.action === 'RECORDED' || activity.action === 'LIVE' ? 'bg-green-100 text-green-700' :
                        activity.action === 'REPLY' ? 'bg-blue-100 text-blue-700' :
                        activity.action === 'PITCHED' || activity.action === 'FOLLOW-UP' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>{activity.action}</span>
                      <span className="text-xs text-slate-400 font-medium">{activity.timestamp}</span>
                    </div>
                    <p className="text-sm text-slate-700 font-medium truncate">{activity.description}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-slate-400 py-8">
                <Mail className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p>No recent activity yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pipeline Overview */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-6">Pipeline Overview</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="relative pt-6 pb-2">
            <div className="flex justify-between text-sm font-medium text-slate-600 mb-2 px-4">
              {pipelineData.map(d => (
                <div key={d.name} className="flex flex-col items-center gap-1">
                  <span>{d.name}</span>
                  <span className="text-lg font-bold text-slate-900">({d.count})</span>
                </div>
              ))}
            </div>

            <div className="h-4 flex rounded-full overflow-hidden w-full bg-slate-100">
              {pipelineData.map((d, i) => {
                const total = pipelineData.reduce((acc, curr) => acc + curr.count, 0);
                const width = total > 0 ? (d.count / total) * 100 : 20;
                const colors = ['bg-slate-400', 'bg-blue-500', 'bg-indigo-500', 'bg-amber-500', 'bg-green-500'];
                return (
                  <div
                    key={d.name}
                    style={{ width: `${width}%` }}
                    className={`${colors[i]} h-full border-r border-white last:border-0 transition-all duration-300`}
                  />
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex justify-center gap-4 mt-4 text-xs text-slate-500">
              {pipelineData.map((d, i) => {
                const colors = ['bg-slate-400', 'bg-blue-500', 'bg-indigo-500', 'bg-amber-500', 'bg-green-500'];
                return (
                  <div key={d.name} className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${colors[i]}`} />
                    <span>{d.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
