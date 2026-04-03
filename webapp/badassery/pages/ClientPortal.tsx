import React, { useState, useEffect } from 'react';
import { Client, Outreach, getClientDisplayData } from '../types';
import { getClientById } from '../services/clientService';
import { getOutreachByClientIdV2 } from '../services/outreachServiceV2';
import { ClientOnboardingForm } from '../components/ClientOnboardingForm';
import { ExternalLink, Sparkles, Loader2, User, ClipboardList, Flame, ChevronRight, LogOut, Lock, Eye, EyeOff, CheckCircle, AlertCircle, X, Camera, Plus } from 'lucide-react';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, storage } from '../services/firebase';
import { clearCurrentUser } from '../services/userService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { ForcePasswordChange } from '../components/ForcePasswordChange';
import { CompleteProfile } from './CompleteProfile';
import { PodcastSwipeDeck } from '../components/PodcastSwipeDeck';
import { InitialsAvatar } from '../components/InitialsAvatar';

interface ClientPortalProps {
  clientId: string;
  mockClient?: Client;
  onLogout?: () => void;
}

// Statuses that count as "booked" (past the outreach phase)
const BOOKED_STATUSES = new Set([
  'screening_scheduled',
  'scheduling_recording',
  'recording_scheduled',
  'recorded',
  'live',
]);

// Statuses that count as "replied"
const REPLIED_STATUSES = new Set([
  'in_contact',
  'scheduling_screening',
  'screening_scheduled',
  'scheduling_recording',
  'recording_scheduled',
  'recorded',
  'live',
]);

// Statuses that count as "outreach sent" (email actually went out)
const SENT_STATUSES = new Set([
  '1st_email_sent',
  '1st_followup_sent',
  '2nd_followup_sent',
  'in_contact',
  'scheduling_screening',
  'screening_scheduled',
  'scheduling_recording',
  'recording_scheduled',
  'recorded',
  'live',
  'declined_by_host',
  'email_bounced',
  'no_response',
  'cancelled',
]);

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    live: '🎉 LIVE',
    recorded: '🟢 RECORDED',
    recording_scheduled: '🟢 RECORDING SCHEDULED',
    scheduling_recording: '🟡 SCHEDULING RECORDING',
    screening_scheduled: '🟡 SCREENING SCHEDULED',
    scheduling_screening: '🟡 SCHEDULING SCREENING',
  };
  return map[status] || status.replace(/_/g, ' ').toUpperCase();
}

