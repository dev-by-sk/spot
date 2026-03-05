# Async Share-to-Spot — Implementation Plan

## Overview

Currently, sharing a TikTok/Instagram/web URL to spot. opens the app, runs LLM extraction synchronously, and prompts the user to confirm/save. This plan makes the entire flow **asynchronous**: the user shares a URL without leaving TikTok, extraction happens server-side in the background, and a new **Pending** tab lets the user review and save/discard extracted places when they return to spot.

## Design Decisions

| Decision | Choice |
|---|---|
| App behavior on share | **Don't open the app** — native iOS Share Extension captures URL and dismisses |
| Extraction timing | **Server-side immediately** — edge function processes while user keeps scrolling |
| Pending UX | **List with action buttons** — Save/Discard per card, tap for details |
| Expiry | **7-day auto-expiry** — pending items auto-discarded after 7 days |
| Failed extractions | **Silently discarded** — don't clutter pending tab with failures |

---

## Phase 1: Server-Side Async Extraction Pipeline

> **Goal:** Move the entire extraction pipeline (oEmbed/scrape → LLM → Google Places lookup) to a single Supabase edge function, storing results in a new `pending_extractions` table.

### 1.1 New Supabase Table: `pending_extractions`

Create via Supabase SQL editor or migration:

```sql
CREATE TABLE pending_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),

  -- Extracted place data (populated when status = 'completed')
  google_place_id TEXT,
  place_name TEXT,
  place_address TEXT,
  place_lat REAL,
  place_lng REAL,
  place_rating REAL,
  place_price_level INTEGER,
  place_category TEXT,
  place_cuisine TEXT,
  place_website TEXT,
  place_phone_number TEXT,
  place_opening_hours JSONB,
  place_opening_hours_periods JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  reviewed_at TIMESTAMPTZ  -- set when user saves or discards
);

-- Index for fetching user's pending items
CREATE INDEX idx_pending_extractions_user
  ON pending_extractions(user_id, status)
  WHERE reviewed_at IS NULL;

-- Enable RLS
ALTER TABLE pending_extractions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own pending extractions
CREATE POLICY "Users see own pending extractions"
  ON pending_extractions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update (save/discard) their own pending extractions
CREATE POLICY "Users update own pending extractions"
  ON pending_extractions FOR UPDATE
  USING (auth.uid() = user_id);

-- Only edge functions (service role) can insert
CREATE POLICY "Service role inserts pending extractions"
  ON pending_extractions FOR INSERT
  WITH CHECK (true);  -- Edge function uses service_role key
```

**Expiry cleanup** — add a Supabase cron job (pg_cron) or handle client-side:

```sql
-- Option A: pg_cron (if available on your Supabase plan)
SELECT cron.schedule(
  'cleanup-expired-extractions',
  '0 3 * * *',  -- daily at 3 AM UTC
  $$DELETE FROM pending_extractions WHERE expires_at < now()$$
);

-- Option B: Delete expired on fetch (client-side query filter)
-- Just filter with .lte('expires_at', new Date().toISOString()) on queries
```

### 1.2 New Edge Function: `async-extract-place`

**Path:** `supabase/functions/async-extract-place/index.ts`

This function does the **full pipeline** that currently happens client-side across `shareExtractionService.ts` + `extract-place` + `google-places-proxy`:

```
Receive URL → Insert pending row (status: processing)
  → oEmbed fetch (TikTok/Instagram)
  → Fallback: HTML scrape for og:title/og:description
  → Sanitize metadata
  → Call OpenAI GPT-4o-mini for place name extraction
  → Google Places text search
  → Google Places details fetch
  → Update pending row with place data (status: completed)
  → On any failure: update status to 'failed'
```

**Key differences from existing `extract-place`:**
- Accepts a `url` (not pre-extracted `title`/`description`) — does the full pipeline
- Writes results directly to `pending_extractions` table (uses `SUPABASE_SERVICE_ROLE_KEY`)
- Calls Google Places API directly (same logic as `google-places-proxy` search + details)
- Handles failures gracefully — sets `status = 'failed'` instead of returning error to client
- Deduplication: check if same `source_url` already pending for this user, skip if so

**Auth:** Still validates user JWT to get `user_id`, but uses service role key for DB writes.

**Response:** Returns immediately with `{ queued: true }` after inserting the pending row. The rest of the pipeline runs in the same request but the share extension doesn't wait for it (fire-and-forget from the extension's perspective — though Supabase edge functions do run to completion).

