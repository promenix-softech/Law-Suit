# Promenix Tasks (intern task board)

Native Android app (Kotlin, Jetpack Compose) where interns see only the tasks assigned to them,
move them along (To do → In progress → In review) and send a daily update. The owners create
tasks, approve or send back work, and read every intern's updates from the same app.

Data lives in the `intern_*` tables (migration `supabase/migrations/20261024000000_intern_tasks.sql`),
protected by forced row-level security. Interns have no access to any Civil Suits or Homigo data.

## Build

GitHub Actions (`.github/workflows/tasks-android.yml`) builds a minified release APK on every push
that touches this folder and publishes it as a prerelease named `tasks-android-<run>`.

For a stable signature (so new versions install over old ones), add these repository secrets:
`TASKS_KEYSTORE_B64` (base64 of a `.jks`), `TASKS_KEYSTORE_PASSWORD`, `TASKS_KEY_ALIAS`,
`TASKS_KEY_PASSWORD`. Without them the APK is signed with a throwaway debug key.

## Add an intern

1. Supabase dashboard → Authentication → Users → **Add user** (email + strong password,
   "Auto confirm" on). Keep public sign-ups off.
2. SQL editor:

```sql
insert into public.intern_members (user_id, full_name, role)
select id, 'Full Name', 'intern' from auth.users where email = 'intern@example.com';
```

To remove access: `update public.intern_members set active = false where user_id = ...;`
and delete or ban the user in Authentication. The app signs them out on next use.

## Security

- App opens only after the phone's fingerprint / face / PIN; locks again after 1 minute in the background.
- `FLAG_SECURE`: no screenshots or screen recording; blank preview in recent apps.
- Refresh token sealed with an AES-256-GCM key in the Android Keystore (unlocked-device only);
  access token kept in memory.
- HTTPS only, system CAs only (user-installed interception certificates are not trusted).
- No cloud backup or device transfer of app data.
- Refuses to run on rooted phones or with a debugger attached; R8-minified release build.
- Only the public publishable key ships in the app; every read and write is checked by RLS.

Known limit: the unlock prompt is an app-level gate; the Keystore key is not yet bound to user
authentication (a `CryptoObject`), so a fully hooked, rooted phone could skip the prompt. Root
detection covers common cases only. Planned: bind the vault key to biometric/device-credential
auth on Android 11+.

Design note: the `intern_*` tables have no `org_id` and no `audit_log` triggers, unlike tenant
tables. They are Promenix-internal (not client data); status history lives in `intern_task_events`.