function statusColor(status: string): string {
  if (status === 'live') return 'bg-green-100 text-green-800 border-green-200';
  if (status === 'recorded') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'recording_scheduled') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (status === 'scheduling_recording') return 'bg-sky-100 text-sky-800 border-sky-200';
  if (status === 'screening_scheduled' || status === 'scheduling_screening') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function formatTimestamp(ts: any): string {
  if (!ts) return '';
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatDateTime(ts: any): string {
  if (!ts) return '';
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' at ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const ClientPortal: React.FC<ClientPortalProps> = ({ clientId, mockClient, onLogout }) => {
  const [client, setClient] = useState<Client | null>(mockClient || null);
  const [outreachList, setOutreachList] = useState<Outreach[]>([]);
  const [loading, setLoading] = useState(!mockClient);
  const [loadingOutreach, setLoadingOutreach] = useState(true);
  const [showOnboardingForm, setShowOnboardingForm] = useState(false);
  const [showSwipeDeck, setShowSwipeDeck] = useState(false);

  // Change password modal
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [showPwdCurrent, setShowPwdCurrent] = useState(false);
  const [showPwdNew, setShowPwdNew] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState(false);

  // Edit Profile modal state
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [profileHeadshotUrl, setProfileHeadshotUrl] = useState('');
  const [profileHeadshotPreview, setProfileHeadshotPreview] = useState('');
  const [profileUploadingPhoto, setProfileUploadingPhoto] = useState(false);
  const [profileCountryCode, setProfileCountryCode] = useState('+1');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileJobTitle, setProfileJobTitle] = useState('');
  const [profileCompany, setProfileCompany] = useState('');
  const [profileCompanySize, setProfileCompanySize] = useState('');
  const [profileChannels, setProfileChannels] = useState<{ platformId: string; url: string; reach: string }[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const profileFileInputRef = React.useRef<HTMLInputElement>(null);

  const COUNTRY_CODES_PORTAL = [
    { code: '+1', flag: '🇺🇸' }, { code: '+1', flag: '🇨🇦' },
    { code: '+33', flag: '🇫🇷' }, { code: '+44', flag: '🇬🇧' },
    { code: '+49', flag: '🇩🇪' }, { code: '+34', flag: '🇪🇸' },
    { code: '+39', flag: '🇮🇹' }, { code: '+31', flag: '🇳🇱' },
    { code: '+61', flag: '🇦🇺' }, { code: '+971', flag: '🇦🇪' },
  ];
  const COMPANY_SIZES_PORTAL = ['Just me', '2–10', '11–50', '51–200', '201–1000', '1000+'];

  // Platforms available in the channel picker
  const CHANNEL_PLATFORMS = [
    { id: 'linkedin',   label: 'LinkedIn',    color: '#0077b5', hasReach: true,  placeholder: 'https://linkedin.com/in/…',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg> },
    { id: 'instagram',  label: 'Instagram',   color: '#e1306c', hasReach: true,  placeholder: 'https://instagram.com/…',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg> },
    { id: 'x',          label: 'X / Twitter', color: '#000000', hasReach: true,  placeholder: 'https://x.com/…',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
    { id: 'youtube',    label: 'YouTube',     color: '#ff0000', hasReach: true,  placeholder: 'https://youtube.com/@…',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> },
    { id: 'tiktok',     label: 'TikTok',      color: '#010101', hasReach: true,  placeholder: 'https://tiktok.com/@…',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/></svg> },
    { id: 'facebook',   label: 'Facebook',    color: '#1877f2', hasReach: true,  placeholder: 'https://facebook.com/…',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> },
    { id: 'newsletter', label: 'Newsletter',  color: '#ff6719', hasReach: true,  placeholder: 'https://substack.com/…',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/></svg> },
    { id: 'podcast',    label: 'Podcast',     color: '#8b5cf6', hasReach: true,  placeholder: 'https://open.spotify.com/…',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 6a3 3 0 110 6 3 3 0 010-6zm5.25 10.5c-.414 0-.75-.336-.75-.75 0-2.485-2.015-4.5-4.5-4.5s-4.5 2.015-4.5 4.5c0 .414-.336.75-.75.75s-.75-.336-.75-.75c0-3.309 2.691-6 6-6s6 2.691 6 6c0 .414-.336.75-.75.75zm2.25 0c-.414 0-.75-.336-.75-.75 0-3.722-3.028-6.75-6.75-6.75S5.25 12.028 5.25 15.75c0 .414-.336.75-.75.75s-.75-.336-.75-.75C3.75 11.197 7.447 7.5 12 7.5s8.25 3.697 8.25 8.25c0 .414-.336.75-.75.75z"/></svg> },
    { id: 'website',    label: 'Website',     color: '#6366f1', hasReach: false, placeholder: 'https://yourwebsite.com',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg> },
    { id: 'other',      label: 'Other',       color: '#6b7280', hasReach: false, placeholder: 'https://…',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> },
  ];

  const openEditProfile = () => {
    if (!client) return;
    const rawPhone = client.identity?.phone || '';
    const matchedCode = COUNTRY_CODES_PORTAL.find(c => rawPhone.startsWith(c.code));
    setProfileCountryCode(matchedCode?.code || '+1');
    setProfilePhone(matchedCode ? rawPhone.slice(matchedCode.code.length) : rawPhone);
    setProfileJobTitle(client.identity?.jobTitle || '');
    setProfileCompany(client.identity?.company || '');
    setProfileCompanySize((client.identity as any)?.companySize || '');
    setProfileHeadshotUrl(client.links?.headshot || '');
    setProfileHeadshotPreview('');
    // Load channels from Firestore channels array, fall back to legacy fields
    const savedChannels = (client.links as any)?.channels;
    if (Array.isArray(savedChannels) && savedChannels.length > 0) {
      setProfileChannels(savedChannels.map((c: any) => ({
        platformId: c.platform,
        url: c.url || '',
        reach: c.reach ? String(c.reach) : '',
      })));
    } else {
      // Reconstruct from legacy fields
      const legacy: { platformId: string; url: string; reach: string }[] = [];
      if (client.links?.website) legacy.push({ platformId: 'website', url: client.links.website, reach: '' });
      if (client.links?.linkedinAndSocial) legacy.push({ platformId: 'linkedin', url: client.links.linkedinAndSocial, reach: '' });
      setProfileChannels(legacy);
    }
    setProfileError('');
    setShowEditProfile(true);
  };

  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileUploadingPhoto(true);
    try {
      setProfileHeadshotPreview(URL.createObjectURL(file));
      const storageRef = ref(storage, `clients/${clientId}/headshot_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setProfileHeadshotUrl(url);
    } catch {
      setProfileError('Photo upload failed.');
    } finally {
      setProfileUploadingPhoto(false);
    }
  };

  const addProfileChannel = (platformId: string) => {
    if (profileChannels.some(c => c.platformId === platformId)) return;
    setProfileChannels(prev => [...prev, { platformId, url: '', reach: '' }]);
  };

  const updateProfileChannel = (platformId: string, field: 'url' | 'reach', value: string) => {
    setProfileChannels(prev => prev.map(c => c.platformId === platformId ? { ...c, [field]: value } : c));
  };

  const removeProfileChannel = (platformId: string) => {
    setProfileChannels(prev => prev.filter(c => c.platformId !== platformId));
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileError('');
    try {
      const websiteEntry = profileChannels.find(c => c.platformId === 'website');
      const linkedinEntry = profileChannels.find(c => c.platformId === 'linkedin');
      const channelReachText = profileChannels
        .filter(c => c.reach)
        .map(c => {
          const p = CHANNEL_PLATFORMS.find(p => p.id === c.platformId);
          return `${p?.label ?? c.platformId}: ${c.reach}`;
        })
        .join('\n');

      await updateDoc(doc(db, 'clients', clientId), {
        'identity.phone': profileCountryCode + profilePhone,
        'identity.jobTitle': profileJobTitle,
        'identity.company': profileCompany,
        'identity.companySize': profileCompanySize,
        'links.headshot': profileHeadshotUrl,
        'links.website': websiteEntry?.url ?? '',
        'links.linkedinAndSocial': linkedinEntry?.url ?? '',
        'links.channels': profileChannels.map(c => ({ platform: c.platformId, url: c.url, reach: c.reach ? Number(c.reach) : null })),
        'content.channelReach': channelReachText,
      });
      setShowEditProfile(false);
      const updated = await getClientById(clientId);
      if (updated) setClient(updated);
    } catch {
      setProfileError('Failed to save changes.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    if (pwdNew.length < 8) { setPwdError('New password must be at least 8 characters.'); return; }
    if (pwdNew !== pwdConfirm) { setPwdError('Passwords do not match.'); return; }
    setPwdLoading(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('Not authenticated');
      const credential = EmailAuthProvider.credential(user.email, pwdCurrent);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, pwdNew);
      setPwdSuccess(true);
      setPwdCurrent(''); setPwdNew(''); setPwdConfirm('');
      setTimeout(() => { setPwdSuccess(false); setShowChangePwd(false); }, 2000);
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPwdError('Current password is incorrect.');
      } else if (err.code === 'auth/weak-password') {
        setPwdError('Password too weak — choose something stronger.');
      } else {
        setPwdError(err.message || 'Failed to update password.');
      }
    } finally {
      setPwdLoading(false);
    }
  };

  const handleLogout = () => {
    clearCurrentUser();
    onLogout?.();
  };

  useEffect(() => {
    if (mockClient) {
      setClient(mockClient);
      setLoading(false);
    } else {
      getClientById(clientId)
        .then(data => setClient(data))
        .catch(err => console.error('Error loading client:', err))
        .finally(() => setLoading(false));
    }

    getOutreachByClientIdV2(clientId)
      .then(data => setOutreachList(data))
      .catch(err => console.error('Error loading outreach:', err))
      .finally(() => setLoadingOutreach(false));
  }, [clientId, mockClient]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
        <Loader2 className="text-indigo-500 animate-spin" size={32} />
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

  // Step 1: Force password change on first login
  if (client.forcePasswordChange && auth.currentUser?.email) {
    return (
      <ForcePasswordChange
        clientId={clientId}
        currentEmail={auth.currentUser.email}
        onComplete={() => setClient(prev => prev ? { ...prev, forcePasswordChange: false } : prev)}
      />
    );
  }

  // Step 2: Complete profile if not done yet
  if (!(client as any).profileCompleted) {
    const displayName = client.identity?.firstName
      ? `${client.identity.firstName} ${client.identity.lastName || ''}`.trim()
      : client.contact_name || '';
    return (
      <CompleteProfile
        clientId={clientId}
        displayName={displayName}
        onComplete={() => setClient(prev => prev ? { ...(prev as any), profileCompleted: true } : prev)}
      />
    );
  }

  // If client chose to fill in the onboarding form, show it full-screen
  if (showOnboardingForm) {
    return (
      <ClientOnboardingForm
        clientId={clientId}
        firstName={client?.identity?.firstName}
        onComplete={() => {
          getClientById(clientId).then(updated => {
            if (updated) setClient(updated);
          });
          setShowOnboardingForm(false);
        }}
      />
    );
  }

  const displayData = getClientDisplayData(client);

  // ── Compute real stats ──────────────────────────────────────────
  const totalOutreach = outreachList.length;
  const sentCount = outreachList.filter(o => SENT_STATUSES.has(o.status)).length;
  const repliedCount = outreachList.filter(o => REPLIED_STATUSES.has(o.status)).length;
  const bookedItems = outreachList.filter(o => BOOKED_STATUSES.has(o.status));
  const liveItems = outreachList.filter(o => o.status === 'live');

  // Goal % from client data if available (fallback to 5 bookings goal)
  const goalBookings = (client as any).stats?.goal_bookings || 5;
  const goalPct = Math.min(100, Math.round((bookedItems.length / goalBookings) * 100));

  // ── Bookings list (in progress / done) ─────────────────────────
  const bookings = bookedItems.sort((a, b) => {
    const order = ['live', 'recorded', 'recording_scheduled', 'scheduling_recording', 'screening_scheduled', 'scheduling_screening'];
    return order.indexOf(a.status) - order.indexOf(b.status);
  });

  // ── Recent updates: all outreach sorted by updated_at desc ──────
  const recentUpdates = [...outreachList]
    .filter(o => o.updated_at)
    .sort((a, b) => {
      const at = a.updated_at?.toMillis ? a.updated_at.toMillis() : 0;
      const bt = b.updated_at?.toMillis ? b.updated_at.toMillis() : 0;
      return bt - at;
    })
    .slice(0, 5);

  // ── Upcoming recordings (recording_scheduled, sorted by recording_date) ──
  const upcoming = outreachList
    .filter(o => o.status === 'recording_scheduled' || o.status === 'screening_scheduled')
    .sort((a, b) => {
      const at = (a.recording_date?.toMillis ? a.recording_date.toMillis() : 0);
      const bt = (b.recording_date?.toMillis ? b.recording_date.toMillis() : 0);
      return at - bt;
    });

  const firstName = client.identity?.firstName || 'there';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">


      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="Badassery" className="w-9 h-9 rounded-lg object-contain" />
            <span className="font-bold text-lg tracking-tight text-slate-900">BADASSERY</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setPwdError(''); setPwdSuccess(false); setShowChangePwd(true); }}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-colors"
              title="Change password"
            >
              <Lock size={13} />
              <span className="hidden sm:inline">Password</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-lg px-3 py-1.5 transition-colors"
              title="Log out"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Log out</span>
            </button>
            <div className="flex items-center gap-3 ml-1">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-slate-900">Welcome, {firstName}</div>
                <div className="text-xs text-slate-500">{displayData.company_name}</div>
              </div>
              <button onClick={openEditProfile} className="relative group" title="Edit profile">
                <InitialsAvatar
                  name={`${client.identity?.firstName || ''} ${client.identity?.lastName || ''}`.trim() || displayData.company_name || '?'}
                  src={displayData.logo_url}
                  size="md"
                  className="border-2 border-indigo-100"
                />
                <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera size={14} className="text-white" />
                </div>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ── Onboarding banner ── */}
        {client.onboardingCompleted === false && (
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 md:p-8 text-white shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center gap-5">
              <div className="flex-shrink-0 w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                <ClipboardList size={28} className="text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold mb-1">
                  One last step before we get started 👋
                </h2>
                <p className="text-indigo-100 text-sm leading-relaxed max-w-xl">
                  To start booking you on the right podcasts, we need a few details about you.
                  It takes about <strong className="text-white">10 minutes</strong>.
                </p>
              </div>
              <button
                onClick={() => setShowOnboardingForm(true)}
                className="flex-shrink-0 bg-white text-indigo-700 font-bold text-sm px-6 py-3 rounded-xl hover:bg-indigo-50 transition-colors shadow-md whitespace-nowrap"
              >
                Complete my profile →
              </button>
            </div>
          </div>
        )}

        {/* ── Title + Profile Link ── */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">YOUR PODCAST CAMPAIGN</h1>
          <a
            href={`/?speak=${(client as any).speakerSlug || clientId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-4 py-2 transition-colors"
          >
            <ExternalLink size={14} />
            View My Speaker Profile
          </a>
        </div>

        {/* ── Campaign Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Podcasts Identified" value={(client as any).wishlist?.length ?? (client as any).stats?.matches ?? 0} icon="🎯" color="indigo" />
          <StatCard title="Outreach Sent" value={loadingOutreach ? '…' : sentCount} icon="📧" color="blue" />
          <StatCard title="Replies Received" value={loadingOutreach ? '…' : repliedCount} icon="💬" color="green" />
          <StatCard title="Booked Episodes" value={loadingOutreach ? '…' : bookedItems.length} icon="🎉" color="purple" />
        </div>

        {/* ── Goal progress ── */}
        {!loadingOutreach && bookedItems.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">Campaign Goal Progress</span>
              <span className="text-sm font-bold text-indigo-600">{bookedItems.length} / {goalBookings} bookings</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${goalPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-slate-500">{liveItems.length} episode{liveItems.length !== 1 ? 's' : ''} live</span>
              <span className="text-xs text-indigo-600 font-semibold">{goalPct}%</span>
            </div>
          </div>
        )}

        {/* ── Upcoming Recordings ── */}
        {!loadingOutreach && upcoming.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-3">UPCOMING PREP</h2>
            <div className="space-y-3">
              {upcoming.map(item => (
                <div key={item.id} className="bg-white border border-blue-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4 shadow-sm">
                  <div>
                    <p className="font-semibold text-slate-900">{item.podcast_name || 'Podcast'}</p>
                    {item.recording_date && (
                      <p className="text-sm text-blue-600 mt-0.5">📅 {formatDateTime(item.recording_date)}</p>
                    )}
                    {item.recording_notes && (
                      <p className="text-xs text-slate-500 mt-1">{item.recording_notes}</p>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${statusColor(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Bookings Table ── */}
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-3">YOUR BOOKINGS</h2>
          {loadingOutreach ? (
            <div className="flex items-center justify-center py-12 bg-white border border-slate-200 rounded-xl">
              <Loader2 className="text-indigo-400 animate-spin" size={24} />
            </div>
          ) : bookings.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl px-6 py-10 text-center text-slate-500 text-sm">
              No bookings yet — your team is actively working on it!
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Show</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Links</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bookings.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-medium text-slate-900">{item.podcast_name || '—'}</span>
                          {item.podcast_url && (
                            <a
                              href={item.podcast_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs text-indigo-500 hover:text-indigo-700 mt-0.5"
                            >
                              {item.podcast_url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                            </a>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${statusColor(item.status)}`}>
                            {statusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {item.status === 'live' && item.live_date
                            ? formatTimestamp(item.live_date)
                            : item.status === 'recorded' && item.recording_date
                            ? formatTimestamp(item.recording_date)
                            : item.recording_date
                            ? formatTimestamp(item.recording_date)
                            : formatTimestamp(item.updated_at) || '—'}
                        </td>
                        <td className="px-6 py-4">
                          {item.status === 'live' && item.live_episode_url ? (
                            <a
                              href={item.live_episode_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                            >
                              <ExternalLink size={13} />
                              Listen Now
                            </a>
                          ) : item.status === 'recorded' ? (
                            <span className="text-slate-400 text-xs">Awaiting publication</span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Recent Activity ── */}
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-3">RECENT ACTIVITY</h2>
          {loadingOutreach ? (
            <div className="flex items-center justify-center py-8 bg-white border border-slate-200 rounded-xl">
              <Loader2 className="text-indigo-400 animate-spin" size={20} />
            </div>
          ) : recentUpdates.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl px-6 py-8 text-center text-slate-500 text-sm">
              No activity yet.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100">
              {recentUpdates.map(item => {
                const isPositive = item.status === 'live' || item.status === 'recorded';
                return (
                  <div key={item.id} className="px-6 py-4 flex items-start gap-3">
                    <span className="text-xl flex-shrink-0 mt-0.5">
                      {item.status === 'live' ? '🎉' :
                       item.status === 'recorded' ? '🎙️' :
                       item.status === 'recording_scheduled' ? '📅' :
                       item.status === 'screening_scheduled' ? '📞' :
                       '📧'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-slate-900 text-sm">
                        <span className="font-semibold">{item.podcast_name || 'Podcast'}</span>
                        {' — '}
                        <span className="text-slate-600">{statusLabel(item.status).toLowerCase()}</span>
                      </p>
                      {item.updated_at && (
                        <p className="text-xs text-slate-400 mt-0.5">{formatTimestamp(item.updated_at)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Discover Podcasts (swipe) ── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => setShowSwipeDeck(prev => !prev)}
            className="w-full px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center">
                <Flame size={18} className="text-white" />
              </div>
              <div className="text-left">
                <div className="font-bold text-slate-900 text-sm">Discover Podcasts</div>
                <div className="text-xs text-slate-500">Swipe right on shows you'd love to be on</div>
              </div>
            </div>
            <ChevronRight
              size={18}
              className={`text-slate-400 transition-transform ${showSwipeDeck ? 'rotate-90' : ''}`}
            />
          </button>

          {showSwipeDeck && (
            <div className="border-t border-slate-100 px-4 pb-6">
              <PodcastSwipeDeck clientId={clientId} client={client} />
            </div>
          )}
        </div>

        {/* ── Campaign note ── */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <Sparkles className="text-indigo-600 flex-shrink-0 mt-0.5" size={18} />
            <div className="text-sm text-indigo-800">
              <p className="font-semibold mb-1">Your Campaign in Action</p>
              <p>
                Our team is actively reaching out to podcasts on your behalf. You'll see updates here
                as we receive responses and schedule interviews. We focus on quality matches that align
                with your expertise and goals.
              </p>
            </div>
          </div>
        </div>

      </main>

      {/* ── Change Password Modal ── */}
      {showChangePwd && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Lock size={18} className="text-indigo-600" />
                <h2 className="font-bold text-slate-900">Change password</h2>
              </div>
              <button onClick={() => setShowChangePwd(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {pwdSuccess ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle size={40} className="text-green-500" />
                <p className="font-semibold text-slate-900">Password updated!</p>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                {pwdError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                    <AlertCircle size={14} className="flex-shrink-0" /> {pwdError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Current password</label>
                  <div className="relative">
                    <input
                      type={showPwdCurrent ? 'text' : 'password'}
                      value={pwdCurrent}
                      onChange={e => setPwdCurrent(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full px-3.5 py-2.5 pr-9 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="button" onClick={() => setShowPwdCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPwdCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">New password</label>
                  <div className="relative">
                    <input
                      type={showPwdNew ? 'text' : 'password'}
                      value={pwdNew}
                      onChange={e => setPwdNew(e.target.value)}
                      placeholder="Min. 8 characters"
                      required
                      className="w-full px-3.5 py-2.5 pr-9 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="button" onClick={() => setShowPwdNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPwdNew ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirm new password</label>
                  <input
                    type="password"
                    value={pwdConfirm}
                    onChange={e => setPwdConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {pwdConfirm.length > 0 && pwdConfirm === pwdNew && pwdNew.length >= 8 && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle size={11} /> Passwords match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={pwdLoading || !pwdCurrent || !pwdNew || !pwdConfirm}
                  className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {pwdLoading ? <><Loader2 size={15} className="animate-spin" /> Updating…</> : <><Lock size={14} /> Update password</>}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Edit Profile</h2>
              <button onClick={() => setShowEditProfile(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Headshot */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative w-20 h-20 rounded-full cursor-pointer group" onClick={() => profileFileInputRef.current?.click()}>
                  {(profileHeadshotPreview || profileHeadshotUrl) ? (
                    <img src={profileHeadshotPreview || profileHeadshotUrl} alt="Headshot" className="w-20 h-20 rounded-full object-cover border-2 border-slate-200" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center">
                      <Camera size={24} className="text-slate-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {profileUploadingPhoto ? <Loader2 size={18} className="text-white animate-spin" /> : <Camera size={18} className="text-white" />}
                  </div>
                </div>
                <input ref={profileFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoChange} />
                <p className="text-slate-400 text-xs">Click to upload</p>
              </div>

              {/* Job Title + Company */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Job Title</label>
                  <input type="text" value={profileJobTitle} onChange={e => setProfileJobTitle(e.target.value)} placeholder="CEO, Coach…" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Company</label>
                  <input type="text" value={profileCompany} onChange={e => setProfileCompany(e.target.value)} placeholder="Acme Inc." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              {/* Company Size */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Company Size</label>
                <div className="grid grid-cols-3 gap-2">
                  {COMPANY_SIZES_PORTAL.map(size => (
                    <button key={size} type="button" onClick={() => setProfileCompanySize(size)}
                      className={`py-1.5 text-xs rounded-lg border transition-colors ${profileCompanySize === size ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone number</label>
                <div className="flex gap-2">
                  <select value={profileCountryCode} onChange={e => setProfileCountryCode(e.target.value)} className="px-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {COUNTRY_CODES_PORTAL.map(c => (
                      <option key={c.flag + c.code} value={c.code}>{c.flag} {c.code}</option>
                    ))}
                  </select>
                  <input type="tel" value={profilePhone} onChange={e => setProfilePhone(e.target.value)} placeholder="612 345 678" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              {/* Links per channel */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Links per channel</label>

                {/* Added channels */}
                {profileChannels.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {profileChannels.map(ch => {
                      const p = CHANNEL_PLATFORMS.find(p => p.id === ch.platformId)!;
                      if (!p) return null;
                      return (
                        <div key={ch.platformId} className="border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded flex items-center justify-center text-white" style={{ backgroundColor: p.color }}>
                                {p.icon}
                              </span>
                              <span className="text-slate-700 text-xs font-medium">{p.label}</span>
                            </div>
                            <button type="button" onClick={() => removeProfileChannel(ch.platformId)} className="text-slate-300 hover:text-red-400 transition-colors">
                              <X size={12} />
                            </button>
                          </div>
                          <input
                            type="url"
                            value={ch.url}
                            onChange={e => updateProfileChannel(ch.platformId, 'url', e.target.value)}
                            placeholder={p.placeholder}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Platform picker chips */}
                <div className="flex flex-wrap gap-1.5">
                  {CHANNEL_PLATFORMS.map(p => {
                    const added = profileChannels.some(c => c.platformId === p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProfileChannel(p.id)}
                        disabled={added}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-all ${
                          added
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-400 cursor-default'
                            : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
                        }`}
                      >
                        <span className="w-4 h-4 rounded flex items-center justify-center text-white" style={{ backgroundColor: p.color }}>
                          {p.icon}
                        </span>
                        {p.label}
                        {!added && <Plus size={9} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {profileError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{profileError}</div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowEditProfile(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleSaveProfile} disabled={profileSaving}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {profileSaving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// ── Stat card ──────────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  title: string;
  value: number | string;
  icon: string;
  color: 'indigo' | 'blue' | 'green' | 'purple';
}> = ({ title, value, icon, color }) => {
  const colorMap = {
    indigo: 'from-indigo-50 to-indigo-100 border-indigo-200 text-indigo-700',
    blue: 'from-blue-50 to-blue-100 border-blue-200 text-blue-700',
    green: 'from-green-50 to-green-100 border-green-200 text-green-700',
    purple: 'from-purple-50 to-purple-100 border-purple-200 text-purple-700',
  };
  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-xl p-5 shadow-sm text-center`}>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</div>
      <div className="text-4xl font-bold mb-1">{value}</div>
      <div className="text-2xl">{icon}</div>
    </div>
  );
};