> **Note:** Supabase edge functions have a 150s execution limit on the Pro plan (60s on Free). The full pipeline (oEmbed + LLM + 2 Google API calls) should complete in 5-15s, well within limits.

**Environment variables needed (already set for existing functions):**
- `OPENAI_API_KEY`
- `GOOGLE_PLACES_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (new — needed for DB writes bypassing RLS)

### 1.3 Files to Create/Modify

| Action | File | Details |
|---|---|---|
| **Create** | `supabase/functions/async-extract-place/index.ts` | Full extraction pipeline edge function |
| **Modify** | Supabase SQL (dashboard or migration) | `pending_extractions` table + RLS policies |
| **No change** | `supabase/functions/extract-place/index.ts` | Keep existing function for backward compat |
| **No change** | `supabase/functions/google-places-proxy/index.ts` | Keep for client-side search functionality |

---

## Phase 2: Native iOS Share Extension

> **Goal:** Replace the expo-share-intent "open the app" behavior with a native Share Extension that sends the URL to the server and dismisses — the user never leaves TikTok.

### 2.1 Architecture

iOS Share Extensions are separate binaries that run in their own process. They can:
- Receive shared URLs/text from the iOS share sheet
- Make network requests (within ~30s time limit)
- Communicate with the main app via **App Groups** (shared Keychain, UserDefaults, or files)

The extension needs the user's **Supabase auth token** to call the edge function. This token is currently stored in `expo-secure-store`. The extension will access it via **Keychain Sharing** (App Groups).

### 2.2 Setup Steps

#### a) App Group & Keychain Sharing

1. In Apple Developer portal, create App Group: `group.com.spot.app`
2. Enable App Groups capability on both:
   - Main app target: `com.spot.app`
   - Share Extension target: `com.spot.app.share-extension`
3. Enable Keychain Sharing with access group: `com.spot.app`

#### b) Expo Config Plugin (Custom)

Since Expo manages the Xcode project, we need a **config plugin** to:
- Add the Share Extension target to the Xcode project
- Configure App Groups entitlements on both targets
- Set up Keychain Sharing
- Bundle the Share Extension code

Create `plugins/withShareExtension.js` — an Expo config plugin that modifies the iOS project during `npx expo prebuild`.

> **Complexity note:** This is the hardest part of the entire feature. Writing Expo config plugins that add native targets requires deep knowledge of Xcode project structure. Consider using the community package [`expo-share-extension`](https://github.com/nicfontaine/expo-share-extension) or [`react-native-share-menu`](https://github.com/meedan/react-native-share-menu) if they support fire-and-forget (no app open) mode. If not, a custom config plugin is required.

#### c) Share Extension Code (Swift)

**Path:** `ios/ShareExtension/ShareViewController.swift`

```
User taps "spot." in share sheet
  → Extension receives URL
  → Reads auth token from shared Keychain
  → POST to async-extract-place edge function (fire-and-forget)
  → Shows brief "Sent to spot!" confirmation (0.5s)
  → Dismisses share sheet
  → User stays in TikTok
```

**Handling edge cases:**
- **No auth token:** Show "Please open spot. and sign in first" message
- **No network:** Show "You're offline — open spot. to share this link later"
- **Token expired:** The edge function will return 401. Extension can show "Please open spot. to refresh your session." (Refreshing tokens in the extension is complex and not worth the effort initially.)

#### d) Shared Auth Token Storage

Modify `expo-secure-store` usage in `AuthContext.tsx` to store tokens in the **shared Keychain** (accessible by both main app and extension via App Groups):

```typescript
// Current: tokens stored in app-only Keychain
await SecureStore.setItemAsync('session_access_token', token);

