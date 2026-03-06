# Async Share-to-Spot — Implementation Plan

## Overview

Currently, sharing a TikTok/Instagram/web URL to spot. opens the app, runs LLM extraction synchronously, and prompts the user to confirm/save. This plan makes the entire flow **asynchronous**: the user shares a URL without leaving TikTok, extraction happens server-side in the background, and the place is **auto-saved directly** to the user's saved spots. No manual review step — the spot appears automatically on next sync/refresh.

## Design Decisions

| Decision | Choice |
|---|---|
| App behavior on share | **Don't open the app** — native iOS Share Extension captures URL and dismisses |
| Extraction timing | **Server-side immediately** — edge function processes while user keeps scrolling |
| Save behavior | **Auto-save directly** — write to `place_cache` + `saved_places` on server, app picks up on next sync |
| Failed extractions | **Silently discarded** — `console.error` only, no DB writes on failure |
| Duplicate handling | **Silent skip** — if `google_place_id` already exists in user's `saved_places`, skip without error |
| Auto-note | **From URL domain** — "From TikTok" / "From Instagram" / "From web" based on hostname |

---

## Phase 1: Server-Side Async Extraction Pipeline

> **Goal:** Move the entire extraction pipeline (oEmbed/scrape → LLM → Google Places lookup) to a single Supabase edge function that writes directly to `place_cache` and `saved_places`.

### 1.1 Edge Function: `async-extract-place`

**Path:** `supabase/functions/async-extract-place/index.ts`

This function does the **full pipeline** that currently happens client-side across `shareExtractionService.ts` + `extract-place` + `google-places-proxy`, then auto-saves the result:

```
Receive URL → Return { queued: true } immediately
  → (background) oEmbed fetch (TikTok/Instagram)
  → Fallback: HTML scrape for og:title/og:description
  → Sanitize metadata
  → Call OpenAI GPT-4o-mini for place name extraction
  → Google Places text search
  → Google Places details fetch
  → Check duplicate in saved_places by google_place_id
  → Upsert place_cache
  → Insert saved_places with auto-note ("From TikTok" etc.)
  → On any failure: console.error only, no DB writes
```

**Key design points:**
- Accepts a `url` (not pre-extracted `title`/`description`) — does the full pipeline
- Writes results directly to `place_cache` and `saved_places` (uses `SUPABASE_SERVICE_ROLE_KEY`)
- Calls Google Places API directly (same logic as `google-places-proxy` search + details)
- Handles failures gracefully — logs error, no DB writes
- Deduplication: check if `google_place_id` already in user's `saved_places`, skip if so
- Auto-note: detects source from URL hostname ("From TikTok" / "From Instagram" / "From web")

**Auth:** Still validates user JWT to get `user_id`, but uses service role key for DB writes.

**Response:** Returns immediately with `{ queued: true }`. The pipeline runs via `EdgeRuntime.waitUntil()`.

> **Note:** Supabase edge functions have a 150s execution limit on the Pro plan (60s on Free). The full pipeline (oEmbed + LLM + 2 Google API calls) should complete in 5-15s, well within limits.

**Environment variables needed (already set for existing functions):**
- `OPENAI_API_KEY`
- `GOOGLE_PLACES_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (needed for DB writes bypassing RLS)

### 1.2 Files to Create/Modify

| Action | File | Details |
|---|---|---|
| **Modified** | `supabase/functions/async-extract-place/index.ts` | Rewrote pipeline to auto-save to `place_cache` + `saved_places` |
| **Removed** | `supabase/functions/async-extract-place/backup.ts` | No longer needed |
| **No change** | `supabase/functions/extract-place/index.ts` | Keep existing function for backward compat |
| **No change** | `supabase/functions/google-places-proxy/index.ts` | Keep for client-side search functionality |

### 1.3 No Client-Side Changes Needed

The existing sync flow already handles everything:
- `syncService.pullFromRemote` fetches `saved_places` with nested `place_cache(*)` join from Supabase and upserts into local SQLite
- `supabaseService.fetchSavedPlaces()` already returns the right shape
- `PlacesContext.refreshPlaces` already re-queries local SQLite
- Share Extension still POSTs URL to edge function (unchanged)

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
6. Simplify `ShareContext.tsx` — remove share-intent listening, keep as the provider for pending state if needed (or remove entirely)

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

## Phase 3: Polish & Cleanup

### 3.1 Remove expo-share-intent

Once the native Share Extension is verified working:

1. `npm uninstall expo-share-intent`
2. Remove from `app.config.ts` plugins array
3. Remove `ShareIntentProvider` from `App.tsx`
4. Remove/simplify `getInitialURL`/`subscribe` URL filter in `App.tsx`
5. Simplify or remove `src/context/ShareContext.tsx`

### 3.2 Keep Fallback for Existing Flow?

**Recommendation: No.** Since this is iOS-only and you control the build, the native extension will always be present. No need for a synchronous fallback. The Search tab's manual search remains the alternative if sharing fails.

### 3.3 Analytics Events

Add to `analyticsService.ts`:

```typescript
ShareExtensionUsed      // URL sent from share extension
ExtractionCompleted     // Server-side extraction succeeded (auto-saved)
ExtractionFailed        // Server-side extraction failed
ExtractionDuplicate     // Server-side extraction skipped (duplicate)
```

### 3.4 Console.log Cleanup

Remove debug `console.log` statements from `App.tsx` linking config (leftover from previous PR).

---

## Phase 4: Android Parity

> **Goal:** Make the Android share experience identical to iOS — user shares a URL, sees "Sent to spot!", stays in the source app. Extraction happens server-side.

### 4.1 Architecture

On iOS, the Share Extension runs in a **separate process** and needs App Groups to share the auth token. On Android, the situation is simpler: a second Activity declared in the same app package shares the **same process** and the same `SharedPreferences` — no special IPC needed.

```
User taps "spot." in Android share sheet
  → ShareReceiverActivity launches (transparent theme, no UI chrome)
  → Reads auth token from SharedPreferences
  → Extracts URL from Intent.EXTRA_TEXT
  → POSTs to async-extract-place edge function (background thread)
  → Shows Toast ("Sent to spot!")
  → Calls finish() — user returns to TikTok/Instagram/browser
