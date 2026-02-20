# Test Outreach Data - Client "hgfd"

Generated: January 21, 2026
Client Name: hgfd Test
Total outreach to create: **51 records**

---

## How to Create Test Data

1. **Navigate to the Test Data Generator page:**
   - Login to the app
   - Go to URL: `http://localhost:3004` (or your current port)
   - In the browser console, type: `setActiveTab('test-data')` to access the hidden page
   - OR modify App.tsx to add a navigation link

2. **Click "Create Test Data"**
   - This will create ~51 test outreach records
   - All will be linked to the client "hgfd"

3. **Go to the Kanban** (`/outreach-kanban`)
   - Filter by client "hgfd" to see only test data

4. **Delete test data when done:**
   - Click "Delete Test Data" on the generator page

---

## OUTREACH BY STATUS

### 1. `identified` (3 outreach)

| Label | Expected Badge | Days Since | Condition |
|-------|---------------|------------|-----------|
| ID-1 | **🔵 To Validate** | - | Always shows for `identified` |
| ID-2 | **🔵 To Validate** | - | Always shows for `identified` |
| ID-3 | **🔵 To Validate** | - | Always shows for `identified` |

**Fields set:**
- `status`: "identified"
- `client_name`: "hgfd"
- `podcast_name`: (random podcast)
- `created_at`: now
- `updated_at`: now

**Expected UI:**
- Blue border
- Blue badge "⚡ To Validate"
- Button: "Ready for Outreach" (green)

---

### 2. `ready_for_outreach` (3 outreach)

| Label | Expected Badge | Days Since | Condition |
|-------|---------------|------------|-----------|
| RDY-1 | **🟢 Send Pitch** | - | Always shows for `ready_for_outreach` |
| RDY-2 | **🟢 Send Pitch** | - | Always shows |
| RDY-3 | **🟢 Send Pitch** | - | Always shows |

**Fields set:**
- `status`: "ready_for_outreach"
- `status_category`: "active"

**Expected UI:**
- Green border
- Green badge "⚡ Send Pitch"
- No action buttons (first email is done via AIMatching or manually)

---

### 3. `1st_email_sent` (3 outreach with varied dates)

| Label | Expected Badge | Days Since | Condition |
|-------|---------------|------------|-----------|
| 1ST-A (2d) | **(none)** | 2 | Too recent, no badge |
| 1ST-B (5d) | **🟠 Follow-up 1 (5 days)** | 5 | 5+ days = orange badge |
| 1ST-C (8d) | **🟠 Follow-up 1 (8 days)** | 8 | 5+ days = orange badge |

**Fields set:**
- `status`: "1st_email_sent"
- `outreach_date`: (varies by days ago)
- `first_email_copy`: "Hi [Host Name]..."
- `first_email_subject`: "Guest Pitch: hgfd for [Podcast]"
- `first_email_sent_at`: (varies)

**Expected UI:**
- 1ST-A: Gray border, no badge
- 1ST-B/C: Orange border, orange badge
- Button: "Follow Up 1" (visible on all)

---

### 4. `1st_followup_sent` (3 outreach with varied dates)

| Label | Expected Badge | Days Since | Condition |
|-------|---------------|------------|-----------|
| FU1-A (3d) | **(none)** | 3 | Too recent |
| FU1-B (5d) | **🟠 Follow-up 2 (5 days)** | 5 | 5+ days = orange badge |
| FU1-C (10d) | **🟠 Follow-up 2 (10 days)** | 10 | 5+ days = orange badge |

**Fields set:**
- `status`: "1st_followup_sent"
- `outreach_date`: (varies)
- `first_email_copy`: (set)
- `first_followup_copy`: "Just following up..."
- `first_followup_sent_at`: (varies)

**Expected UI:**
- FU1-A: Gray border, no badge
- FU1-B/C: Orange border, orange badge
- Button: "Follow Up 2"

---

### 5. `2nd_followup_sent` (3 outreach with varied dates)

