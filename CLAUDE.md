# CLAUDE.md — spot.

## Project Overview

**spot.** is a React Native mobile app for saving restaurants, cafes, bars, and activities. Users can search Google Places directly or share URLs from TikTok/Instagram/web — the app extracts the place via LLM and saves it locally with cloud sync.

## Tech Stack

- **Framework:** React Native 0.81 + Expo 54 + TypeScript 5.9 (strict mode)
- **Navigation:** React Navigation 7 (native-stack + bottom-tabs)
- **Backend:** Supabase (Postgres, Auth, Edge Functions)
- **Local DB:** expo-sqlite (offline-first)
- **Auth:** Google Sign-In via Expo Auth Session
- **APIs:** Google Places API (proxied through Supabase edge functions), OpenAI GPT-4o-mini (place extraction)
- **Analytics:** PostHog (installed, not fully wired)
- **Error Tracking:** Sentry (installed, not fully wired)

## Commands

```bash
npm install          # Install dependencies
npx expo start       # Start dev server (scan QR with Expo Go)
npx expo start --ios # Start with iOS simulator
npx expo start --android # Start with Android emulator
```

No test framework is set up. No CI/CD pipeline exists.

## Project Structure

```
src/
├── components/      # Reusable UI (PlaceCard, FilterBar, FilterSheet, SpotButton, ErrorBoundary)
├── screens/         # Full screens organized by domain
│   ├── auth/        #   LoginScreen
│   ├── list/        #   SavedPlacesListScreen
│   ├── search/      #   SearchScreen
│   ├── profile/     #   ProfileScreen
│   ├── splash/      #   SplashScreen
│   └── onboarding/  #   OnboardingScreen
├── context/         # React Context providers (Auth, Places, Share, Database)
├── navigation/      # React Navigation config (RootNavigator, MainTabNavigator, ListStackNavigator)
├── services/        # Business logic — API calls, sync, analytics
├── hooks/           # Custom hooks (useDebounce, useNetworkStatus, useDatabaseReady)
├── db/              # SQLite schema, migrations, and query hooks (useSavedPlaces)
├── theme/           # Colors, typography, spacing, shared styles
├── types/           # TypeScript interfaces, enums, error classes
├── utils/           # Utility functions (relativeDate)
└── config/          # Supabase client init, app constants
```

```
supabase/
└── functions/
    └── extract-place/  # Edge function: LLM-based place extraction from URLs
```

Key root files: `App.tsx` (root component with provider tree), `app.config.ts` (Expo config), `index.ts` (entry point).

## Architecture

### Provider Tree (App.tsx)

```
ErrorBoundary → GestureHandlerRootView → SafeAreaProvider → ShareIntentProvider
  → DatabaseProvider → AuthProvider → PlacesProvider → ShareProvider → RootNavigator
```

### Navigation Flow

```
Splash → Onboarding → Login → MainTabs
                                ├── List tab (SavedPlacesListScreen → SpotDetailScreen)
                                ├── Search tab (SearchScreen)
                                └── Profile tab (ProfileScreen)
```

### Data Flow

- **Offline-first:** SQLite is source of truth locally; Supabase syncs in background
- **Sync strategy:** Server-wins on pull, push locally-created places that aren't on server
- **Share extraction pipeline:** URL → oEmbed/HTML scrape → LLM extraction (edge function) → Google Places search → save

### Key Services

| Service                     | Purpose                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `supabaseService.ts`        | Remote DB CRUD, auth, profile management                            |
| `googlePlacesService.ts`    | Google Places autocomplete/details/search (via edge function proxy) |
| `shareExtractionService.ts` | Extract place info from shared URLs using LLM                       |
| `syncService.ts`            | Bidirectional SQLite ↔ Supabase sync                                |
| `locationService.ts`        | Location permissions and geocoding                                  |
| `analyticsService.ts`       | PostHog event tracking                                              |

## Data Model

### SQLite Tables (local)

- **`place_cache`** — Cached Google Places data (google_place_id PK, name, address, lat/lng, rating, price_level, category, cuisine)
- **`saved_places`** — User's saved places (id PK, user_id, google_place_id FK, note_text, date_visited, saved_at)

### Supabase Tables (remote)

Same as above plus:

- **`users`** — User profiles (id, email, auth_provider, profile_private, created_at, deleted_at for soft delete)

## Naming Conventions

- **Database columns:** snake_case (`google_place_id`, `saved_at`, `price_level`)
- **TypeScript interfaces/variables:** camelCase
- **React components:** PascalCase files and exports
- **Services/hooks:** camelCase files (`supabaseService.ts`, `useDebounce.ts`)
- **Context pattern:** `{Domain}Context` + `{Domain}Provider` + `use{Domain}()` hook
- **Path alias:** `@/*` maps to `./src/*`

## Types

Key types in `src/types/`:

- `SavedPlaceDTO` / `SavedPlaceLocal` — snake_case for DB, camelCase for services
- `PlaceCacheDTO` — Cached place data
- `PlaceSearchResult` — Google Places search result
- `PlaceCategory` enum — Restaurant, Cafe, Bar, Dessert, Activity, Entertainment, Other
- `SpotError` — Custom error class with codes (DUPLICATE_PLACE, PLACE_NOT_FOUND, NETWORK_ERROR)

## Environment Variables

Required in `.env` (see `.env.example`):

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
GOOGLE_IOS_CLIENT_ID=
POSTHOG_API_KEY=       # optional
SENTRY_DSN=            # optional
```

Edge function env (set in Supabase dashboard):

- `OPENAI_API_KEY` — For GPT-4o-mini place extraction

## App Config

- **Bundle ID:** `com.spot.app` (iOS + Android)
- **Deep link scheme:** `spot://`
- **Expo plugins:** expo-location, expo-sqlite, expo-screen-orientation, expo-web-browser, expo-share-intent

## Theme

- **Brand color:** spotEmerald `#047857` (with light `#059669` and dark `#065F46` variants)
- **Danger color:** `#DC2626`
- **Dark mode:** Supported via `useSpotColors()` hook which returns adaptive colors
- Colors, typography, and spacing defined in `src/theme/`

## Known Issues

See `ISSUES.md` for 28 tracked issues. Critical blockers include:

- Edge functions have wide-open CORS and no auth
- No rate limiting on APIs
- Auth tokens stored in unencrypted AsyncStorage
- Silent sync failures (potential data loss)
- No input validation / prompt injection risk
- Zero test coverage, no CI/CD pipeline
