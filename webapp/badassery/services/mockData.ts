
import { Client, Podcast, Outreach, ActivityLog, User } from '../types';

// Current logged-in user (can be switched to test different roles)
export const currentUser: User = {
  id: 'user_1',
  display_name: 'Ruth',
  role: 'admin', // Change to 'client' to test client portal
  avatar_url: 'https://i.pravatar.cc/150?u=ruth'
};

// Mock client user for testing client portal
export const clientUser: User = {
  id: 'client_1', // This ID matches the client_1 in the clients array
  display_name: 'Neil Gupta',
  role: 'client',
  avatar_url: 'https://i.pravatar.cc/150?u=neil'
};

export const podcasts: Podcast[] = [
  {
    id: 'pod_1',
    title: 'How I Built This',
    show_name: 'How I Built This',
    description: 'Guy Raz dives into the stories behind some of the world\'s best known companies. How I Built This weaves a narrative journey about innovators, entrepreneurs and idealists—and the movements they built.',
    imageUrl: 'https://picsum.photos/200/200?random=1',
    artwork_url: 'https://picsum.photos/200/200?random=1',
    language: 'en',
    badassery_score: 9.2,
    apple: { rating: 4.8, review_count: 2340 },
    youtube: { subscribers: 125000 },
    classification: { topics: ['Entrepreneurship', 'Business', 'Stories', 'Leadership'] },
    contact: { email_primary: 'howibuiltthis@npr.org' }
  },
  {
    id: 'pod_2',
    title: 'The Daily',
    show_name: 'The Daily',
    description: 'This is what the news should sound like. The biggest stories of our time.',
    imageUrl: 'https://picsum.photos/200/200?random=2',
    artwork_url: 'https://picsum.photos/200/200?random=2',
    language: 'en',
    badassery_score: 8.9,
    apple: { rating: 4.6, review_count: 50000 },
    youtube: { subscribers: 50000 },
    classification: { topics: ['News', 'Politics', 'Society'] },
    contact: { email_primary: null }
  },
  {
    id: 'pod_3',
    title: 'Indie Hackers',
    show_name: 'Indie Hackers',
    description: 'Courtland Allen interviews the ambitious indie hackers who are turning their ideas into profitable online businesses.',
    imageUrl: 'https://picsum.photos/200/200?random=3',
    artwork_url: 'https://picsum.photos/200/200?random=3',
    language: 'en',
    badassery_score: 8.5,
    apple: { rating: 4.9, review_count: 890 },
    youtube: { subscribers: 12000 },
    classification: { topics: ['SaaS', 'Coding', 'Startups'] },
    contact: { email_primary: 'courtland@indiehackers.com' }
  },
  {
    id: 'pod_4',
    title: 'My First Million',
    show_name: 'My First Million',
    description: 'Brainstorming new business ideas based on trends and opportunities.',
    imageUrl: 'https://picsum.photos/200/200?random=4',
    artwork_url: 'https://picsum.photos/200/200?random=4',
    language: 'en',
    badassery_score: 9.0,
    apple: { rating: 4.8, review_count: 3100 },
    youtube: { subscribers: 250000 },
    classification: { topics: ['Business', 'Ideas', 'Trends'] },
    contact: { email_primary: 'sam@thehustle.co' }
  },
  {
      id: 'pod_5',
      title: 'Health Tech Podcast',
      show_name: 'Health Tech Podcast',
      description: 'Covering the latest in health technology and innovation.',
      imageUrl: 'https://picsum.photos/200/200?random=5',
      artwork_url: 'https://picsum.photos/200/200?random=5',
      language: 'en',
      badassery_score: 8.8,
      apple: { rating: 4.5, review_count: 560 },
      youtube: { subscribers: 5000 },
      classification: { topics: ['Health', 'Technology', 'Innovation'] },
      contact: { email_primary: 'hello@healthtech.com' }
  }
];