| Label | Expected Badge | Days Since | Condition |
|-------|---------------|------------|-----------|
| FU2-A (4d) | **(none)** | 4 | Not yet 7 days |
| FU2-B (7d) | **🔴 No Response? (7 days)** | 7 | 7+ days = red badge |
| FU2-C (14d) | **🔴 No Response? (14 days)** | 14 | 7+ days = red badge |

**Fields set:**
- `status`: "2nd_followup_sent"
- `outreach_date`: (varies)
- `first_email_copy`: (set)
- `first_followup_copy`: (set)
- `second_followup_copy`: "Checking in one more time..."
- `second_followup_sent_at`: (varies)

**Expected UI:**
- FU2-A: Gray border, no badge
- FU2-B/C: Red border, red badge
- Button: "Handle Response"

---

### 6. `in_contact` (3 outreach)

| Label | Expected Badge | Days Since | Condition |
|-------|---------------|------------|-----------|
| CONT-1 | **(none)** | 1 | No badge for in_contact |
| CONT-2 | **(none)** | 2 | No badge |
| CONT-3 | **(none)** | 3 | No badge |

**Expected UI:**
- No badge
- Button: "Screening" (to send scheduling email)

---

### 7. `scheduling_screening` (3 outreach)

| Label | Expected Badge | Condition |
|-------|---------------|-----------|
| SCHSC-1 | **(none)** | No badge |
| SCHSC-2 | **(none)** | No badge |
| SCHSC-3 | **(none)** | No badge |

**Expected UI:**
- Button: "Screening Done" (marks as screening_scheduled)

---

### 8. `screening_scheduled` (3 outreach with varied dates)

| Label | Expected Badge | Days Until | Condition |
|-------|---------------|------------|-----------|
| SCRN-A (10d) | **(none)** | 10 | Too far, no prep needed |
| SCRN-B (4d) | **🟣 Send Prep** | 4 | ≤5 days = purple badge |
| SCRN-C (2d) | **🟣 Send Prep** | 2 | ≤5 days = purple badge |

**Fields set:**
- `status`: "screening_scheduled"
- `screening_call_date`: (varies - future dates)

**Expected UI:**
- SCRN-A: No badge
- SCRN-B/C: Purple border, purple badge
- Button: "Recording" (to send recording scheduling email)
- Button: "Send Prep" (if ≤5 days before screening)

---

### 9. `scheduling_recording` (3 outreach)

| Label | Expected Badge | Condition |
|-------|---------------|-----------|
| SCHREC-1 | **(none)** | No badge |
| SCHREC-2 | **(none)** | No badge |
| SCHREC-3 | **(none)** | No badge |

**Expected UI:**
- Button: "Rec. Scheduled"

---

### 10. `recording_scheduled` (3 outreach with varied dates)

| Label | Expected Badge | Days Until | Condition |
|-------|---------------|------------|-----------|
| REC-A (8d) | **(none)** | 8 | Too far |
| REC-B (3d) | **🟣 Send Prep** | 3 | ≤5 days = purple badge |
| REC-C (1d) | **🟣 Send Prep** | 1 | ≤5 days = purple badge |

**Fields set:**
- `status`: "recording_scheduled"
- `recording_date`: (varies - future dates)

**Expected UI:**
- REC-A: No badge
- REC-B/C: Purple border, purple badge
- Button: "Recorded"
- Button: "Send Prep" (if ≤5 days before recording)

---

### 11. `recorded` (3 outreach)

| Label | Expected Badge | Days Since Recording |
|-------|---------------|---------------------|
| RECD-1 | **(none)** | 5 |
| RECD-2 | **(none)** | 10 |
| RECD-3 | **(none)** | 15 |

**Expected UI:**
- Button: "Mark Live"

---

### 12. `live` (3 outreach)

| Label | Expected Badge | Days Live |
|-------|---------------|-----------|
| LIVE-1 | **(none)** | 2 |
| LIVE-2 | **(none)** | 7 |
| LIVE-3 | **(none)** | 14 |

**Fields set:**
- `status`: "live"
- `live_date`: (varies)
- `live_episode_url`: "https://example.com/episode/X"

