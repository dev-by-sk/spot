# Spot App — Issues & Roadmap

> Last updated: 2026-03-04
> Remaining issues from full codebase audit. Ordered by priority within each tier.

---

## Blockers (Security & Data Integrity)

These must be fixed before any public release. Each one is either a security vulnerability or a data-loss risk.

---

### 1. Silent Sync Failures — Data Loss Risk

**Fix** · **Effort: Large (4–6 hr)**

**What:** When Supabase push fails after a local save, the error is swallowed with `console.warn()`. No retry queue, no offline buffer, no user-visible indicator.

**Why it matters:** Users believe their data is backed up, but it may only exist in local SQLite. If they switch devices, reinstall, or clear app data, those places are gone forever.

**What happens if we skip it:** Silent data loss. Users will discover it at the worst time (new phone, app crash) and lose trust immediately.

**Files:**

- `src/context/PlacesContext.tsx` (try-catch blocks that only `console.warn`)

**Fix:** Implement a persistent retry queue (write failed operations to SQLite, retry on next app foreground / connectivity change), and show a "sync pending" indicator in the UI.

---

## Important (Reliability & Core Features)

These significantly affect user experience and app reliability. Fix before scaling to more users.

---

### 2. Sentry and PostHog Not Wired Up

**Fix** · **Effort: Medium (2–3 hr)**

**What:** Error tracking (Sentry) and analytics (PostHog) are referenced in config and have env var slots, but the actual integrations are TODOs / commented out.

**Why it matters:** In production, you have zero crash reporting and zero usage analytics. You won't know what's breaking or how people use the app.

**What happens if we skip it:** Flying blind in production. Bugs go undetected until users complain (and most won't — they'll just leave).

**Files:**

- `src/services/analyticsService.ts`
- `app.config.ts` lines 57–58

**Fix:** Install `@sentry/react-native` and `posthog-react-native`, initialize in `App.tsx`, and instrument key flows (save, search, share extraction).

---

### 3. No LLM Fallback When Edge Function Fails

**Fix** · **Effort: Medium (2–3 hr)**

**What:** When the edge function (LLM extraction) fails, the entire share-to-save pipeline returns `null`. No local fallback, no retry.

**Why it matters:** The share extraction feature is the app's core differentiator. If the edge function has downtime, the feature is completely dead.

**What happens if we skip it:** Any edge function outage (Supabase incident, OpenAI rate limit, expired API key) kills the flagship feature.

**Files:**

- `src/services/shareExtractionService.ts` lines 83–86

**Fix:** Add a local fallback that uses regex to extract place names from oEmbed/metadata (e.g., common patterns like "Restaurant Name" in TikTok captions), then search Google Places directly.

---

## Polish & Infrastructure

These improve long-term maintainability, performance at scale, and overall polish.

---

### 4. Sort Options for Saved Places

**Feature** · **Effort: Medium (2–3 hr)**

**What:** Saved places are hardcoded to sort by date saved (newest first). No option to sort by name, rating, distance, or date visited.

**Why it matters:** Users need different views depending on context — nearest places when traveling, alphabetical when browsing, etc.

**Files:**

- `src/screens/list/SavedPlacesListScreen.tsx`

---

### 5. Missing Safe Area Handling on Some Screens

**Fix** · **Effort: Small (<1 hr)**

**What:** LoginScreen and OnboardingScreen lack safe area handling, so content can be hidden behind the iPhone notch / Dynamic Island.

**Why it matters:** Content is physically obscured on modern iPhones.

**What happens if we skip it:** Login/onboarding experience is broken on newer iPhones. Bad first impression.

**Files:**

- `src/screens/auth/LoginScreen.tsx`
- `src/screens/onboarding/`

**Fix:** Wrap in `SafeAreaView` or use `useSafeAreaInsets()`.

---

### 6. No CI/CD Pipeline

**Feature** · **Effort: Large (4–6 hr)**

**What:** No `.github/workflows`, no automated builds, no automated test runs on PR.

**Why it matters:** Manual-only builds. No code quality gates, no automated deployments, no protection against shipping broken code.

**What happens if we skip it:** Every deploy is a manual process. Regressions can merge unchecked.

**Fix:** Set up GitHub Actions with lint, type-check, test, and EAS Build steps.

---

### 7. No Haptic Feedback

**Feature** · **Effort: Small (<1 hr)**

**What:** No haptic feedback on any interaction — saving a place, swiping, deleting, tab switching.

**Why it matters:** Modern iOS apps use haptics extensively. Without them, the app feels flat compared to native apps.

**What happens if we skip it:** Subjective polish issue. Won't prevent usage but reduces perceived quality.

**Fix:** Add `expo-haptics` and trigger light/medium impacts on key actions.

---

### 8. Outdated Dependencies with Known Vulnerabilities

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

| Tier               | Issues | Effort     |
| ------------------ | ------ | ---------- |
| **Blockers**       | 1      | ~5 hr      |
| **Important**      | 2      | ~5 hr      |
| **Polish & Infra** | 5      | ~15 hr     |
| **Total**          | **8**  | **~25 hr** |
