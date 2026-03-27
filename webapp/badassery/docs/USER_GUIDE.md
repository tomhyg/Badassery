# PodPitch - Complete User Guide

## Table of Contents

1. [Introduction](#1-introduction)
2. [Creating a Client](#2-creating-a-client)
3. [Exploring Podcasts](#3-exploring-podcasts)
4. [Matching a Podcast to a Client](#4-matching-a-podcast-to-a-client)
5. [The Outreach Kanban](#5-the-outreach-kanban)
6. [Generated Emails](#6-generated-emails)
7. [Saved Data](#7-saved-data)
8. [Exit Statuses](#8-exit-statuses)
9. [Concrete Examples](#9-concrete-examples)
10. [FAQ / Troubleshooting](#10-faq--troubleshooting)
11. [Appendix: AI Prompts](#11-appendix--complete-ai-prompts)

---

## 1. Introduction

### What is PodPitch?

PodPitch is a **podcast booking webapp** built for Badassery PR. It manages the complete outreach cycle to place clients (experts, CEOs, authors...) on relevant podcasts.

### What does it do?

- Find podcasts suited for each client
- Generate personalized pitch emails with AI
- Track the complete workflow: from first contact to live episode
- Keep a record of all communications

### The 3 Main Sections

| Section | Description |
|---------|-------------|
| **Podcasts** | Database of 10,000+ podcasts with scores and filters |
| **Clients** | Profiles of clients to place on podcasts |
| **Outreach (Kanban)** | Visual pipeline for campaign management |

---

## 2. Creating a Client

### Where to go?

Side menu → **Clients** → **"+ Add Client"** button

### Fields to fill

#### Basic Information (Required)
| Field | Description | Example |
|-------|-------------|---------|
| First Name | First name | Sarah |
| Last Name | Last name | Johnson |
| Email | Contact email | sarah@medtech.com |
| Job Title | Professional title | CEO & Founder |
| Company | Company name | MedTech Innovations |

#### Expertise & Topics (Recommended)
| Field | Description | Example |
|-------|-------------|---------|
| Bio | Short client description | "Dr. Sarah Johnson is a healthcare innovator..." |
| Speaking Topics | Areas of expertise (list) | Healthcare Tech, Women in STEM, Startup Leadership |
| Professional Goals | Goals | Increase visibility, promote book |

### Concrete Example

```
Name: Dr. Sarah Johnson
Title: CEO & Founder, MedTech Innovations
Email: sarah@medtech.com
Bio: Dr. Sarah Johnson is a healthcare technology pioneer
     with 15 years of experience in digital health solutions.
     Former Stanford professor, TEDx speaker, and author of
     "The Future of Healthcare."
Topics:
  - Healthcare Technology
  - Women in Leadership
  - Startup Scaling
  - Digital Transformation in Medicine
```

---

## 3. Exploring Podcasts

### The Podcasts Database Page

Side menu → **Podcasts**

### Available Filters

| Filter | Description |
|--------|-------------|
| **Category** | One of 31 Badassery niches (Business, Health, Tech...) |
| **Min Badassery Score** | Minimum score (0-10) |
| **Language** | Podcast language |
| **Guest Friendly** | Podcasts that accept guests |

### How to Read a Podcast Card

```
┌─────────────────────────────────────────────┐
│ [Image]  The Health Innovators Show         │
│                                             │
│ ⭐ Badassery Score: 8.5/10                  │
│ 🍎 Apple Rating: 4.8 (523 reviews)          │
│                                             │
│ 🎙️ Host: Dr. Mike Chen                      │
│ 📧 contact@healthinnovators.com             │
│                                             │
│ 📝 Description:                             │
│ Weekly conversations with healthcare        │
│ leaders transforming the industry...        │
│                                             │
│ 🏷️ Categories: Health, Business, Tech       │
│ 👥 Audience: Healthcare professionals       │
│                                             │
│ [Assign to Client]                          │
└─────────────────────────────────────────────┘
```

### The Badassery Score

Score from 0 to 10 calculated by AI based on:
- Apple Podcasts rating
- Number of episodes
- Publishing frequency
- Estimated engagement
- Business relevance

| Score | Meaning |
|-------|---------|
| 8-10 | Excellent - Top podcasts |
| 6-8 | Very good - Good opportunity |
| 4-6 | Decent - Worth considering |
| 0-4 | Low - Low priority |

### Pagination

Podcasts are loaded **50 at a time** for optimal performance. Use "Load More" buttons to see more results.

---

## 4. Matching a Podcast to a Client

### From the Podcasts Page

1. Find an interesting podcast
2. Click **"Assign to Client"**
3. Select the client from the list
4. Confirm

### What Happens Automatically

When you assign a podcast to a client:

1. An **outreach** record is created in the database
2. Initial status = `ready_for_outreach`
3. The card appears in the **Kanban** "Ready" column
4. Podcast + client info are linked

### Created Structure

```
Outreach created:
├── client_id: "client_abc123"
├── podcast_id: "podcast_xyz789"
├── podcast_name: "The Health Innovators Show"
├── client_name: "Dr. Sarah Johnson"
├── host_email: "contact@healthinnovators.com"
├── status: "ready_for_outreach"
└── created_at: [now]
```

---

## 5. The Outreach Kanban

### 5.1 Overview

Side menu → **Outreach** (or Kanban)

The Kanban displays all ongoing outreach, organized by columns according to their status.

### 5.2 The Columns

| Column | Status | Description |
|--------|--------|-------------|
| **Ready** | `ready_for_outreach` | Ready to send 1st email |
| **1st Email** | `1st_email_sent` | First email sent |
| **1st Follow-up** | `1st_followup_sent` | First follow-up sent |
| **2nd Follow-up** | `2nd_followup_sent` | Second follow-up sent |
| **In Contact** | `in_contact` | Host responded positively |
| **Sched. Screen** | `scheduling_screening` | Scheduling screening call |
| **Screen Scheduled** | `screening_scheduled` | Screening call confirmed |
| **Sched. Recording** | `scheduling_recording` | Scheduling the recording |
| **Rec. Scheduled** | `recording_scheduled` | Recording confirmed |
| **Recorded** | `recorded` | Recording completed |
| **Live** | `live` | Episode published! |

### 5.3 The Complete Workflow

```
                    ready_for_outreach
                           │
                    [Button "1st Email"]
                           ▼
                    1st_email_sent
                           │
              [After 5 days - "Follow Up 1"]
                           ▼
                   1st_followup_sent
                           │
              [After 5 days - "Follow Up 2"]
                           ▼
                   2nd_followup_sent
                           │
                   ┌───────┴───────┐
                   ▼               ▼
             no_response      in_contact
                              (Host responds +)
                                   │
                            [Drag & Drop]
                                   ▼
                        scheduling_screening
                                   │
                      [Button "Screening Done"]
                                   ▼
                        screening_scheduled
                           │     │
            [Prep Email]◄──┘     │
            (5 days before)      │
                                 │
                        [Drag after screening OK]
                                   ▼
                        scheduling_recording
                                   │
                       [Button "Rec. Scheduled"]
                                   ▼
                        recording_scheduled
                           │     │
            [Prep Email]◄──┘     │
            (5 days before)      │
                                 │
                        [Button "Recorded"]
                                   ▼
                            recorded
                                   │
                        [Button "Mark Live"]
                                   ▼
                              live ✅
```

### 5.4 Action Buttons

| Button | Visible when | Action |
|--------|--------------|--------|
| **1st Email** | Status = `ready_for_outreach` | Generates pitch email |
| **Follow Up 1** | Status = `1st_email_sent` | Generates 1st follow-up |
| **Follow Up 2** | Status = `1st_followup_sent` | Generates 2nd follow-up |
| **Screening** | Status = `in_contact` | Generates email to propose screening |
| **Recording** | Status = `screening_scheduled` | Generates email to schedule recording |
| **Screening Done** | Status = `scheduling_screening` | Marks screening as confirmed |
| **Rec. Scheduled** | Status = `scheduling_recording` | Marks recording as confirmed |
| **Recorded** | Status = `recording_scheduled` | Marks as recorded |
| **Mark Live** | Status = `recorded` | Marks as published |
| **Send Prep** | 5 days before screening/recording | Preparation email to CLIENT |

### 5.5 The 5-Day Logic

Follow-up buttons appear **5 days after** the last email sent:

```
Day 0: 1st Email sent
Days 1-4: "Follow Up 1" button hidden
Day 5+: "Follow Up 1" button visible ✅

Day 5: Follow Up 1 sent
Days 6-9: "Follow Up 2" button hidden
Day 10+: "Follow Up 2" button visible ✅
```

### 5.6 The Prep Email

The **"Send Prep"** button appears when:
- Status = `screening_scheduled` OR `recording_scheduled`
- A date is set (screening_call_date or recording_date)
- The date is within **5 days or less**
- The prep email hasn't already been sent

**Important**: The Prep Email is sent to the **CLIENT** (not the podcast host) to prepare them for their appearance.

### 5.7 Overdue Cards

Cards waiting for **5+ days** are marked in red with an "Overdue" badge. A "Handle Response" button appears to manage them.

---

## 6. Generated Emails

### 6.1 Email Types

| Type | Recipient | Purpose |
|------|-----------|---------|
| **1st Email (Pitch)** | Podcast host | First contact, introduce client |
| **Follow-up 1** | Podcast host | Follow-up after 5 days |
| **Follow-up 2** | Podcast host | Final follow-up |
| **Screening Email** | Podcast host | Propose a screening call |
| **Recording Email** | Podcast host | Schedule the recording |
| **Prep Email** | CLIENT | Prepare client before recording |

### 6.2 The Generation Modal

When you click an email action button:

```
┌─────────────────────────────────────────────────┐
│  📧 Follow Up 1                              X  │
│  The Health Innovators Show                     │
├─────────────────────────────────────────────────┤
│                                                 │
│  📝 Previous Message (Original Pitch)           │
│  ┌─────────────────────────────────────────┐   │
│  │ Subject: Podcast Guest Opportunity      │   │
│  │ Hi Mike, I'm reaching out because...    │   │
│  └─────────────────────────────────────────┘   │
│                                    [Edit]       │
│                                                 │
│  ──────────────────────────────────────────    │
│                                                 │
│  📧 New Message                [🔄 Regenerate]  │
│                                                 │
│  To (Host): contact@healthinnovators.com        │
│                                                 │
│  Subject: Re: Podcast Guest Opportunity         │
│  ┌─────────────────────────────────────────┐   │
│  │ Hi Mike,                                │   │
│  │                                         │   │
│  │ Just wanted to follow up on my previous │   │
│  │ email about Dr. Sarah Johnson...        │   │
│  │                                         │   │
│  │ Best,                                   │   │
│  │ Ruth                                    │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
├─────────────────────────────────────────────────┤
│  [Copy to Clipboard]     [Cancel] [Open Gmail]  │
└─────────────────────────────────────────────────┘
```

### 6.3 Variables Used by AI

The AI uses this information to generate the email:

| Variable | Source |
|----------|--------|
| `{podcast_name}` | Podcast name |
| `{host_name}` | Host's first name |
| `{client_name}` | Client's full name |
| `{client_title}` | Professional title |
| `{client_expertise}` | Bio / client expertise |
| `{client_topics}` | Discussion topics |
| `{previous_message}` | Previous email (for context) |
| `{recording_date}` | Recording date (prep email) |
| `{podcast_description}` | Podcast description |

### 6.4 Customize Before Sending

1. The email is **editable** in the modal
2. Click in the text field to edit
3. Click **"Regenerate"** for a new version
4. Click **"Open Gmail"** to open Gmail with pre-filled email

---

## 7. Saved Data

### 7.1 Outreach Structure

Each outreach in Firestore contains:

```
outreach/{id}
│
├── 📋 IDENTIFIERS
│   ├── id: "outreach_abc123"
│   ├── client_id: "client_xyz"
│   ├── client_name: "Dr. Sarah Johnson"
│   ├── podcast_id: "123456789"
│   ├── podcast_itunes_id: "123456789"
│   └── podcast_name: "The Health Innovators Show"
│
├── 📊 STATUS
│   ├── status: "1st_followup_sent"
│   ├── status_category: "active"
│   ├── status_changed_at: Timestamp
│   └── status_changed_by: "user_id"
│
├── 📧 FIRST EMAIL
│   ├── first_email_copy: "Hi Mike, I'm reaching out..."
│   ├── first_email_subject: "Podcast Guest Opportunity"
│   ├── first_email_sent_at: Timestamp
│   └── first_email_sent_by: "user_id"
│
├── 📧 FOLLOW-UP 1
│   ├── first_followup_copy: "Hi Mike, Just following up..."
│   ├── first_followup_subject: "Re: Podcast Guest Opportunity"
│   ├── first_followup_sent_at: Timestamp
│   └── first_followup_sent_by: "user_id"
│
├── 📧 FOLLOW-UP 2
│   ├── second_followup_copy: "Hi Mike, Last message..."
│   ├── second_followup_subject: "Re: Podcast Guest Opportunity"
│   ├── second_followup_sent_at: Timestamp
│   └── second_followup_sent_by: "user_id"
│
├── 📧 SCREENING EMAIL
│   ├── screening_email_copy: "Great to hear back..."
│   ├── screening_email_subject: "Quick call to discuss..."
│   ├── screening_email_sent_at: Timestamp
│   └── screening_email_sent_by: "user_id"
│
├── 📧 RECORDING EMAIL
│   ├── recording_email_copy: "Thanks for the call..."
│   ├── recording_email_subject: "Recording scheduling..."
│   ├── recording_email_sent_at: Timestamp
│   └── recording_email_sent_by: "user_id"
│
├── 📧 PREP EMAIL (sent to client)
│   ├── prep_email_copy: "Hi Sarah, Your recording..."
│   ├── prep_email_subject: "Preparing for your appearance"
│   ├── prep_email_sent_at: Timestamp
│   ├── prep_email_sent_by: "user_id"
│   └── prep_email_type: "recording" | "screening"
│
├── 📅 IMPORTANT DATES
│   ├── screening_call_date: Timestamp
│   ├── screening_call_notes: "Discussed topics..."
│   ├── recording_date: Timestamp
│   ├── recording_notes: "45 min episode..."
│   ├── live_date: Timestamp
│   └── live_episode_url: "https://..."
│
├── 💬 COMMUNICATION
│   ├── email_thread: [...] (complete history)
│   └── notes: [...] (internal notes)
│
└── 🕐 METADATA
    ├── created_at: Timestamp
    ├── updated_at: Timestamp
    └── host_email: "contact@podcast.com"
```

---

## 8. Exit Statuses

### Negative / Archive Statuses

| Status | Meaning | When to use |
|--------|---------|-------------|
| `no_response` | No response | After 2nd follow-up with no response |
| `declined_by_host` | Host refuses | They respond "no thanks" |
| `client_declined` | Client refuses | Client doesn't want this podcast |
| `paid_podcast` | Paid podcast | Discover they require payment |
| `cancelled` | Cancellation | After scheduling, cancellation |
| `email_bounced` | Invalid email | Email bounces |
| `blacklist` | Do not contact | Unprofessional behavior |

### How to Archive

1. **Drag & Drop** the card to the corresponding column
2. Or use the **status dropdown** on the card

---

## 9. Concrete Examples

### Scenario A: Successful Outreach (Best Case)

```
📅 Day 0
├── Danielle finds "The Health Innovators Show" (score 8.5)
├── Assigns to client "Dr. Sarah Johnson"
└── Card appears in "Ready for Outreach"

📅 Day 0 (continued)
├── Clicks "1st Email"
├── Modal opens with AI-generated pitch
├── Edits slightly, clicks "Open Gmail"
├── Sends the email
└── Status → "1st Email Sent"

📅 Day 5
├── No response, "Follow Up 1" button appears
├── Clicks, generates follow-up, sends
└── Status → "1st Followup Sent"

📅 Day 8
├── Host responds: "Sounds interesting!"
├── Drags card to "In Contact"
└── Then to "Scheduling Screening"

📅 Day 10
├── Screening set for the 15th
├── Clicks "Screening Done"
└── Status → "Screening Scheduled"

📅 Day 13 (2 days before screening)
├── "Send Prep" button appears
├── Generates preparation email
└── Sends to CLIENT (Dr. Sarah)

📅 Day 15
├── Screening call completed
├── All OK, drags to "Scheduling Recording"
└── Sets recording date for the 25th

📅 Day 16
├── Clicks "Rec. Scheduled"
└── Status → "Recording Scheduled"

📅 Day 22 (3 days before)
├── "Send Prep" reappears
└── Sends reminder to client

📅 Day 25
├── Recording done!
├── Clicks "Recorded"
└── Status → "Recorded"

📅 Day 40
├── Episode published!
├── Clicks "Mark Live"
├── Adds episode link
└── Status → "Live" ✅

🎉 SUCCESS!
```

### Scenario B: No Response

```
📅 Day 0
├── Assigns podcast
└── Sends 1st Email

📅 Day 5
├── No response
└── Sends Follow Up 1

📅 Day 10
├── Still nothing
└── Sends Follow Up 2

📅 Day 15
├── Radio silence
├── Drags to "No Response"
└── Archived

⏸️ Can be revisited in 1-2 months
```

### Scenario C: Host Declines

```
📅 Day 0
└── Sends 1st Email

📅 Day 2
├── Host responds: "Thanks but we're fully booked"
├── Drags to "Declined by Host"
└── Archived

❌ Done, move to next one
```

---

## 10. FAQ / Troubleshooting

### The Follow Up button doesn't appear?

**Cause**: 5 days haven't passed yet since the last email.

**Solution**: Check the date in `outreach_date` or `first_email_sent_at`. Wait for 5 days to pass.

---

### The Send Prep button doesn't appear?

**Possible causes**:
1. Status is not `screening_scheduled` or `recording_scheduled`
2. The screening/recording date is not set
3. The date is more than 5 days away
4. The prep email has already been sent

**Solution**: Check the status and make sure a date is set within the next 5 days.

---

### How do I see the email history?

Copies of all emails are saved:
- `first_email_copy` - First email
- `first_followup_copy` - Follow-up 1
- `second_followup_copy` - Follow-up 2
- `prep_email_copy` - Prep email

To view: click on the card or check the Firestore database.

---

### The Kanban is slow to load?

**Normal**: The first load may take a few seconds (Firestore read).

**Optimization**: Data is cached for 2 minutes. The 2nd load will be instant.

---

### How do I edit an email before sending?

1. In the modal, the text is **editable**
2. Click in the field to modify
3. Or click **"Regenerate"** for a new AI version
4. Once satisfied, click **"Open Gmail"**

---

### The generated email isn't good?

1. Click **"Regenerate"** for a new version
2. Or edit manually in the modal
3. Check that client/podcast info is complete in the database

---

### How do I add a note to an outreach?

Feature coming soon. For now, use the `notes` field in the database or the `screening_call_notes` field.

---

## 11. Appendix: Complete AI Prompts

### Follow-up 1 Prompt

```
You are Ruth from Badassery, a podcast booking agency.
Write a FIRST follow-up email for a pitch sent a few days ago with no response.

=== ORIGINAL EMAIL ===
{previous_message}

=== CONTEXT ===
- Podcast: {podcast_name}
- Host: {host_name}
- Client: {client_name} ({client_title})
- Client expertise: {client_expertise}

=== INSTRUCTIONS ===
1. Be brief (3-4 sentences max)
2. Reference your previous email
3. Add a new reason to respond (highlight a different angle or expertise)
4. End with a simple question
5. Tone: friendly but professional
6. Sign off: "Best, Ruth"
7. DO NOT use [brackets] or placeholders - use actual names provided
8. Write ONLY the email body (no subject line)
```

### Follow-up 2 Prompt

```
You are Ruth from Badassery, a podcast booking agency.
This is the SECOND and FINAL follow-up after 2 emails with no response.

=== PREVIOUS EMAIL SENT ===
{previous_message}

=== CONTEXT ===
- Podcast: {podcast_name}
- Host: {host_name}
- Client: {client_name} ({client_title})
- Client expertise: {client_expertise}

=== INSTRUCTIONS ===
1. Very brief (2-3 sentences)
2. Mention this is your last message
3. Offer an exit ("if now isn't the right time...")
4. End on a positive note
5. Sign off: "Best, Ruth"
6. DO NOT use [brackets] or placeholders - use actual names provided
7. Write ONLY the email body (no subject line)
```

### Screening Email Prompt

```
You are Ruth from Badassery. The podcast host responded positively!
You need to propose a screening call to discuss the episode.

=== PREVIOUS CONVERSATION ===
{previous_message}

=== INFORMATION ===
- Podcast: {podcast_name}
- Host: {host_name}
- Client: {client_name} ({client_title})
- Client topics: {client_topics}

=== INSTRUCTIONS ===
1. Thank them for the positive response
2. Briefly explain the screening call (15-20 min to discuss topics)
3. Offer to send a calendar link or ask for their availability
4. Be enthusiastic but professional
5. Sign off: "Best, Ruth"
6. DO NOT use [brackets] or placeholders - use actual names provided
7. Write ONLY the email body (no subject line)
```

### Recording Email Prompt

```
You are Ruth from Badassery. The screening call went well!
Now you need to coordinate the recording date.

=== PREVIOUS CONVERSATION ===
{previous_message}

=== INFORMATION ===
- Podcast: {podcast_name}
- Host: {host_name}
- Client: {client_name}
- Screening notes: {screening_notes}

=== INSTRUCTIONS ===
1. Thank them for the screening call
2. Express enthusiasm for the episode
3. Ask for their availability for recording
4. Mention estimated duration if known
5. Sign off: "Best, Ruth"
6. DO NOT use [brackets] or placeholders - use actual names provided
7. Write ONLY the email body (no subject line)
```

### Prep Email Prompt (sent to CLIENT)

```
You are Ruth from Badassery, a podcast booking agency.
Write a PREP EMAIL to send to the CLIENT (not the host) to prepare them
for their upcoming podcast recording.

=== PODCAST DETAILS ===
- Podcast Name: {podcast_name}
- Host Name: {host_name}
- Recording Date: {recording_date}
- Podcast Description: {podcast_description}
- Podcast Link: {podcast_link}

=== CLIENT INFO ===
- Client: {client_name}
- Topics to discuss: {client_topics}

=== INSTRUCTIONS ===
1. Address the client by first name
2. Remind them of the upcoming recording date/time
3. Include key info about the podcast:
   - Brief description of the show
   - Host name and style
   - Audience demographics if known
4. Suggest they listen to 1-2 recent episodes
5. Include the podcast link if available
6. Remind them of talking points/topics
7. Offer any last-minute assistance
8. Sign off: "Best, Ruth"
9. DO NOT use [brackets] or placeholders - use actual names and info provided
10. Write ONLY the email body (no subject line)
```

---

## Quick Reference

| Action | Required Status | Result |
|--------|-----------------|--------|
| Assign podcast | - | Creates outreach `ready_for_outreach` |
| 1st Email | `ready_for_outreach` | → `1st_email_sent` |
| Follow Up 1 | `1st_email_sent` + 5 days | → `1st_followup_sent` |
| Follow Up 2 | `1st_followup_sent` + 5 days | → `2nd_followup_sent` |
| Screening Email | `in_contact` | → `scheduling_screening` |
| Screening Done | `scheduling_screening` | → `screening_scheduled` |
| Recording Email | `screening_scheduled` | → `scheduling_recording` |
| Rec. Scheduled | `scheduling_recording` | → `recording_scheduled` |
| Recorded | `recording_scheduled` | → `recorded` |
| Mark Live | `recorded` | → `live` ✅ |
| Send Prep | `*_scheduled` + date ≤5 days | Email to client |

---

*Documentation generated for Badassery PR - PodPitch v1.0*