**Expected UI:**
- No buttons (workflow complete)

---

### 13. Parking/Closed Statuses

| Status | Count | Fields Set |
|--------|-------|------------|
| `no_response` | 2 | `close_reason`, `close_notes` |
| `declined_by_host` | 2 | `close_reason`, `close_notes` |
| `client_declined` | 2 | `close_reason`, `close_notes` |
| `cancelled` | 1 | `close_reason`, `close_notes` |
| `email_bounced` | 1 | `close_reason`, `close_notes` |
| `paid_podcast` | 1 | `close_reason`, `close_notes` |
| `backlog` | 2 | `parking_reason`, `parking_notes` |
| `follow_up_1_month` | 2 | `parking_reason`, `parking_notes`, `parking_until` |
| `blacklist` | 1 | `blacklist`, `blacklist_reason` |

---

## VISUAL INDICATOR SUMMARY

| Badge | Color | Border | Statuses |
|-------|-------|--------|----------|
| ⚡ To Validate | Blue | `border-blue-300` | `identified` |
| ⚡ Send Pitch | Green | `border-green-300` | `ready_for_outreach` |
| ⚡ Follow-up 1 (X days) | Orange | `border-orange-300` | `1st_email_sent` (5+ days) |
| ⚡ Follow-up 2 (X days) | Orange | `border-orange-300` | `1st_followup_sent` (5+ days) |
| ⚡ No Response? (X days) | Red | `border-red-300` | `2nd_followup_sent` (7+ days) |
| ⚡ Send Prep | Purple | `border-purple-300` | `screening_scheduled` / `recording_scheduled` (≤5 days) |

---

## WORKFLOW TRANSITION TESTS

After creating test data, manually test these transitions:

| # | Start Status | Action | End Status | Verify |
|---|--------------|--------|------------|--------|
| T1 | `identified` | Click "Ready for Outreach" | `ready_for_outreach` | Badge changes green |
| T2 | `1st_email_sent` (5d) | Click "Follow Up 1" | Modal opens | Email generates |
| T3 | Modal | Click "Copy & Mark Sent" | `1st_followup_sent` | Status updates, outreach_date updates |
| T4 | `1st_followup_sent` (5d) | Click "Follow Up 2" | Modal opens | Email generates |
| T5 | Modal | Click "Copy & Mark Sent" | `2nd_followup_sent` | Status updates |
| T6 | `2nd_followup_sent` (7d) | Click "Handle Response" | Modal opens | Options shown |
| T7 | Modal | Select "No Response" | `no_response` | Moves to closed column |
| T8 | Modal | Select "Got Response" → "In Contact" | `in_contact` | Moves to active column |
| T9 | `in_contact` | Click "Screening" | Modal opens | Email generates |
| T10 | `scheduling_screening` | Click "Screening Done" | `screening_scheduled` | Status updates |
| T11 | `screening_scheduled` (4d) | Click "Send Prep" | Modal opens | Email to CLIENT |
| T12 | `screening_scheduled` | Click "Recording" | Modal opens | Email generates |
| T13 | `scheduling_recording` | Click "Rec. Scheduled" | `recording_scheduled` | Status updates |
| T14 | `recording_scheduled` (3d) | Click "Send Prep" | Modal opens | Email to CLIENT |
| T15 | `recording_scheduled` | Click "Recorded" | `recorded` | Status updates |
| T16 | `recorded` | Click "Mark Live" | `live` | Workflow complete |

---

## CHECKLIST AFTER TESTING

- [ ] All badges display correctly based on conditions
- [ ] All buttons appear on correct statuses
- [ ] Transitions update status correctly
- [ ] `outreach_date` updates when emails are sent
- [ ] Email copies are saved to Firestore
- [ ] Modal shows correct recipient (HOST vs CLIENT for prep)
- [ ] "Last email: X days ago" displays correctly
- [ ] Cards move to correct columns after status change

---

## CLEANUP

To delete all test data:
1. Go to Test Data Generator page
2. Click "Delete Test Data"
3. Confirm deletion

This will remove all outreach records for client "hgfd".
