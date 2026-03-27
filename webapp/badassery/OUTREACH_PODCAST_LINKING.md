# Outreach ↔ Podcast Linking Architecture

## 📊 Database Schema

### 3-Way Relationship

```
┌─────────┐         ┌──────────┐         ┌─────────┐
│ Client  │◄────────│ Outreach │────────►│ Podcast │
└─────────┘         └──────────┘         └─────────┘
   1:N                   N:1                  1:N
```

## 🔗 Outreach Collection Fields

```typescript
{
  id: string
  client_id: string              // Link to clients collection
  podcast_itunes_id: string      // Link to podcasts collection (NEW)
  podcast_id: string             // Legacy field (kept for compatibility)
  status: OutreachStatus

  // Email tracking
  email_subject: string
  email_body: string
  sent_at: Timestamp
  response_received: boolean
  response_date: Timestamp
  notes: string

  // Metadata
  last_activity: string
  subject_tag: string
}
```

## 📦 Key Functions

### podcastService.ts

#### 1. `getContactedPodcastsForClient(clientId)`
Returns array of iTunes IDs for podcasts already contacted by this client.

```typescript
const contactedIds = await getContactedPodcastsForClient('client123');
// Returns: ['1234567890', '0987654321', ...]
```

#### 2. `getSuggestedPodcastsForClient(clientId, limit)`
Returns high-scoring podcasts NOT yet contacted by this client.

```typescript
const suggestions = await getSuggestedPodcastsForClient('client123', 50);
// Returns: PodcastDocument[] (top 50 uncontacted podcasts)
```

#### 3. `getOutreachHistoryForPodcast(podcastItunesId)`
Returns all outreach attempts for a specific podcast.

```typescript
const history = await getOutreachHistoryForPodcast('1234567890');
// Returns: Outreach[] (all outreach records for this podcast)
```

#### 4. `getPodcastForOutreach(itunesId)`
Fetches full podcast details for display in outreach pages.

```typescript
const podcast = await getPodcastForOutreach('1234567890');
// Returns: PodcastDocument | null
```

## 🎯 Use Cases

### Use Case 1: Show Client's Outreach Progress
**Page**: Client Detail → Outreach Tab

```typescript
const clientId = 'client123';
const contacted = await getContactedPodcastsForClient(clientId);
const suggestions = await getSuggestedPodcastsForClient(clientId, 20);

// Display:
// - X podcasts contacted
// - Y suggested podcasts to reach out to
// - Filters by Badassery Score, Category, etc.
```

### Use Case 2: Display Podcast Info in Outreach List
**Page**: Outreach List / Outreach Board

```typescript
const outreaches = await getOutreachesForClient('client123');

// For each outreach, enrich with podcast data:
for (const outreach of outreaches) {
  if (outreach.podcast_itunes_id) {
    outreach.podcast = await getPodcastForOutreach(outreach.podcast_itunes_id);
  }
}

// Display:
// - Podcast artwork
// - Podcast title
// - Badassery Score badge
// - Host contact info
// - Outreach status
```

### Use Case 3: Suggest New Podcasts for Outreach
**Page**: Client Detail → Suggest Podcasts

```typescript
const clientId = 'client123';
const suggestions = await getSuggestedPodcastsForClient(clientId, 100);

// Filter by client preferences:
const filtered = suggestions.filter(p =>
  p.ai_guest_friendly === true &&
  p.ai_badassery_score >= 7.0 &&
  p.ai_primary_category === clientPreferredCategory
);

// Display cards with "Start Outreach" button
```

### Use Case 4: View Podcast's Outreach History
**Page**: Podcast Detail Modal

```typescript
const podcastId = '1234567890';
const history = await getOutreachHistoryForPodcast(podcastId);

// Display:
// - Total times contacted: history.length
// - List of clients who reached out
// - Outcomes (booked, no response, etc.)
// - Avoid over-contacting popular podcasts
```

## 🚀 Integration Steps

### Step 1: Update Existing Outreach Records
For existing outreach records without `podcast_itunes_id`, we'll need a migration script:

```javascript
// scripts/migrate_outreach_podcast_links.js
// (To be created if needed - handles legacy podcast_id → podcast_itunes_id mapping)
```

### Step 2: Update Outreach Creation
When creating new outreach, always include `podcast_itunes_id`:

```typescript
await addDoc(collection(db, 'outreach'), {
  client_id: clientId,
  podcast_itunes_id: selectedPodcast.itunesId,  // ✅ NEW
  podcast_id: selectedPodcast.id,                // Legacy
  status: 'ready_for_outreach',
  email_subject: '',
  email_body: '',
  sent_at: null,
  // ...
});
```

### Step 3: Update Outreach Display Pages

#### OutreachList.tsx
```typescript
// Fetch outreaches with podcast data
const enrichedOutreaches = await Promise.all(
  outreaches.map(async (o) => {
    if (o.podcast_itunes_id) {
      o.podcast = await getPodcastForOutreach(o.podcast_itunes_id);
    }
    return o;
  })
);
```

#### OutreachBoard.tsx (Kanban)
```typescript
// Display podcast card in each column
{outreach.podcast && (
  <div className="flex items-center gap-2">
    <img src={outreach.podcast.imageUrl} className="w-10 h-10 rounded" />
    <div>
      <div className="font-medium">{outreach.podcast.title}</div>
      <div className="text-sm text-slate-500">
        Score: {outreach.podcast.ai_badassery_score?.toFixed(1)}
      </div>
    </div>
  </div>
)}
```

## 🔍 Orphaned Outreaches

Some outreach records may not have a matching podcast in our `podcasts` collection (because they were created before we enriched the database, or the podcast isn't in our 158K dataset).

**Handling Strategy**:
1. Display fallback UI for orphaned outreaches
2. Show "Podcast data unavailable" badge
3. Create admin tool to manually link or remove orphans
4. Log orphaned podcast IDs for future enrichment

```typescript
const podcast = await getPodcastForOutreach(outreach.podcast_itunes_id);

if (!podcast) {
  // Display fallback
  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
      ⚠️ Podcast data unavailable (ID: {outreach.podcast_itunes_id})
      <button onClick={() => fetchFromAPI(outreach.podcast_itunes_id)}>
        Fetch from iTunes
      </button>
    </div>
  );
}
```

## 📈 Future Enhancements

1. **Smart Matching**: Use Claude AI to match client profile → best podcasts
2. **Outreach Templates**: Pre-fill email body based on podcast + client data
3. **A/B Testing**: Track which subject lines get best response rates
4. **Avoid Duplicates**: Alert if podcast was recently contacted by another client
5. **Analytics Dashboard**: Show conversion rate by podcast category/score

---

**Created**: 2026-01-18
**Status**: ✅ Ready for Implementation