// New: tokens stored in shared Keychain (App Group)
await SecureStore.setItemAsync('session_access_token', token, {
  keychainAccessGroup: 'group.com.spot.app',
});
```

> **Check:** Verify `expo-secure-store` supports `keychainAccessGroup`. If not, use a native module or direct Keychain API via the config plugin.

### 2.3 Relationship with expo-share-intent

**Recommendation: Remove `expo-share-intent`** once the native extension is working.

- `expo-share-intent` exists to handle share intents by opening the main app — which is exactly what we're replacing
- The deep linking URL filter in `App.tsx` (`getInitialURL`/`subscribe`) was built to work around expo-share-intent's behavior
- With a native extension that doesn't open the app, none of that machinery is needed

**Transition plan:**
1. Build and test the native Share Extension (Phase 2)
2. Verify it works independently
3. Remove `expo-share-intent` from `package.json` and `app.config.ts`
4. Remove `ShareIntentProvider` from `App.tsx` provider tree
5. Remove the `getInitialURL`/`subscribe` URL filter from `App.tsx` linking config
6. Simplify `ShareContext.tsx` — remove share-intent listening, keep as the provider for pending state if needed (or remove entirely if Pending tab fetches directly)

### 2.4 Files to Create/Modify

| Action | File | Details |
|---|---|---|
| **Create** | `plugins/withShareExtension.js` | Expo config plugin to add Share Extension target |
| **Create** | `ios/ShareExtension/ShareViewController.swift` | Share Extension UI + network call |
| **Create** | `ios/ShareExtension/Info.plist` | Extension config (activation rules, App Group) |
| **Modify** | `app.config.ts` | Add config plugin, App Group entitlements |
| **Modify** | `src/context/AuthContext.tsx` | Store tokens in shared Keychain |
| **Remove (later)** | `expo-share-intent` dependency | After native extension is verified working |
| **Simplify (later)** | `App.tsx` | Remove share intent URL filter + ShareIntentProvider |
| **Simplify (later)** | `src/context/ShareContext.tsx` | Remove share-intent listening logic |

---

## Phase 3: Pending Tab (Client-Side)

> **Goal:** New bottom tab where users review extracted places — save or discard each one.

### 3.1 Navigation Changes

Add a 4th tab to `MainTabNavigator.tsx`:

```
Tabs: My spots | Search | Pending | Profile
Icon: time-outline / time (Ionicons) — or "layers-outline" / "layers"
```

**Badge:** Show count of unreviewed pending items on the tab icon.

### 3.2 New Screen: `PendingScreen`

**Path:** `src/screens/pending/PendingScreen.tsx`

**UI layout:**
```
┌─────────────────────────────┐
│  Pending spots              │
│  3 places waiting for review│
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ 🍕 Joe's Pizza          │ │
│ │ 123 Main St, Brooklyn   │ │
│ │ ★ 4.5 · Restaurant      │ │
│ │ from: vm.tiktok.com/... │ │
│ │                         │ │
│ │  [Save]     [Discard]   │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 🍵 Cha Cha Matcha       │ │
│ │ 373 Broome St, NYC      │ │
│ │ ★ 4.2 · Cafe            │ │
│ │ from: instagram.com/... │ │
│ │                         │ │
│ │  [Save]     [Discard]   │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ ⏳ Processing...        │ │
│ │ vm.tiktok.com/ZMh...    │ │
│ │ Shared 2 min ago        │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

**Features:**
- Pull-to-refresh to fetch latest pending items from Supabase
- Auto-fetch on tab focus (React Navigation `useFocusEffect`)
- Cards show: place name, address, rating, category, source URL, time since shared
- Cards in "processing" state show a spinner + source URL
- **Save** button → opens a mini-modal for optional note + date visited, then saves (reuses existing `savePlace` flow from PlacesContext)
- **Discard** button → confirmation alert → marks as reviewed in Supabase (or deletes)
- Empty state: "No pending spots. Share a TikTok or Instagram link to get started!"
- **7-day expiry indicator:** Show "Expires in X days" on each card (subtle, secondary text)

### 3.3 New Component: `PendingPlaceCard`

**Path:** `src/components/PendingPlaceCard.tsx`

Similar to existing `PlaceCard` but with:
- Save / Discard action buttons
- Source URL display (truncated)
- "Processing..." state variant
- Expiry countdown text

### 3.4 Pending Context or Service

**Option A: Direct Supabase queries (simpler, recommended)**

Create `src/services/pendingService.ts`:

```typescript
// Fetch all pending (non-expired, non-reviewed) extractions for current user
async function fetchPendingExtractions(): Promise<PendingExtraction[]>

// Mark as reviewed (user saved or discarded)
async function dismissPendingExtraction(id: string): Promise<void>

// Get count of pending items (for tab badge)
async function getPendingCount(): Promise<number>
```

**Option B: Full context provider**

Create `src/context/PendingContext.tsx` if state needs to be shared across components (e.g., badge count on tab). This may be needed for the badge count to reactively update.

**Recommendation:** Start with a lightweight context that holds `pendingCount` and `pendingItems`, with methods to fetch/dismiss. Keep it simple.

### 3.5 Save Flow

When user taps "Save" on a pending card:

1. Open a bottom sheet or mini-modal with:
   - Place name (read-only)
   - Note text input (optional)
   - Date visited picker (optional)
