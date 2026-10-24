# Civil Suits Field (Android)

Native Android app (Kotlin, Jetpack Compose) for Civil Suits **field staff**: the people who
collect documents, get papers notarised, e-file and dispatch notices. They see only the tasks
assigned to them, start them, and mark them done with a note and an optional proof photo.
Drafters and admins keep assigning tasks from the website (case page → Field tasks).

Only users with the `field` role can sign in; everyone else is sent to the website.

## What it shows

Task type, case number, court, bank branch, due date and the office's instructions. No borrower
names, account numbers or amounts. A case disappears from the phone once its task is done
(database rule `can_see_case`).

## Proof photos

Taken with the phone camera (or chosen from files), then shrunk to 2000 px and re-encoded as
JPEG, which also drops EXIF data such as GPS location. Uploaded to `case-files` under
`{org}/{case}/field/`, allowed only while the task is open or in progress (storage policy
`case_files_field_insert`). Temporary files are deleted after upload and on sign-out.

## Build

`.github/workflows/field-android.yml` builds a minified release APK on pushes to `main` or the
development branch that touch this folder, and publishes it as a prerelease `field-android-<run>`.
For a stable signature add repository secrets `FIELD_KEYSTORE_B64`, `FIELD_KEYSTORE_PASSWORD`,
`FIELD_KEY_ALIAS`, `FIELD_KEY_PASSWORD`; without them the APK is signed with a throwaway debug key.

## Security

- Opens only after the phone's fingerprint / face / PIN; locks again after 1 minute in the background.
- `FLAG_SECURE`: no screenshots or screen recording; blank preview in recent apps; tapjacking filter.
- Refresh token sealed with an AES-256-GCM Android Keystore key (unlocked device only); access token in memory.
- HTTPS only, system CAs only; no cloud backup or device transfer; refuses rooted phones and debuggers; R8.
- Only the publishable key ships in the app; RLS decides every read and write. Task notes are
  checked in the app and by a database constraint: no PAN, no 9+ digit numbers.

Known limit: the unlock prompt is an app-level gate (the Keystore key is not yet bound to user
authentication), and root detection covers common cases only.
