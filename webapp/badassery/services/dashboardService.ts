/**
 * ============================================================================
 * DASHBOARD SERVICE
 * ============================================================================
 *
 * Provides calculation functions for dashboard statistics
 * All data is computed from real Firestore data (clients, outreach)
 */

import { Outreach, Client, OutreachStatus } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface DateFilter {
  type: 'today' | 'week' | 'month' | 'year' | 'custom';
  startDate?: Date;
  endDate?: Date;
}

export interface DashboardStats {
  activeClients: number;
  activeOutreach: number;
  awaitingReply: number;
  bookedThisPeriod: number;
}

export interface NeedsAttentionItem {
  text: string;
  type: 'warn' | 'success' | 'info';
  count: number;
}

export interface PipelineStage {
  name: string;
  count: number;
  statuses: OutreachStatus[];
}

export interface RecentActivityItem {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  type: string;
}

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Calculate date range based on filter type
 */
export function getDateRange(filter: DateFilter): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  let start: Date;

  switch (filter.type) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      start = new Date(now);
      start.setDate(now.getDate() - 7);
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'custom':
      start = filter.startDate || new Date(now.getFullYear(), now.getMonth(), 1);
      end.setTime((filter.endDate || now).getTime());
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { start, end };
}

/**
 * Format relative time (e.g., "5m ago", "2h ago", "3d ago")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================================================
// DASHBOARD STATS
// ============================================================================

/**
 * Calculate main dashboard statistics
 */
export function calculateDashboardStats(
  clients: Client[],
  outreach: Outreach[],
  dateFilter: DateFilter
): DashboardStats {
  const { start, end } = getDateRange(dateFilter);

  // Active Clients = clients with status 'active'
  const activeClients = clients.filter(c => c.status === 'active').length;

  // Active Outreach = outreach in active/discovery categories
  const activeStatuses: OutreachStatus[] = [
    'identified', 'ready_for_outreach', '1st_email_sent',
    '1st_followup_sent', '2nd_followup_sent', 'in_contact',
    'scheduling_screening', 'screening_scheduled',
    'scheduling_recording', 'recording_scheduled'
  ];
  const activeOutreach = outreach.filter(o => activeStatuses.includes(o.status)).length;

  // Awaiting Reply = emails sent 5+ days ago without response
  const awaitingStatuses: OutreachStatus[] = ['1st_email_sent', '1st_followup_sent', '2nd_followup_sent'];
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  const awaitingReply = outreach.filter(o => {
    if (!awaitingStatuses.includes(o.status)) return false;
    const lastContact = o.outreach_date?.toDate?.() || o.status_changed_at?.toDate?.();
    return lastContact && lastContact < fiveDaysAgo;
  }).length;

  // Booked = recording_scheduled, recorded, live within the period
  const bookedStatuses: OutreachStatus[] = ['recording_scheduled', 'recorded', 'live'];
  const bookedThisPeriod = outreach.filter(o => {
    if (!bookedStatuses.includes(o.status)) return false;
    const date = o.recording_date?.toDate?.() || o.status_changed_at?.toDate?.();
    return date && date >= start && date <= end;
  }).length;

  return { activeClients, activeOutreach, awaitingReply, bookedThisPeriod };
}

// ============================================================================
// NEEDS ATTENTION
// ============================================================================

/**
 * Calculate items that need attention
 */
export function calculateNeedsAttention(outreach: Outreach[]): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = [];
  const now = new Date();
  const fiveDaysAgo = new Date(now);
  fiveDaysAgo.setDate(now.getDate() - 5);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  // 1. Outreach awaiting reply for 5+ days
  const awaitingStatuses: OutreachStatus[] = ['1st_email_sent', '1st_followup_sent', '2nd_followup_sent'];
  const overdueCount = outreach.filter(o => {
    if (!awaitingStatuses.includes(o.status)) return false;
    const lastContact = o.outreach_date?.toDate?.() || o.status_changed_at?.toDate?.();
    return lastContact && lastContact < fiveDaysAgo;
  }).length;

  if (overdueCount > 0) {
    items.push({
      text: `${overdueCount} outreach awaiting reply for 5+ days`,
      type: 'warn',
      count: overdueCount
    });
  }

  // 2. Follow-ups due today (7 days since last email)
  const dueTodayCount = outreach.filter(o => {
    if (!awaitingStatuses.includes(o.status)) return false;
    const lastContact = o.outreach_date?.toDate?.() || o.status_changed_at?.toDate?.();
    if (!lastContact) return false;
    // Between 7 and 8 days
    const daysDiff = Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff >= 7 && daysDiff < 8;
  }).length;

  if (dueTodayCount > 0) {
    items.push({
      text: `${dueTodayCount} follow-ups due today`,
      type: 'warn',
      count: dueTodayCount
    });
  }

  // 3. Recent replies received (in_contact in last 7 days)
  const inContactCount = outreach.filter(o => {
    if (o.status !== 'in_contact') return false;
    const changedAt = o.status_changed_at?.toDate?.();
    if (!changedAt) return false;
    return changedAt >= sevenDaysAgo;
  }).length;

  if (inContactCount > 0) {
    items.push({
      text: `${inContactCount} new replies received`,
      type: 'success',
      count: inContactCount
    });
  }

  // 4. Upcoming screenings/recordings this week
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 7);

  const upcomingCount = outreach.filter(o => {
    if (!['screening_scheduled', 'recording_scheduled'].includes(o.status)) return false;
    const date = o.status === 'screening_scheduled'
      ? o.screening_call_date?.toDate?.()
      : o.recording_date?.toDate?.();
    if (!date) return false;
    return date >= now && date <= nextWeek;
  }).length;

  if (upcomingCount > 0) {
    items.push({
      text: `${upcomingCount} upcoming calls this week`,
      type: 'info',
      count: upcomingCount
    });
  }

  return items;
}