```

The edge function (`supabase/functions/async-extract-place/index.ts`) is already platform-agnostic and requires **no changes**.

### 4.2 Extend `shared-storage` Module for Android

The existing `modules/shared-storage/` only has an iOS implementation wrapping `UserDefaults`. Add an Android implementation wrapping `SharedPreferences` with the same JS API (`setItem`, `getItem`, `removeItem`).

On iOS, the `suiteName` parameter selects a `UserDefaults` suite (the App Group). On Android, the same parameter maps to a named `SharedPreferences` file via `context.getSharedPreferences(suiteName, Context.MODE_PRIVATE)`. We use the same string (`"group.com.spot.app"`) as the preferences file name for consistency.

**Create:**

| File | Details |
|---|---|
| `modules/shared-storage/android/build.gradle` | Standard Expo module Gradle config, depends on `expo-modules-core` |
| `modules/shared-storage/android/src/main/java/expo/modules/sharedstorage/SharedStorageModule.kt` | Kotlin module with `setItem`, `getItem`, `removeItem` wrapping `SharedPreferences` |

**Modify:**

| File | Details |
|---|---|
| `modules/shared-storage/expo-module.config.json` | Add `"android"` to `platforms` array, add `"android": { "modules": ["expo.modules.sharedstorage.SharedStorageModule"] }` |

### 4.3 Create `ShareReceiverActivity` (Kotlin)

A lightweight Android `Activity` (NOT `ReactActivity`) with a transparent theme. It has zero React Native overhead so it launches fast.

**Key design choices:**
- Uses `java.net.HttpURLConnection` (no third-party dependencies)
- Uses a plain `Thread` for the network call (avoids needing Kotlin coroutines library)
- Theme is `@android:style/Theme.Translucent.NoTitleBar` so the user sees the source app behind the Toast
- Supabase URL and anon key are baked into the source at prebuild time (same pattern as the iOS Swift generation)

**Generated path:** `android/app/src/main/java/com/spot/app/ShareReceiverActivity.kt`

**Flow:**

```
onCreate()
  → Read EXTRA_TEXT from intent
  → Extract URL via regex (https?://\S+)
  → If no URL → Toast "No link found" → finish()
  → Read token from SharedPreferences("group.com.spot.app", "spot_shared_access_token")
  → If no token → Toast "Open spot. and sign in first" → finish()
  → Background thread: POST to edge function
  → On result → Toast "Sent to spot!" or "Failed to send" → finish()
```

### 4.4 Extend Config Plugin for Android

The existing `plugins/withAsyncShareExtension.js` currently only has iOS mods. Add two Android mods after the existing iOS mods:

**a) Write the Activity source file** using `withDangerousMod("android", ...)`

Write `ShareReceiverActivity.kt` to `android/app/src/main/java/com/spot/app/` with Supabase credentials substituted (same approach as `generateShareViewController()` for iOS). Use `fs.mkdirSync(activityDir, { recursive: true })` to ensure the directory exists.

**b) Register the Activity in AndroidManifest.xml** using `withAndroidManifest`

```xml
<activity
    android:name=".ShareReceiverActivity"
    android:theme="@android:style/Theme.Translucent.NoTitleBar"
    android:noHistory="true"
    android:excludeFromRecents="true"
    android:exported="true"
    android:label="spot.">
    <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="text/plain" />
    </intent-filter>
</activity>
```

Key manifest attributes:
- `noHistory="true"` — Activity doesn't appear in recents
- `excludeFromRecents="true"` — doesn't show in recent apps
- `exported="true"` — required for other apps to invoke it via share sheet

### 4.5 Disable expo-share-intent on Android

Currently, expo-share-intent adds an `ACTION_SEND` intent filter to `MainActivity`, which causes the main app to open on share. To prevent both Activities from appearing in the share sheet, add `disableAndroid: true` to the expo-share-intent plugin config in `app.config.ts`:

```typescript
[
  'expo-share-intent',
  {
    disableAndroid: true,  // ← ADD THIS
    iosActivationRules: {
      NSExtensionActivationSupportsWebURLWithMaxCount: 1,
      NSExtensionActivationSupportsText: true,
    },
  },
],
```

### 4.6 Update AuthContext.tsx

Remove the `Platform.OS !== "ios"` early-return guards from `storeSharedToken()` and `clearSharedToken()` so the auth token is written to `SharedPreferences` on Android too.

### 4.7 Files to Create/Modify

| Action | File | Details |
|---|---|---|
| **Create** | `modules/shared-storage/android/build.gradle` | Gradle config for Android SharedPreferences module |
| **Create** | `modules/shared-storage/android/src/main/java/expo/modules/sharedstorage/SharedStorageModule.kt` | `SharedPreferences` wrapper matching iOS API |
| **Modify** | `modules/shared-storage/expo-module.config.json` | Add Android platform + module class |
| **Modify** | `plugins/withAsyncShareExtension.js` | Add `withDangerousMod` (write Activity.kt) + `withAndroidManifest` (register Activity) |
| **Modify** | `app.config.ts` | Add `disableAndroid: true` to expo-share-intent config |
| **Modify** | `src/context/AuthContext.tsx` | Remove `Platform.OS !== "ios"` guards |

### 4.8 Testing

1. **SharedStorage module:** Verify `setItem`/`getItem`/`removeItem` work on Android emulator from JS side
2. **ShareReceiverActivity directly:** `adb shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "https://vm.tiktok.com/ZMtest123/" -n com.spot.app/.ShareReceiverActivity`
3. **End-to-end:** Share from browser on Android emulator → "spot." appears in share sheet → Toast appears → user stays in browser → check Supabase for new rows in `place_cache` and `saved_places`
4. **Edge cases:** No auth token (should show "Open spot. and sign in first"), no URL in shared text ("No link found"), offline ("Failed to send")
5. **Regression:** Verify iOS share extension still works unchanged, Android app still opens normally via launcher

### 4.9 Risks

| Risk | Mitigation |
|---|---|
| Toast is too subtle compared to iOS banner | Can upgrade to a custom overlay View in the Activity later. Start with Toast for simplicity. |
| SharedPreferences file name with dots (`group.com.spot.app`) | Android allows dots in SharedPreferences file names. This is safe. |
| `HttpURLConnection` on main thread | The call runs on a background `Thread`. Android will not raise `NetworkOnMainThreadException`. |
| expo-share-intent `disableAndroid` breaks `ShareIntentProvider` | Verified: `disableAndroid` only disables the config plugin (manifest mods). The JS provider still mounts; `hasShareIntent` stays `false` on Android. |
| Plugin ordering in `app.config.ts` | `withAsyncShareExtension` is listed before `expo-share-intent`. Since we use `disableAndroid: true`, there is no manifest conflict regardless of ordering. |

---

## Implementation Order (Suggested PRs)

| PR | Phase | Description | Complexity |
|---|---|---|---|
| **PR #1** | 1 | Rewrite `async-extract-place` to auto-save to `place_cache` + `saved_places` | Low |
| **PR #2** | 2 | Native iOS Share Extension + config plugin + shared Keychain | **High** |
| **PR #3** | 4 | Android share parity — SharedStorage Android module, ShareReceiverActivity, config plugin extension | Medium |
| **PR #4** | 3 | Remove expo-share-intent, cleanup, analytics | Low |

**Why this order:**
- PR #1 is the server-side foundation — must be deployed first
- PR #2 is the most complex and can be developed after the edge function is live
- PR #3 adds Android support using the same edge function
- PR #4 is cleanup after everything works

---

## Risks & Open Questions

| Risk | Mitigation |
|---|---|
| Expo config plugin complexity for Share Extension | Consider [`expo-share-extension`](https://github.com/nicfontaine/expo-share-extension) community package before writing custom |
| `expo-secure-store` may not support `keychainAccessGroup` | Check docs; fallback to native Keychain module via config plugin |
| Share Extension token expiry | Extension shows "open spot. to refresh" message; main app auto-refreshes tokens |
| Edge function timeout (free plan = 60s) | Pipeline should complete in 5-15s; add timeout handling just in case |
| Duplicate shares (user shares same URL twice) | Deduplicate by `google_place_id` in `saved_places` — if already saved, silently skip |
| Offline sharing from extension | Extension shows "offline" message; cannot queue without main app (acceptable trade-off) |
| Android support | Addressed in Phase 4. |