2. On confirm, call existing `PlacesContext.savePlace()` with the place data
3. Mark the pending extraction as reviewed (`reviewed_at = now()`)
4. Remove from pending list with animation
5. Show success toast

### 3.6 New Types

Add to `src/types/`:

```typescript
interface PendingExtraction {
  id: string;
  sourceUrl: string;
  status: 'processing' | 'completed' | 'failed';
  placeName: string | null;
  placeAddress: string | null;
  placeLat: number | null;
  placeLng: number | null;
  placeRating: number | null;
  placePriceLevel: number | null;
  placeCategory: string | null;
  placeCuisine: string | null;
  placeGooglePlaceId: string | null;
  placeWebsite: string | null;
  placePhoneNumber: string | null;
  placeOpeningHours: string[] | null;
  placeOpeningHoursPeriods: any[] | null;
  createdAt: string;
  expiresAt: string;
}
```

### 3.7 Files to Create/Modify

| Action | File | Details |
|---|---|---|
| **Create** | `src/screens/pending/PendingScreen.tsx` | Main pending review screen |
| **Create** | `src/components/PendingPlaceCard.tsx` | Card component with save/discard |
| **Create** | `src/services/pendingService.ts` | Supabase queries for pending extractions |
| **Create** | `src/context/PendingContext.tsx` | Lightweight context for pending state + badge count |
| **Modify** | `src/navigation/MainTabNavigator.tsx` | Add Pending tab with badge |
| **Modify** | `src/navigation/types.ts` | Add `Pending` to `MainTabParamList` |
| **Modify** | `src/types/index.ts` (or new file) | Add `PendingExtraction` type |

---

## Phase 4: Polish & Cleanup

### 4.1 Remove expo-share-intent

Once the native Share Extension is verified working:

1. `npm uninstall expo-share-intent`
2. Remove from `app.config.ts` plugins array
3. Remove `ShareIntentProvider` from `App.tsx`
4. Remove/simplify `getInitialURL`/`subscribe` URL filter in `App.tsx`
5. Simplify or remove `src/context/ShareContext.tsx`

### 4.2 Keep Fallback for Existing Flow?

**Recommendation: No.** Since this is iOS-only and you control the build, the native extension will always be present. No need for a synchronous fallback. The Search tab's manual search remains the alternative if sharing fails.

### 4.3 Analytics Events

Add to `analyticsService.ts`:

```typescript
ShareExtensionUsed      // URL sent from share extension
PendingPlaceSaved       // User saved from pending tab
PendingPlaceDiscarded   // User discarded from pending tab
PendingTabViewed        // User opened pending tab
ExtractionCompleted     // Server-side extraction succeeded
ExtractionFailed        // Server-side extraction failed
```

### 4.4 Console.log Cleanup

Remove debug `console.log` statements from `App.tsx` linking config (leftover from previous PR).

---

## Implementation Order (Suggested PRs)

| PR | Phase | Description | Complexity |
|---|---|---|---|
| **PR #1** | 1 | Supabase table + `async-extract-place` edge function | Medium |
| **PR #2** | 3 | Pending tab UI + PendingContext + pendingService | Medium |
| **PR #3** | 2 | Native iOS Share Extension + config plugin + shared Keychain | **High** |
| **PR #4** | 4 | Remove expo-share-intent, cleanup, analytics | Low |

**Why this order:**
- PR #1 and #2 can be developed and tested without the native extension (use Supabase dashboard or a test script to insert mock pending rows)
- PR #3 is the most complex and can be developed in parallel
- PR #4 is cleanup after everything works

---

## Risks & Open Questions

| Risk | Mitigation |
|---|---|
| Expo config plugin complexity for Share Extension | Consider [`expo-share-extension`](https://github.com/nicfontaine/expo-share-extension) community package before writing custom |
| `expo-secure-store` may not support `keychainAccessGroup` | Check docs; fallback to native Keychain module via config plugin |
| Share Extension token expiry | Extension shows "open spot. to refresh" message; main app auto-refreshes tokens |
| Edge function timeout (free plan = 60s) | Pipeline should complete in 5-15s; add timeout handling just in case |
| Duplicate shares (user shares same URL twice) | Deduplicate by `(user_id, source_url)` in edge function before processing |
| Offline sharing from extension | Extension shows "offline" message; cannot queue without main app (acceptable trade-off) |
| Android support | This plan is iOS-only. Android share intent still uses existing expo-share-intent flow (or a future Android equivalent). Add Android consideration if needed. |
