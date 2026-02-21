# MySavedPlaces — Product Requirements Document

A mobile iOS app that lets users quickly save restaurants and activities they discover from TikTok, Instagram, the web, or manual search, and maintain a personal, searchable list with notes and reviews.

**Core Value:** Reduce friction between discovery and remembering places to visit.

**Primary Capture Methods:**

- Share from TikTok/IG → save
- Google Places autocomplete search → save
- *(Later)* Photo + AI recognition

---

## 1. MVP Scope (v1)

### Included

- iOS app
- User authentication
- Manual Google Places search + save
- Share-to-app from TikTok/IG/web
- Google place data integration
- Personal notes
- Filters
- Saved places list
- Offline viewing of saved entries
- Duplicate prevention
- Private profiles

### Excluded (Later)

- Map tab
- Photo recognition
- GPS auto-detect
- AI recommender
- Social features (shared lists, friends, public discovery feed, collaborative lists)

---

## 2. Target Users

- Individual users saving food/activity spots
- Heavy social media consumers
- Urban users discovering via reels

**Initial scale:** ~50 users

---

## 3. Platforms

### MVP

- iOS only
- Native or React Native (recommended for future cross-platform)

### Offline Behavior

| Allowed Offline | Not Allowed Offline |
|---|---|
| View saved places | Search |
| View notes | Link extraction |
| | Google API data refresh |
| | Filtering by distance |

---

## 4. Core User Flows

### Flow A — Manual Save

**User:** Search tab → Google Places autocomplete → Select place → Confirmation screen → Add optional note → Save

**System:**

1. Fetch Google Place ID
2. Store Place ID
3. Cache snapshot data
4. Check duplicate
5. Save to DB

### Flow B — Share from TikTok / IG

**User:** Share → MySavedPlaces → App opens confirmation screen

**System pipeline:**

1. Receive shared URL
2. Extract page metadata
3. Attempt place name extraction
4. Run Google Places search query
5. Match best candidate
6. Present confirmation screen with matched place

**User:**

- Confirms or cancels
- Adds optional note
- Save

### Flow C — View Saved Places

**User:** List tab → View saved places

**Default sort:** Newest first

**Card fields:**

- Place name
- Category
- Cuisine
- Rating (Google)
- Price range
- Address
- Personal note preview
- Saved date

---

## 5. Features

### 5.1 Authentication

**Methods:**

- Apple ID
- Google login
- Phone number OTP

**Rules:**

- Accounts remain separate (no auto merge)
- Profile default = private
- Multi-device sync required

### 5.2 Save Confirmation Screen

Required before saving.

**Fields:**

| Field | Required |
|---|---|
| Place name | Yes |
| Address | Yes |
| Category | Yes |
| Cuisine | Yes |
| Rating | Yes |
| Price range | Yes |
| User note | No (text field) |
| Date visited | No (date picker) |

**Actions:** Save / Cancel

### 5.3 Duplicate Detection

- **Duplicate** = same Google Place ID for same user
- **Behavior:** Block save, show message: "Already saved"

### 5.4 Google API Integration

**APIs Used:**

- Google Places Autocomplete
- Place Details API
- Place Search API

**Stored Data:**

| Field | Purpose |
|---|---|
| Google Place ID | Primary reference |
| Name | Display |
| Address | Display |
| Lat/Lng | Distance filter |
| Rating | Display |
| Price level | Display / filter |
| Types | Category mapping |
| Cuisine tags | Mapped from Google types |
| Category | Mapped from Google types |

> Cached snapshots reduce repeated API calls and enable offline viewing.

### 5.5 Filters (MVP)

All required:

- **Category** — restaurant / cafe / bar / activity / gym / etc.
- **Cuisine type**
- **Price range**
- **Distance** — uses cached lat/lng + user location

> Distance filter requires location permission; calculated locally.

### 5.6 Categories System

Predefined only.

**Top-level categories:**

- Restaurant
- Cafe
- Bar
- Activity
- Gym
- Entertainment
- Other

**Cuisine types:** Mapped from Google types → normalized internal list.

### 5.7 Notes

- Simple text field
- Editable anytime
- No formatting
- One note per place

### 5.8 Ratings & Reviews

**MVP:** Display Google rating only (no user rating yet)

**Later:** Native user ratings

### 5.9 Offline Mode

| Cached Locally | Disabled Offline |
|---|---|
| Saved places | Search |
| Notes | Share-save matching |
| Cached snapshot fields | Filters by distance |
| | Google refresh |

---

## 6. Data Model (MVP)

### User

| Field | Type |
|---|---|
| `user_id` | PK |
| `email` | string |
| `auth_provider` | string |
| `profile_private` | bool |
| `created_at` | timestamp |

### SavedPlace

| Field | Type |
|---|---|
| `id` | PK |
| `user_id` | FK → User |
| `google_place_id` | FK → PlaceCache |
| `note_text` | text |
| `date_visited` | nullable date |
| `saved_at` | timestamp |

### PlaceCache

| Field | Type |
|---|---|
| `google_place_id` | PK |
| `name` | string |
| `address` | string |
| `lat` | float |
| `lng` | float |
| `rating` | float |
| `price_level` | int |
| `category` | string |
| `cuisine` | string |
| `last_refreshed` | timestamp |

---

## 7. Screens

### Auth Screens

- Login
- Sign up
- Provider selection

### Main Tabs (MVP)

| Tab | Contents |
|---|---|
| **List** | Saved places list, filter button, sort newest |
| **Search** | Google autocomplete search → select → confirmation → save |
| **Profile** | Privacy toggle, logout |

> Map tab hidden entirely in MVP.

---

## 8. Link → Place Extraction Logic

**Input:** TikTok / IG / web URL

**Pipeline:**

```
URL → metadata scrape
    → extract text/title
    → NLP place-name guess
    → Google Places search
    → top confidence match
    → confirmation screen
```

**Fallback:** Show "Place not detected — search manually"

---

## 9. Architecture (Recommended)

### Frontend

- **SwiftUI** — best for iOS MVP
- **React Native** — better long-term for cross-platform

### Backend

- **Firebase or Supabase** — fastest MVP path

**Backend needs:**

- Auth
- Database
- Sync
- Hosting
- Storage

**Local cache:** SQLite or CoreData

---

## 10. Permissions Required

- Location (for distance filter)
- Share extension access

---

## 11. Edge Cases

- Link contains multiple restaurants
- Google match wrong → user cancels
- Closed businesses
- Place missing cuisine tags
- API quota exceeded
- Duplicate business locations (chains)

---

## 12. Future Roadmap

### V2

- Map tab
- AI photo recognition
- GPS auto capture
- Voice note save
- Native user ratings
- Visit logs

### V3

- Social graph
- Shared lists
- Friends
- Public profiles
- Discovery feed
- Collaborative lists

### V4

- AI recommender by location
- Similar-place suggestions
- Paid discovery layer

---

## 13. Monetization Options (Later)

- **Pro subscription:** Map suggestions, AI recommendations, public discovery feed
- **Affiliate links**
- **Sponsored restaurants**
- **API data analytics layer**
