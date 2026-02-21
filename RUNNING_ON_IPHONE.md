# Running Spot on Your iPhone

This guide covers everything you need — from setting up the backend and API keys to getting the app running on a physical iPhone. Two paths are covered:

- **Path A**: MacBook + iPhone (native iOS via Xcode, or React Native via Expo)
- **Path B**: Windows + iPhone (React Native via Expo only)

---

## Part 1: Backend & Credentials Setup (Required for Both Paths)

Before touching any app code, you need a working backend and API keys. Do these steps on any computer with a browser.

### 1.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up (free tier works)
2. Click **New Project**
3. Fill in:
   - **Name:** `spot`
   - **Database Password:** pick something strong and save it
   - **Region:** closest to you
4. Wait ~2 minutes for it to provision
5. Go to **Settings → API** and copy:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon/public key** — starts with `eyJ...`

Save both of these. You'll need them multiple times.

### 1.2 Run the Database Migration

1. In the Supabase Dashboard, go to **SQL Editor**
2. Click **New query**
3. Open `supabase/migrations/001_initial_schema.sql` from this repo
4. Copy the entire file contents, paste into the SQL Editor
5. Click **Run**

Verify: go to **Table Editor** — you should see `users`, `saved_places`, and `place_cache` tables.

### 1.3 Set Up Google Sign-In

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Go to **APIs & Services → Credentials**
4. Create an **OAuth 2.0 Client ID**:
   - Type: **iOS**
   - Bundle ID: `com.spot.app`
   - Save the **iOS Client ID**
     ios client id: 184764560064-ls140ur548ej7gj78r6mlvsf7l0ct0jd.apps.googleusercontent.com
5. Create another **OAuth 2.0 Client ID**:
   - Type: **Web application**
   - Save the **Client ID** and **Client Secret**
     client id: 184764560064-60n4te3cr1hinmmaq3q306pu56prj8nd.apps.googleusercontent.com
     client secret: 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
6. Back in Supabase Dashboard → **Authentication → Providers → Google**:
   - Toggle **ON**
   - Paste the **Web Client ID** and **Client Secret**

### 1.4 Set Up Apple Sign-In (Optional — Mac Required)

Requires an Apple Developer account ($99/year). Skip this if you want to test with Google first.

