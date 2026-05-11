# Deploying Connected Hub to TestFlight + Play Internal Testing

End-to-end guide for getting a build into your team's hands.

---

## 0. One-time prerequisites

### Accounts you need

| Service | Cost | Why |
|---|---|---|
| **Apple Developer Program** | US$99/yr | Required to ship to TestFlight + App Store |
| **Google Play Developer** | US$25 one-time | Required to ship to Play Store |
| **Expo account** | Free | Hosts the build pipeline; free tier gives you ~30 builds/month |

Sign-up links:
- Apple: https://developer.apple.com/programs/enroll/
- Google: https://play.google.com/console/signup
- Expo:  https://expo.dev/signup

### Install EAS CLI

```bash
npm install -g eas-cli
eas login
```

---

## 1. First-time project setup

Inside `mobile/`:

```bash
# Link the project to your Expo account (creates the slug if needed)
eas init

# Generate iOS + Android build credentials. Will prompt you for:
#  - Apple ID + app-specific password
#  - Apple Team ID
#  - It generates the iOS distribution cert + provisioning profile for you
#  - For Android, EAS generates a keystore and stores it for you
eas credentials
```

After `eas init`, EAS gives you a **projectId** that lives in `app.json` under `extra.eas.projectId`. Commit that.

---

## 2. Replace the icon (recommended before first build)

The repo currently ships with a flat-teal placeholder. Swap in your real brand icon:

- **`mobile/assets/icon.png`** — 1024×1024 PNG, no transparency
- **`mobile/assets/adaptive-icon.png`** — 1024×1024 PNG (Android adaptive icon foreground)
- **`mobile/assets/splash.png`** — 1242×2436 PNG (or any portrait dimension; will be centred)
- **`mobile/assets/favicon.png`** — 48×48 PNG (web only — optional)

> Easiest way: use the free https://www.appicon.co/ generator. Drag your logo in, it spits out all sizes.

---

## 3. Configure secrets

Mobile builds need the Supabase URL + anon key burned in. Set them as **EAS Build secrets** (NOT in `.env`, which gets baked into web builds, not EAS):

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value 'https://YOUR_PROJECT.supabase.co'
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value 'eyJ…'
eas secret:create --scope project --name EXPO_PUBLIC_APP_URL --value 'https://kireihq.com'
```

EAS Build will surface those as env vars during the build automatically.

---

## 4. Preview build (no store submission needed)

Best for fast iteration — installs straight onto registered iPhones and Android devices, no review process.

```bash
# iOS — for any iPhone whose UDID you've registered in the Apple Dev portal
eas build --profile preview --platform ios

# Android — produces a downloadable .apk
eas build --profile preview --platform android
```

Each command:
1. Uploads your repo to EAS
2. Builds in the cloud (~10-15 min)
3. Gives you a URL/QR for the team to install

For iOS, register team device UDIDs first:
```bash
eas device:create
```

---

## 5. Production build → TestFlight (iOS)

```bash
eas build --profile production --platform ios
```

Then submit to App Store Connect → TestFlight:

```bash
eas submit --platform ios --latest
```

The first run prompts for:
- Apple ID email
- App-specific password (generate at https://appleid.apple.com → Sign-In & Security → App-Specific Passwords)
- Apple Team ID (visible in your Developer account)

EAS uploads the build to App Store Connect. **TestFlight then takes 10-30 min to process** the binary. Once it's done, add your team's Apple IDs as **Internal Testers** in App Store Connect → TestFlight → Internal Testing. They install via the **TestFlight** app on their phones.

> Edit `mobile/eas.json` and fill in the real `appleId`, `ascAppId`, `appleTeamId` so future submits are non-interactive.

---

## 6. Production build → Play Internal Testing (Android)

```bash
eas build --profile production --platform android
```

Submit to Play Console → Internal Testing:

```bash
eas submit --platform android --latest
```

The first run needs a **service account JSON** for the Play API. Set it up once:

1. Go to https://play.google.com/console → Settings → API access
2. Click **Create new service account** (it opens GCP Console)
3. In GCP, create a service account → key type **JSON** → download
4. Back in Play Console, grant the service account **Release manager** role
5. Save the JSON file as `mobile/play-service-account.json` (this path is already in `eas.json`)
6. `.gitignore` already excludes it — **never commit this file**

Then `eas submit --platform android --latest` will push to Internal Testing.

Add testers in Play Console → Testing → Internal testing → **Testers** tab → either by email or a Google Group.

Testers join via the opt-in URL the Play Console gives you, then install the app from the Play Store normally.

---

## 7. Iterate

For every subsequent build:

```bash
# Bump version in app.json: "version": "0.2.0"
# Build numbers (iOS buildNumber + Android versionCode) auto-increment thanks to "autoIncrement": true

eas build --profile production --platform all
eas submit --platform all --latest
```

For tiny fixes that don't need a new binary, push an OTA update instead (works for JS-only changes):

```bash
eas update --branch production --message "Fix invoice copy"
```

Users get the update on next app open — no app-store review.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `eas: command not found` | `npm install -g eas-cli` |
| Build fails: "expo-linear-gradient SDK mismatch" | `cd mobile && npx expo install --check` then commit `package.json` |
| iOS build complains "no provisioning profile" | Run `eas credentials` → iOS → "Set up a new Distribution Certificate" |
| Android build complains "no keystore" | `eas credentials` → Android → "Set up new keystore" (EAS generates one) |
| TestFlight build never shows up | Wait 30 min, check App Store Connect → "Processing" status. If it errors there, click the build for the reason (usually missing app-store icon or privacy declaration). |
| Mic doesn't work in TestFlight | `NSMicrophoneUsageDescription` already set in `app.json`; rebuild |

---

## What to send your team

**iOS testers:**
> "Install **TestFlight** from the App Store. You'll get an email invite — accept it, then open TestFlight to install Connected Hub."

**Android testers:**
> "Open this opt-in URL on your phone: `<URL from Play Console>`. After joining, search for **Connected Hub** in the Play Store and install normally."

That's it. New builds appear automatically inside TestFlight / Play Internal as soon as `eas submit` finishes.
