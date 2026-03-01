# Spot App — Issues & Roadmap

> Last updated: 2026-02-23
> Issues identified via full codebase audit. Ordered by priority within each tier.
> Issues 1–4 from the original audit were **already fixed** during the analysis session (TikTok extraction pipeline, edge function deployment, API key mismatch, function name mismatch).

---

## Week 1 — Blockers (Security & Data Integrity)

These must be fixed before any public release. Each one is either a security vulnerability or a data-loss risk.

---

### 1. Edge Function Has No Auth and Wide-Open CORS -- THIS IS FIXED

**Fix** · **Effort: Medium (2–3 hr)**

**What:** `extract-tiktok` edge function sets `Access-Control-Allow-Origin: *` and performs zero authentication. The client sends the Supabase anon key instead of the user's session token.

**Why it matters:** Anyone on the internet can call this endpoint and burn through your OpenAI credits. There is no rate limiting, so a bot could run up significant API costs in minutes.

**What happens if we skip it:** Financial exposure — a single bad actor can drain the OpenAI budget. Supabase will not flag this because the anon key is meant to be public.

**Files:**

- `supabase/functions/extract-place/index.ts` lines 19–25 (CORS headers)
- `src/services/shareExtractionService.ts` lines 109–112 (anon key usage)

**Fix:** Add JWT verification in the edge function (validate `Authorization: Bearer <access_token>` via Supabase's `createClient`), restrict CORS to your app's bundle identifier / deep-link domain, and pass the user's access token from the client.

---

### 2. No Rate Limiting Anywhere

**Fix** · **Effort: Medium (2–4 hr)**

**What:** Zero per-user or per-IP rate limiting on edge functions, the Google Places proxy, or autocomplete. Client-side search has debounce but no server-side throttle.

**Why it matters:** Google Places autocomplete costs ~$7/1,000 requests. A single user spamming search or a bot hitting the edge function can blow through quotas and budgets fast.

**What happens if we skip it:** Direct financial risk. Google will also hard-block the API key once quota is exceeded, breaking search for everyone.

**Files:**

- `src/services/googlePlacesService.ts` — no client-side request cap
- `supabase/functions/extract-place/index.ts` — no server-side limiting

**Fix:** Add per-user rate limiting on edge functions (e.g., Supabase's built-in headers or a Redis counter), set Google API budget alerts, and add a client-side request cap.

---

### 3. Auth Tokens Stored in Unencrypted AsyncStorage

**Fix** · **Effort: Small (<1 hr)**

**What:** Supabase auth tokens are persisted via `AsyncStorage`, which is **unencrypted** on Android.

**Why it matters:** On rooted Android devices, tokens can be read directly from the filesystem, leading to full account takeover.

**What happens if we skip it:** Any Android user with a rooted device (or malware with storage access) can have their account compromised.

**Files:**

- `src/config/supabase.ts` lines 16–22

**Fix:** Replace `AsyncStorage` with `expo-secure-store` for token storage. Supabase JS supports a custom `storage` adapter — just swap the implementation.

---

### 4. Silent Sync Failures — Data Loss Risk -- THIS IS PARTIALLY DONE MIGHT BE DROPPED BECAUSE ISSUE 9 FIX IS GOOD NEOUGH FOR NOW

**Fix** · **Effort: Large (4–6 hr)**

**What:** When Supabase push fails after a local save, the error is swallowed with `console.warn()`. No retry queue, no offline buffer, no user-visible indicator.

**Why it matters:** Users believe their data is backed up, but it may only exist in local SQLite. If they switch devices, reinstall, or clear app data, those places are gone forever.

**What happens if we skip it:** Silent data loss. Users will discover it at the worst time (new phone, app crash) and lose trust immediately.

**Files:**

- `src/context/PlacesContext.tsx` lines 193–195, 212–216, 233–237 (try-catch blocks that only `console.warn`)

**Fix:** Implement a persistent retry queue (write failed operations to SQLite, retry on next app foreground / connectivity change), and show a "sync pending" indicator in the UI.

---

### 5. No Input Validation / Prompt Injection Risk -- THIS IS FIXED

**Fix** · **Effort: Small (<1 hr)**

**What:** User-controlled `title` and `description` scraped from shared URLs are passed directly to the LLM prompt without sanitization, length limits, or encoding checks. `lat`/`lng` values in Google Places calls are not type-validated.

**Why it matters:** A malicious URL can return metadata designed to manipulate the LLM's response (prompt injection), potentially returning false place data. Invalid lat/lng (NaN, Infinity) will cause silent Google API failures.

**What happens if we skip it:** Mostly a defense-in-depth concern today, but becomes a real attack surface as the app grows. Invalid coordinates will cause confusing search failures.

**Files:**

- `src/services/shareExtractionService.ts` lines 102–115
- `src/services/googlePlacesService.ts` lines 39–44

**Fix:** Truncate metadata to 500 chars, strip HTML/control characters, validate lat/lng are finite numbers within valid ranges.

---

### 6. No Timeout or Size Limit on URL Fetching -- THIS IS FIXED

**Fix** · **Effort: Small (<1 hr)**

**What:** `fetchPageMetadata()` issues a `fetch()` with no timeout and no response body size limit.

**Why it matters:** A malicious or misconfigured URL could hang the fetch indefinitely or return a multi-GB response, consuming memory and blocking the extraction flow.

**What happens if we skip it:** Potential app freeze or crash from oversized responses. Unlikely but trivially preventable.

**Files:**

- `src/services/shareExtractionService.ts` lines 68–95

**Fix:** Add `AbortController` with a 5-second timeout, and limit response body reads to 1 MB.

---

### 7. OAuth Token Handling Vulnerability -- THIS IS FIXED

**Fix** · **Effort: Medium (2–3 hr)**

**What:** Auth tokens are manually extracted from the OAuth redirect URL by parsing URL hash parameters. No validation of token format, expiration, or signature.

**Why it matters:** If the redirect URL is intercepted or manipulated, forged tokens could be accepted. Tokens in URL fragments can also leak into browser/webview history.

**What happens if we skip it:** Low probability but high impact — account takeover via forged redirect.

**Files:**

- `src/context/AuthContext.tsx` lines 109–125

**Fix:** Validate token format and expiration before accepting, use PKCE flow for OAuth, and clear tokens from URL history after extraction.

---

### 8. No Privacy Policy or Terms of Service -- THIS IS FIXED

**Feature** · **Effort: Medium (2–3 hr)**

**What:** No privacy policy or terms of service documents exist anywhere in the project.

**Why it matters:** Apple's App Store **will reject** any app that collects user data without a privacy policy. This is a hard blocker for App Store submission.

**What happens if we skip it:** Cannot ship to the App Store. Period.

**Fix:** Draft a privacy policy covering data collection (location, saved places, auth), host it on a public URL, and link it from the app's settings/profile screen and App Store metadata.

---

## Week 2 — Important (Reliability & Core Features)

These significantly affect user experience and app reliability. Fix before scaling to more users.

---

### 9. No Offline Awareness in UI -- THIS IS FIXED

**Fix** · **Effort: Medium (2–3 hr)**

**What:** `isOnline` is tracked via `useNetworkStatus()` but never used to disable features, show banners, or queue operations. When offline, search, share extraction, and sync all fail with cryptic errors.

**Why it matters:** Users get confusing error states instead of a clear "You're offline" message. They may think the app is broken.

**What happens if we skip it:** Poor UX on spotty connections (subway, travel, rural areas). Users blame the app instead of their connection.

**Files:**

- `src/context/PlacesContext.tsx` line 16 (imports `useNetworkStatus` but doesn't use `isOnline`)

**Fix:** Add an offline banner component, disable search/share when offline, and queue sync operations for when connectivity returns.

---

### 10. Database Init Failure Is Swallowed

**Fix** · **Effort: Small (<1 hr)**

**What:** If SQLite fails to initialize, `isReady` is still set to `true` and the app renders in a broken state where all local data operations silently fail.

**Why it matters:** Users see a blank or broken app with no explanation. Every tap produces nothing.

**What happens if we skip it:** Rare edge case, but when it hits, the app is completely unusable with no way to diagnose.

**Files:**

- `src/db/database.ts`

**Fix:** Catch init errors properly, keep `isReady` false, and render an error screen with a "Retry" button.

---

### 11. Missing Loading States Throughout the App

**Fix** · **Effort: Medium (2–3 hr)**

**What:** Multiple screens lack loading indicators:

- `SavedPlacesListScreen`: blank `<View />` on first load
- `SearchScreen`: no feedback during `getPlaceDetails` call
- `LoginScreen`: button disables but no spinner
- `ProfileScreen`: no indicator when toggling privacy
- `SaveConfirmationModal` / `EditNoteModal`: no loading on save buttons

**Why it matters:** Users think the app is frozen when operations take more than ~300ms.

**What happens if we skip it:** Users will double-tap buttons (causing duplicate saves/requests) and perceive the app as slow/broken.

**Files:**

- `src/screens/list/SavedPlacesListScreen.tsx`
- `src/screens/search/SearchScreen.tsx`
- `src/screens/auth/LoginScreen.tsx`

**Fix:** Add `ActivityIndicator` or skeleton screens to all async operations.

---

### 12. Missing Error States / Silent Error Handling

**Fix** · **Effort: Medium (2–3 hr)**

**What:** Multiple error paths are silent or poorly communicated:

- Pull-to-refresh failure: no error alert
- Search error: stored in state but never displayed
- Sync failures: completely silent
- Login error: auto-dismisses after 5 seconds with no action

**Why it matters:** Users have no idea when something goes wrong. They assume the app just doesn't work.

**What happens if we skip it:** User trust erodes. Support burden increases because users can't self-diagnose.

**Files:**

- `src/context/PlacesContext.tsx` lines 124–127 (error set but not shown), lines 246–256 (sync errors swallowed)

**Fix:** Add toast notifications or inline error banners for all failure states. Make errors actionable ("Retry" buttons).

---

### 13. Search Within Saved Places

**Feature** · **Effort: Medium (2–3 hr)**

**What:** No way to search or filter through saved places. Users must scroll the entire list.

**Why it matters:** This is the #1 missing feature. With even 50 saved places, finding a specific restaurant is painful.

**What happens if we skip it:** Users stop saving places because retrieving them is too hard. Defeats the core purpose of the app.

**Files:**

- `src/screens/list/SavedPlacesListScreen.tsx`

**Fix:** Add a search bar at the top of the saved places list that filters by name, notes, and tags.

---

### 14. No "Open in Maps" Button

**Feature** · **Effort: Small (<1 hr)**

**What:** The app stores lat/lng for every saved place but provides no way to navigate to it in Apple Maps or Google Maps.

**Why it matters:** The entire point of saving a place is to go there later. Without this, users must manually search the place name in a maps app.

**What happens if we skip it:** Broken user journey. Users will stop using the app because the last-mile experience is missing.

**Files:**

- `src/screens/list/` (SpotDetailScreen or equivalent)

**Fix:** Add an "Open in Maps" button using `Linking.openURL()` with the `maps://` (Apple) or `geo:` (Android) scheme, with Google Maps as a web fallback.

---

### 15. No Retry Logic for External API Calls

**Fix** · **Effort: Medium (2–3 hr)**

**What:** All external API calls (Google Places, edge functions) fail immediately on first error. No retry logic or exponential backoff.

**Why it matters:** Transient network failures (common on mobile) cause hard failures instead of graceful retries.

**What happens if we skip it:** Users on flaky connections will experience frequent failures that would have succeeded on a second attempt.

**Files:**

- `src/services/googlePlacesService.ts`
- `src/services/shareExtractionService.ts`

**Fix:** Add a retry wrapper (1–2 retries, exponential backoff starting at 1s) for all external API calls.

---

### 16. Sentry and PostHog Not Wired Up

**Fix** · **Effort: Medium (2–3 hr)**

**What:** Error tracking (Sentry) and analytics (PostHog) are referenced in config and have env var slots, but the actual integrations are TODOs / commented out.

**Why it matters:** In production, you have zero crash reporting and zero usage analytics. You won't know what's breaking or how people use the app.

**What happens if we skip it:** Flying blind in production. Bugs go undetected until users complain (and most won't — they'll just leave).

**Files:**

- `src/services/analyticsService.ts`
- `app.config.ts` lines 57–58

**Fix:** Install `@sentry/react-native` and `posthog-react-native`, initialize in `App.tsx`, and instrument key flows (save, search, share extraction).

---

### 17. No LLM Fallback When Edge Function Fails

**Fix** · **Effort: Medium (2–3 hr)**

**What:** When the edge function (LLM extraction) fails, the entire share-to-save pipeline returns `null`. No local fallback, no retry.

**Why it matters:** The share extraction feature is the app's core differentiator. If the edge function has downtime, the feature is completely dead.

**What happens if we skip it:** Any edge function outage (Supabase incident, OpenAI rate limit, expired API key) kills the flagship feature.

**Files:**

- `src/services/shareExtractionService.ts` lines 83–86

**Fix:** Add a local fallback that uses regex to extract place names from oEmbed/metadata (e.g., common patterns like "Restaurant Name" in TikTok captions), then search Google Places directly.

---

## Week 3 — Polish & Infrastructure

These improve long-term maintainability, performance at scale, and overall polish.

---

### 18. Sort Options for Saved Places

**Feature** · **Effort: Medium (2–3 hr)**

**What:** Saved places are hardcoded to sort by date saved (newest first). No option to sort by name, rating, distance, or date visited.

**Why it matters:** Users need different views depending on context — nearest places when traveling, alphabetical when browsing, etc.

**What happens if we skip it:** Minor annoyance now, but compounds as users save more places.

**Files:**

- `src/screens/list/SavedPlacesListScreen.tsx`

---

### 19. Hardcoded Colors Break Dark Mode

**Fix** · **Effort: Small (<1 hr)**

**What:** Several components use hardcoded hex colors instead of the theme system (ErrorBoundary, star/cash icons, misc).

**Why it matters:** When dark mode is enabled, these elements remain light-colored and look broken.

**What happens if we skip it:** Visual inconsistency in dark mode. Not blocking but looks unpolished.

**Files:**

- `src/components/ErrorBoundary.tsx`
- Various icon components

---

### 20. Missing Safe Area Handling on Some Screens

**Fix** · **Effort: Small (<1 hr)**

**What:** LoginScreen and OnboardingScreen lack safe area handling, so content can be hidden behind the iPhone notch / Dynamic Island.

**Why it matters:** Content is physically obscured on modern iPhones.

**What happens if we skip it:** Login/onboarding experience is broken on newer iPhones. Bad first impression.

**Files:**

- `src/screens/auth/LoginScreen.tsx`
- `src/screens/onboarding/`

**Fix:** Wrap in `SafeAreaView` or use `useSafeAreaInsets()`.

---

### 21. Zero Tests

**Feature** · **Effort: Large (8+ hr)**

**What:** No test files, no test framework, no test dependencies anywhere in the project.

**Why it matters:** Cannot push updates with confidence. The share extraction flow (most complex feature) is completely untested.

**What happens if we skip it:** Every code change is a gamble. Regressions will ship to users.

**Fix:** Start with unit tests for the three service files (`shareExtractionService`, `syncService`, `googlePlacesService`), then add integration tests for PlacesContext.

---

### 22. No CI/CD Pipeline

**Feature** · **Effort: Large (4–6 hr)**

**What:** No `.github/workflows`, no automated builds, no automated test runs on PR.

**Why it matters:** Manual-only builds. No code quality gates, no automated deployments, no protection against shipping broken code.

**What happens if we skip it:** Every deploy is a manual process. Regressions can merge unchecked.

**Fix:** Set up GitHub Actions with lint, type-check, test, and EAS Build steps.

---

### 23. No Haptic Feedback

**Feature** · **Effort: Small (<1 hr)**

**What:** No haptic feedback on any interaction — saving a place, swiping, deleting, tab switching.

**Why it matters:** Modern iOS apps use haptics extensively. Without them, the app feels flat compared to native apps.

**What happens if we skip it:** Subjective polish issue. Won't prevent usage but reduces perceived quality.

**Fix:** Add `expo-haptics` and trigger light/medium impacts on key actions.

---

### 24. No Pagination for Large Place Lists

**Fix** · **Effort: Medium (2–3 hr)**

**What:** The saved places list loads everything into memory. Filter operations run on every render without memoization.

**Why it matters:** Fine for 50 places, but at 500+ the list will lag and consume excessive memory.

**What happens if we skip it:** Performance degrades over time as users save more places. Difficult to fix later without a larger refactor.

**Files:**

- `src/screens/list/SavedPlacesListScreen.tsx`
- `src/context/PlacesContext.tsx` lines 86–109

---

### 25. Duplicate Detection / Sync Conflicts

**Fix** · **Effort: Large (4–6 hr)**

**What:** Duplicate check only uses `google_place_id`. No conflict resolution for multi-device sync scenarios.

**Why it matters:** If a user saves the same place on two devices before sync completes, they'll get duplicates.

**What happens if we skip it:** Annoying duplicates for multi-device users. Not critical for single-device usage.

**Files:**

- `src/context/PlacesContext.tsx` line 150

---

### 26. Date Format Mismatch Between Components

**Fix** · **Effort: Small (<1 hr)**

**What:** `SaveConfirmationModal` stores full ISO strings, while `EditNoteModal` stores date-only strings (`split('T')[0]`). Inconsistent date storage.

**Why it matters:** Date comparisons and display may behave unexpectedly. Could cause sorting bugs.

**What happens if we skip it:** Subtle display bugs. Low severity.

**Files:**

- `src/components/SaveConfirmationModal` line ~40
- `src/components/EditNoteModal` line ~50

---

### 27. Missing Environment Variable Documentation

**Fix** · **Effort: Small (<1 hr)**

**What:** `OPENAI_API_KEY` is required by the edge function but not in `.env.example`. No staging/production env configs.

**Why it matters:** New developers or deployments will fail silently without knowing which secrets are needed.

**What happens if we skip it:** Onboarding friction. Not blocking for solo development.

**Files:**

- `.env.example`

---

### 28. Outdated Dependencies with Known Vulnerabilities

**Fix** · **Effort: Medium (2–4 hr)**

**What:** Multiple dependencies are outdated including major version bumps. `minimatch` has a HIGH severity ReDoS vulnerability.

**Why it matters:** Security vulnerabilities in build tooling, potential breaking changes accumulating.

**Key packages:**

- `@react-native-async-storage/async-storage` 2.2.0 → 3.0.1 (major)
- `@react-native-community/netinfo` 11.4.1 → 12.0.1 (major)
- `react-native-pager-view` 6.9.1 → 8.0.0 (major)
- `react-native` 0.81.5 → 0.84.0

**What happens if we skip it:** Increasing security debt. Major version upgrades get harder the longer you wait.

---

## Summary

| Tier                   | Issues | Effort     |
| ---------------------- | ------ | ---------- |
| **Week 1 — Blockers**  | 8      | ~15 hr     |
| **Week 2 — Important** | 9      | ~20 hr     |
| **Week 3 — Polish**    | 11     | ~25 hr     |
| **Total**              | **28** | **~60 hr** |

### Already Fixed (during analysis session)

- ~~TikTok share extraction returning 404~~ — edge function deployed
- ~~TikTok metadata returning generic titles~~ — oEmbed support added
- ~~Edge function name mismatch (extract-place vs extract-tiktok)~~ — code updated
- ~~Wrong API key type (OpenAI key for Anthropic API)~~ — edge function rewritten for OpenAI