// ============================================================================
// PIPELINE OVERVIEW
// ============================================================================

/**
 * Calculate pipeline stages for overview chart
 */
export function calculatePipelineData(outreach: Outreach[]): PipelineStage[] {
  return [
    {
      name: 'Ready',
      count: outreach.filter(o => o.status === 'ready_for_outreach').length,
      statuses: ['ready_for_outreach']
    },
    {
      name: 'Pitched',
      count: outreach.filter(o => o.status === '1st_email_sent').length,
      statuses: ['1st_email_sent']
    },
    {
      name: 'Follow-up',
      count: outreach.filter(o => ['1st_followup_sent', '2nd_followup_sent'].includes(o.status)).length,
      statuses: ['1st_followup_sent', '2nd_followup_sent']
    },
    {
      name: 'Contact',
      count: outreach.filter(o => ['in_contact', 'scheduling_screening', 'screening_scheduled'].includes(o.status)).length,
      statuses: ['in_contact', 'scheduling_screening', 'screening_scheduled']
    },
    {
      name: 'Booked',
      count: outreach.filter(o => ['scheduling_recording', 'recording_scheduled', 'recorded', 'live'].includes(o.status)).length,
      statuses: ['scheduling_recording', 'recording_scheduled', 'recorded', 'live']
    },
  ];
}

// ============================================================================
// RECENT ACTIVITY
// ============================================================================

/**
 * Map outreach status to action label
 */
function getActionFromStatus(status: OutreachStatus): { label: string; type: string } {
  const mapping: Record<string, { label: string; type: string }> = {
    'identified': { label: 'IDENTIFIED', type: 'system' },
    'ready_for_outreach': { label: 'READY', type: 'system' },
    '1st_email_sent': { label: 'PITCHED', type: 'email' },
    '1st_followup_sent': { label: 'FOLLOW-UP', type: 'email' },
    '2nd_followup_sent': { label: 'FOLLOW-UP', type: 'email' },
    'in_contact': { label: 'REPLY', type: 'status' },
    'scheduling_screening': { label: 'SCREENING', type: 'status' },
    'screening_scheduled': { label: 'SCREENING', type: 'status' },
    'scheduling_recording': { label: 'BOOKING', type: 'status' },
    'recording_scheduled': { label: 'BOOKED', type: 'status' },
    'recorded': { label: 'RECORDED', type: 'status' },
    'live': { label: 'LIVE', type: 'status' },
    'declined_by_host': { label: 'DECLINED', type: 'system' },
    'no_response': { label: 'NO RESPONSE', type: 'system' },
    'blacklist': { label: 'BLACKLISTED', type: 'system' },
  };
  return mapping[status] || { label: status.toUpperCase().replace(/_/g, ' '), type: 'system' };
}

/**
 * Generate recent activity from outreach changes
 */
export function generateRecentActivity(outreach: Outreach[], limit: number = 5): RecentActivityItem[] {
  // Sort by last modification date
  const sorted = [...outreach]
    .filter(o => o.status_changed_at || o.updatedAt)
    .sort((a, b) => {
      const dateA = a.status_changed_at?.toDate?.() || a.updatedAt?.toDate?.() || new Date(0);
      const dateB = b.status_changed_at?.toDate?.() || b.updatedAt?.toDate?.() || new Date(0);
      return dateB.getTime() - dateA.getTime();
    })
    .slice(0, limit);

  return sorted.map(o => {
    const date = o.status_changed_at?.toDate?.() || o.updatedAt?.toDate?.() || new Date();
    const action = getActionFromStatus(o.status);

    return {
      id: o.id,
      action: action.label,
      description: `${o.podcast_name || 'Unknown Podcast'} - ${o.client_name || 'Unknown Client'}`,
      timestamp: formatRelativeTime(date),
      type: action.type
    };
  });
}

/**
 * Get date filter label for display
 */
export function getDateFilterLabel(filterType: DateFilter['type']): string {
  const labels: Record<DateFilter['type'], string> = {
    'today': 'Today',
    'week': 'Week',
    'month': 'Month',
    'year': 'Year',
    'custom': 'Custom'
  };
  return labels[filterType] || 'Month';
}
