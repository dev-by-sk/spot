# Spot App — Issues & Roadmap

> Last updated: 2026-03-07
> Remaining issues from full codebase audit. Ordered by priority within each tier.

## Important (Reliability & Core Features)

These significantly affect user experience and app reliability. Fix before scaling to more users.

---

### 1. Sentry and PostHog Not Wired Up

**Fix** · **Effort: Medium (2–3 hr)**

**What:** Error tracking (Sentry) and analytics (PostHog) are referenced in config and have env var slots, but the actual integrations are TODOs / commented out.

**Why it matters:** In production, you have zero crash reporting and zero usage analytics. You won't know what's breaking or how people use the app.

**What happens if we skip it:** Flying blind in production. Bugs go undetected until users complain (and most won't — they'll just leave).

**Files:**

- `src/services/analyticsService.ts`
- `app.config.ts` lines 57–58

**Fix:** Install `@sentry/react-native` and `posthog-react-native`, initialize in `App.tsx`, and instrument key flows (save, search, share extraction).

---

### 2. Edge Function Rate Limiter Is Ineffective

**Fix** · **Effort: Small (1–2 hr)**

**What:** The `async-extract-place` edge function uses an in-memory rate limiter, but Deno Deploy isolates don't share memory. Each request may hit a different isolate, so the rate limiter provides no real protection against API cost abuse.

**Why it matters:** OpenAI and Google Places API calls cost money. Without effective rate limiting, a malicious or buggy client could run up significant costs.

**What happens if we skip it:** No protection against API abuse. A single user could trigger hundreds of extractions.

**Possible fixes:**
- Use Supabase Postgres for rate limit state (e.g., count recent requests per user)
- Use Redis/Upstash for distributed rate limiting
- Add per-user daily limits checked in the edge function

---

### 3. Silent Share Failures With No User Indication

**Fix** · **Effort: Medium (2–3 hr)**

**What:** When the Share Extension's fire-and-forget request fails after the banner dismisses (e.g., extraction finds no place, Google Places returns no match), the failure is completely silent. The user has no way to know their share didn't save.

**Why it matters:** Users will share links expecting them to appear in the app, and some will silently disappear. This erodes trust in the core feature.

**What happens if we skip it:** Users lose spots with no indication. They may re-share the same link multiple times or stop trusting the share flow.

**Possible fixes:**
- Track share attempts in a `share_log` table with status (pending/success/failed)
- Show a "pending/failed shares" indicator in the app
- Send a push notification on extraction failure

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
| **Important**      | 3      | ~7 hr      |
| **Polish & Infra** | 5      | ~15 hr     |
| **Total**          | **8**  | **~22 hr** |