export const clients: Client[] = [
  {
    id: 'client_1',
    company_name: 'MediVIE Tech',
    contact_name: 'Neil Gupta',
    email: 'neil@medivie.tech',
    phone: '+33 6 12 34 56 78',
    industry: 'HealthTech',
    logo_url: 'https://picsum.photos/100/100?random=10',
    status: 'active',
    stats: { matches: 45, total_outreach_started: 23, total_bookings: 3 },
    spokesperson: { 
        name: 'Neil Gupta', 
        title: 'CEO & Co-founder',
        bio: 'Neil is the CEO of MediVIE Tech, developing PULSAR - the first continuous blood pressure monitoring wearable for hospitals. Previously led safety systems at TORC Robotics.',
        topics: ['Medical Devices', 'Startups', 'Regulatory/FDA', 'HealthTech'],
        unique_angles: [
            'Building FDA-approved wearables from France',
            'Journey from automotive to medtech',
            'Clinical validation with 50+ patients'
        ]
    }
  },
  {
    id: 'client_2',
    company_name: 'TechStartup X',
    contact_name: 'Jane Doe',
    email: 'jane@techstartup.x',
    industry: 'SaaS',
    logo_url: 'https://picsum.photos/100/100?random=13',
    status: 'active',
    stats: { matches: 32, total_outreach_started: 15, total_bookings: 1 },
    spokesperson: { name: 'Jane Doe', title: 'Founder' }
  },
  {
    id: 'client_3',
    company_name: 'FinStack',
    contact_name: 'Sarah Chen',
    industry: 'Fintech',
    logo_url: 'https://picsum.photos/100/100?random=11',
    status: 'onboarding',
    stats: { matches: 0, total_outreach_started: 0, total_bookings: 0 },
    spokesperson: { name: 'Sarah Chen', title: 'CTO' }
  },
  {
    id: 'client_4',
    company_name: 'OldClient Co',
    contact_name: 'Bob Wilson',
    industry: 'Retail',
    logo_url: 'https://picsum.photos/100/100?random=14',
    status: 'paused',
    stats: { matches: 28, total_outreach_started: 20, total_bookings: 2 },
    spokesperson: { name: 'Bob Wilson', title: 'VP Sales' }
  }
];

export const outreachItems: Outreach[] = [
  {
    id: 'out_1',
    client_id: 'client_1',
    podcast_id: 'pod_1',
    status: 'recording_scheduled',
    last_activity: 'Episode aired',
    subject_tag: 'FDA Journey',
    podcast: podcasts[0],
    client: clients[0],
    email_thread: [],
    notes: [],
    reminders: [],
    created_at: { toMillis: () => Date.now() - 86400000 * 30 } as any,
    updated_at: { toMillis: () => Date.now() - 86400000 } as any
  },
  {
    id: 'out_2',
    client_id: 'client_1',
    podcast_id: 'pod_5', // Health Tech
    status: 'scheduling_screening',
    last_activity: 'Times sent',
    subject_tag: 'Wearables Future',
    podcast: podcasts[4],
    client: clients[0],
    email_thread: [],
    notes: [],
    reminders: [],
    created_at: { toMillis: () => Date.now() - 86400000 * 7 } as any,
    updated_at: { toMillis: () => Date.now() - 86400000 * 2 } as any
  },
  {
    id: 'out_3',
    client_id: 'client_2',
    podcast_id: 'pod_3', // Indie Hackers
    status: 'in_contact',
    last_activity: 'Replied!',
    subject_tag: 'Bootstrapping',
    podcast: podcasts[2],
    client: clients[1],
    email_thread: [],
    notes: [],
    reminders: [],
    created_at: { toMillis: () => Date.now() - 86400000 * 5 } as any,
    updated_at: { toMillis: () => Date.now() - 86400000 } as any
  },
  {
    id: 'out_4',
    client_id: 'client_1',
    podcast_id: 'pod_4', // MFM
    status: '1st_email_sent',
    last_activity: 'Sent yesterday',
    subject_tag: 'MedTech Ideas',
    podcast: podcasts[3],
    client: clients[0],
    email_thread: [],
    notes: [],
    reminders: [],
    created_at: { toMillis: () => Date.now() - 86400000 * 2 } as any,
    updated_at: { toMillis: () => Date.now() - 86400000 } as any
  },
  {
    id: 'out_5',
    client_id: 'client_4',
    podcast_id: 'pod_2', // Daily
    status: '1st_followup_sent',
    last_activity: 'F/U #1 sent',
    subject_tag: 'Industry News',
    podcast: podcasts[1],
    client: clients[3],
    email_thread: [],
    notes: [],
    reminders: [],
    created_at: { toMillis: () => Date.now() - 86400000 * 10 } as any,
    updated_at: { toMillis: () => Date.now() - 86400000 * 3 } as any
  }
];

export const activityLogs: ActivityLog[] = [
  { id: 'log_1', user_name: 'System', action: 'BOOKED', description: 'Startup FM × MediVIE Tech - Recording Feb 15', timestamp: '10:30 AM', type: 'status' },
  { id: 'log_2', user_name: 'Ruth', action: 'REPLY', description: 'How I Built This - Interested!', timestamp: '09:45 AM', type: 'email' },
  { id: 'log_3', user_name: 'Ruth', action: 'SENT', description: 'Follow-up to Health Tech Pod', timestamp: '09:00 AM', type: 'email' },
  { id: 'log_4', user_name: 'Ruth', action: 'SENT', description: 'First pitch to TechCrunch Podcast', timestamp: 'Yesterday', type: 'email' },
];
