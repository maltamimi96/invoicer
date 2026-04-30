# Connected Hub

The companion mobile app for Invoicer. Field workers sign in, see only the work
orders assigned to them, attach photos, update status, and get local push
reminders before each job.

Built with Expo (React Native) so the same codebase runs on iOS and Android.

## Stack

- Expo SDK 54 + Expo Router (file-based navigation)
- Supabase JS for auth, Postgres queries, and Storage uploads
- TanStack Query for caching
- expo-image-picker (camera + library)
- expo-notifications (local schedules — no server push needed)

## Why it just works

The web app's RLS already enforces worker isolation: a `worker` role can only
SELECT work orders where they're the assigned profile (or in
`work_order_assignments`). The mobile app talks to Supabase directly with the
worker's session, so the same RLS policies kick in — there's no separate API
to maintain.

## Setup

```bash
cd mobile
cp .env.example .env
# Fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
# (same values as the web app's .env.local)

npm install
npx expo start
```

Press `i` for the iOS simulator (Mac), `a` for Android, or scan the QR with
Expo Go on a physical phone.

## Building real builds

```bash
# Local preview build (requires EAS account)
npx eas build --platform ios --profile preview
npx eas build --platform android --profile preview

# Production
npx eas build --platform all --profile production
```

`bundleIdentifier` and `package` are pre-set in `app.json` — change them if
you're shipping under a different org.

## Notes for the worker flow

1. The owner adds the worker via Settings → Team in the web app, with role
   **Worker**.
2. The worker registers using that email at `/auth/register` on the web. The
   web's dashboard layout calls `link_my_member_profile()` which connects
   their existing `member_profiles` row to their auth user.
3. They sign in to Connected Hub with the same email + password — every job
   you've assigned to that profile shows up immediately.

## Files

- `app/(auth)/login.tsx` — email + password sign-in
- `app/(tabs)/index.tsx` — jobs list (today / upcoming / completed)
- `app/(tabs)/schedule.tsx` — grouped by day
- `app/(tabs)/profile.tsx` — sign out + notification status
- `app/job/[id].tsx` — full job view: contact tap-to-call/email, address
  tap-to-Maps, take/upload photos, save notes, update status
- `src/lib/supabase.ts` — client with AsyncStorage session persistence
- `src/lib/jobs.ts` — Postgres queries (RLS-scoped)
- `src/lib/storage.ts` — photo upload to the `work-order-photos` bucket
- `src/lib/notifications.ts` — local reminders the evening before + 1 hour
  prior to each scheduled job