1. In Supabase Dashboard → **Authentication → Providers → Apple** → toggle ON
2. Follow [Supabase's Apple auth guide](https://supabase.com/docs/guides/auth/social-login/auth-apple) to configure Service ID, Key ID, Team ID, and Private Key from the Apple Developer portal

### 1.5 Get a Google Places API Key

1. In Google Cloud Console → **APIs & Services → Library**
2. Search for and enable **Places API**
3. Go to **APIs & Services → Credentials → Create Credentials → API Key**
4. Restrict the key to **Places API only**
5. Copy the API key

### 1.6 Deploy the Google Places Edge Function

**Option A — Supabase CLI (recommended):**

```bash
npm install -g supabase
supabase login
cd /path/to/spot
supabase link --project-ref YOUR_PROJECT_REF   # from Dashboard → Settings → General
supabase secrets set GOOGLE_PLACES_API_KEY=your_google_places_api_key
supabase functions deploy google-places-proxy
```

**Option B — Supabase Dashboard:**

1. Go to **Edge Functions** → **Create a new function**
2. Name it `google-places-proxy`
3. Paste the contents of `supabase/functions/google-places-proxy/index.ts`
4. Go to **Settings → Edge Functions → Secrets**
5. Add `GOOGLE_PLACES_API_KEY` with your key

**Verify it works:**

```bash
curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/google-places-proxy/autocomplete?query=pizza" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "apikey: YOUR_ANON_KEY"
```

curl "https://saiwnrdcdtmgvkkpbprp.supabase.co/functions/v1/google-places-proxy/autocomplete?query=pizza" \
 -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhaXducmRjZHRtZ3Zra3BicHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NjQ4NjQsImV4cCI6MjA4NjI0MDg2NH0.QY-2iICyg1qVI5Zk2-tJCo1UKX-QvEF69kbJcq4sxg0" \
 -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhaXducmRjZHRtZ3Zra3BicHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NjQ4NjQsImV4cCI6MjA4NjI0MDg2NH0.QY-2iICyg1qVI5Zk2-tJCo1UKX-QvEF69kbJcq4sxg0"

You should get back a JSON array of place results.

### 1.7 Phone OTP Auth (Optional)

If you want phone sign-in:

1. Sign up for [Twilio](https://console.twilio.com)
2. Get your **Account SID**, **Auth Token**, and create a **Messaging Service** (save the SID)
3. In Supabase Dashboard → **Authentication → Providers → Phone** → toggle ON
4. Select Twilio as provider and enter your credentials

---

## Part 2A: MacBook + iPhone

You have two options on Mac — native iOS (Xcode) or React Native (Expo). Both run on a physical iPhone.

---

### Option 1: Native iOS App (Xcode)

This is the SwiftUI version of the app.

#### Prerequisites

- macOS Ventura 13.5+
- Xcode 15+ (free from the Mac App Store)
- An Apple ID (free — no paid developer account needed for your own device)
- iPhone running iOS 17+ connected via USB (or on the same Wi-Fi for wireless debugging)

#### Step 1: Configure Credentials

```bash
cd Spot/Spot/Config
cp Secrets.xcconfig.example Secrets.xcconfig
```

Edit `Secrets.xcconfig` and fill in:

```
SUPABASE_URL = https://your-project.supabase.co
SUPABASE_ANON_KEY = eyJhbGci...your-key-here
GOOGLE_CLIENT_ID = your-google-ios-client-id
```

`POSTHOG_API_KEY` and `SENTRY_DSN` are optional — leave them blank if you don't have them.

#### Step 2: Create the Xcode Project

Since the source files were created outside Xcode, you need to create a project and import them:

1. Open Xcode → **Create New Project**
2. Select **iOS → App → Next**
3. Settings:
   - Product Name: `Spot`
   - Team: your personal team
   - Organization Identifier: `com.spot` (so bundle ID becomes `com.spot.Spot`, or adjust to match `com.spot.app`)
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Storage: **SwiftData**
4. Save it somewhere fresh (not inside this repo)
5. Delete the auto-generated `SpotApp.swift` and `ContentView.swift`
6. Copy all folders from `Spot/Spot/` into the Xcode project's `Spot/` folder:
   - `SpotApp.swift`, `Models/`, `Views/`, `ViewModels/`, `Services/`, `Theme/`, `Extensions/`, `Config/`, `Info.plist`
7. In Xcode, right-click the `Spot` folder → **Add Files to "Spot"** → select all copied folders
   - Uncheck "Copy items if needed" (files are already in place)
   - Select "Create groups"

#### Step 3: Add Swift Package Dependencies

In Xcode → click the project → **Package Dependencies** tab → click **+**:

1. **Supabase Swift SDK**
   - URL: `https://github.com/supabase/supabase-swift`
   - Version: Up to Next Major `2.0.0`
   - Add the `Supabase` library to the Spot target

2. **Google Sign-In**
   - URL: `https://github.com/google/GoogleSignIn-iOS`
   - Version: Up to Next Major `7.0.0`
   - Add `GoogleSignIn` and `GoogleSignInSwift`

#### Step 4: Set the Configuration File

1. Click the **Spot** project in the navigator
2. Go to the **Info** tab → **Configurations**
3. For both **Debug** and **Release**, set the configuration file to `Secrets.xcconfig`

#### Step 5: Configure Signing for Your iPhone

1. Click the **Spot** target → **Signing & Capabilities**
2. Check **Automatically manage signing**
3. Select your **Team** (your Apple ID's Personal Team)
4. If the bundle ID conflicts, change it to something unique like `com.yourname.spot`

#### Step 6: Run on Your iPhone

1. Connect your iPhone via USB
2. On your iPhone: **Settings → Privacy & Security → Developer Mode** → turn it ON (restart required)
3. The first time, your iPhone will prompt you to trust the computer — tap **Trust**
4. In Xcode's device dropdown (top bar), select your iPhone
5. Press **Cmd + R** to build and run
6. On first launch, your iPhone will say the developer is untrusted:
   - Go to **Settings → General → VPN & Device Management** → tap your developer profile → **Trust**
7. Run again from Xcode — the app should launch

---

### Option 2: React Native App (Expo)

This is the cross-platform version.

#### Prerequisites

- macOS (any recent version)
- Node.js 18+ (`brew install node` or from [nodejs.org](https://nodejs.org))
- iPhone with the **Expo Go** app installed (free from the App Store)
- Both your Mac and iPhone on the same Wi-Fi network

#### Step 1: Configure Credentials

```bash
cd spot-react-native
cp .env.example .env
```

Edit `.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...your-key-here
GOOGLE_IOS_CLIENT_ID=your-google-ios-client-id
```

#### Step 2: Install Dependencies

```bash
cd spot-react-native
npm install
```

#### Step 3: Start the Dev Server

```bash
npx expo start
```

This will show a QR code in your terminal.

#### Step 4: Open on Your iPhone

1. Open the **Camera** app on your iPhone
2. Point it at the QR code in your terminal
3. Tap the banner that appears — it will open in **Expo Go**
4. The app will bundle and load (first time takes 30-60 seconds)

#### Limitations of Expo Go

Expo Go is great for rapid development but has restrictions:

- **Apple Sign-In won't work** — it requires a native build. Use Google Sign-In or Phone OTP instead.
- **Share extension won't work** — requires a custom native build via EAS.

#### Building a Standalone App (Optional — Full Features)

To get Apple Sign-In and the share extension working, you need a development build:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile development
```

This creates a custom dev client you install on your iPhone instead of Expo Go. Requires an Apple Developer account.

---

## Part 2B: Windows + iPhone

On Windows, you cannot run Xcode or build native iOS apps. The React Native (Expo) path is your only option.

#### Prerequisites

- Windows 10 or 11
- Node.js 18+ (download from [nodejs.org](https://nodejs.org))
- iPhone with the **Expo Go** app installed (free from the App Store)
- Both your PC and iPhone on the same Wi-Fi network

#### Step 1: Configure Credentials

Open PowerShell or Command Prompt:

```powershell
cd spot-react-native
copy .env.example .env
```

Edit `.env` with Notepad or VS Code:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...your-key-here
GOOGLE_IOS_CLIENT_ID=your-google-ios-client-id
```

#### Step 2: Install Dependencies

```powershell
cd spot-react-native
npm install
```

#### Step 3: Start the Dev Server

```powershell
npx expo start
```

A QR code will appear in your terminal.

> **If scanning doesn't connect:** Your firewall might be blocking the connection. Try `npx expo start --tunnel` instead — this routes traffic through Expo's servers and bypasses local network issues. It requires `npm install -g @expo/ngrok` first.

#### Step 4: Open on Your iPhone

1. Open the **Camera** app on your iPhone
2. Scan the QR code
3. It will open in Expo Go and load the app

#### Limitations on Windows

- **No native iOS builds** — you cannot compile `.ipa` files or use Xcode
- **Apple Sign-In won't work** in Expo Go — use Google Sign-In or Phone OTP
- **Share extension won't work** — requires native iOS build
- **To publish to the App Store**, you will eventually need access to a Mac (or use a cloud Mac service like MacStadium, GitHub Actions with macOS runners, or EAS Build)

#### Building Without a Mac (via EAS Build)

Expo's cloud build service can compile native iOS apps without a Mac:

```powershell
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile development
```

EAS Build compiles on Expo's cloud infrastructure. You'll need:

- An Apple Developer account ($99/year)
- To register your iPhone's UDID in the Apple Developer portal (EAS can guide you through this)

Once built, EAS gives you a URL to install the development build on your iPhone.

---

## Troubleshooting

| Problem                             | Solution                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| App crashes immediately (iOS/Xcode) | Check that `Secrets.xcconfig` is filled in and set as the config file for Debug/Release                       |
| "Not authenticated" errors          | Make sure you ran the database migration and the auth provider is enabled in Supabase                         |
| Google Sign-In fails                | Verify the iOS Client ID matches what's in Google Cloud Console, and the Web Client ID/Secret are in Supabase |
| Search returns no results           | Check that the edge function is deployed and `GOOGLE_PLACES_API_KEY` is set as a secret                       |
| Expo Go can't connect               | Make sure Mac/PC and iPhone are on the same Wi-Fi. Try `npx expo start --tunnel`                              |
| "No such module" in Xcode           | File → Packages → Resolve Package Versions, then build again                                                  |
| iPhone says "Untrusted Developer"   | Settings → General → VPN & Device Management → trust your profile                                             |
| Phone OTP doesn't send              | Verify Twilio credentials are correct in Supabase Phone provider settings                                     |

---

## Quick Reference: What Goes Where

| Credential            | Where to get it                     | iOS (Xcode)                              | React Native                    |
| --------------------- | ----------------------------------- | ---------------------------------------- | ------------------------------- |
| Supabase URL          | Supabase Dashboard → Settings → API | `Secrets.xcconfig` → `SUPABASE_URL`      | `.env` → `SUPABASE_URL`         |
| Supabase Anon Key     | Supabase Dashboard → Settings → API | `Secrets.xcconfig` → `SUPABASE_ANON_KEY` | `.env` → `SUPABASE_ANON_KEY`    |
| Google iOS Client ID  | Google Cloud Console → Credentials  | `Secrets.xcconfig` → `GOOGLE_CLIENT_ID`  | `.env` → `GOOGLE_IOS_CLIENT_ID` |
| Google Places API Key | Google Cloud Console → Credentials  | Supabase secret (server-side)            | Supabase secret (server-side)   |
| PostHog API Key       | PostHog → Settings → Project        | `Secrets.xcconfig` → `POSTHOG_API_KEY`   | `.env` → `POSTHOG_API_KEY`      |
| Sentry DSN            | Sentry → Settings → Client Keys     | `Secrets.xcconfig` → `SENTRY_DSN`        | `.env` → `SENTRY_DSN`           |
