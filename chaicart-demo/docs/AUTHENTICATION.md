# Firebase facilitator sign-in

ChaiCart uses the same authorization model as ChaiCart Live: Google sign-in plus a Firestore `admins/{email}` document. The email comes from a cryptographically verified Firebase ID token, never from a browser-supplied email field. The exact verified email must match the document ID. Document existence grants access, matching the live app; document fields are not interpreted as roles.

## Setup with the existing live Firebase project

1. Copy the web configuration from the same Firebase project/app used by `chaicart-live`. Configure this backend with:

   | Demo setting | Live app setting |
   | --- | --- |
   | `FIREBASE_API_KEY` | `VITE_FIREBASE_API_KEY` |
   | `FIREBASE_AUTH_DOMAIN` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `FIREBASE_PROJECT_ID` | `VITE_FIREBASE_PROJECT_ID` |
   | `FIREBASE_APP_ID` | `VITE_FIREBASE_APP_ID` |

2. Set `AUTH_MODE=firebase` (the default). Do not set `ADMIN_TOKEN` for this mode. The `/api/auth/config` endpoint exposes only these public web configuration fields, never service-account credentials.
3. Ensure Google sign-in is enabled in that project's Firebase Authentication. Add the demo's Azure hostname (and `localhost` for a local rehearsal) under Authentication → Settings → Authorized domains. This permits sign-in; it does not grant admin access.
4. Give the Node backend credentials for **that same project** via Application Default Credentials. For local development, `GOOGLE_APPLICATION_CREDENTIALS` can point to a securely stored service-account JSON file outside the repository. On Azure, use your approved workload identity federation or mount a protected credential file and set that environment variable. Do not paste the JSON into frontend configuration, commit it, or use a broad owner credential. The backend needs Firestore document read permissions and Firebase Authentication user-read permission (`firebaseauth.users.get`) for revocation/disabled-user checks. Existing Firestore client security rules do not constrain the Admin SDK; IAM does. No Firestore writes are made by this integration.
5. Existing `admins/{email}` documents grant access without copying a second admin list. All entries in that collection, including captains, can use this console under the existing model. If you need only a subset of those admins, add a separate explicit permission model before enabling the shared list.
6. Open `/facilitator` → **Sign in with Google**. The server checks signature, expiry/project, revocation/disabled user, verified email, Google provider, and current admin-document existence. Removing the document denies the next protected request. All fault-control, telemetry and session endpoints enforce this check.

The browser uses in-memory Firebase auth persistence. Reloading the page requires signing in again; Google may reuse its existing Google-account session. Signing into ChaiCart Live on a different origin does not automatically copy its Firebase session into the demo. Sign out using **Disconnect**. Tokens are refreshed by the Firebase client SDK and are not placed in URLs or local storage.

## Local run

Copy `.env.example` to `.env` and fill in the configuration and private credential-file path. Then:

```bash
npm ci
node --env-file=.env server.js
```

The server does not automatically load `.env` when running plain `npm start`. On Azure, set application environment variables instead of uploading a `.env` file.

## Offline fallback for rehearsal

For a local demo without Firebase, explicitly use:

```bash
AUTH_MODE=local-token ADMIN_TOKEN=choose-a-local-token npm start
```

PowerShell: set `$env:AUTH_MODE="local-token"` and `$env:ADMIN_TOKEN` first. There is no automatic token fallback in Firebase mode. Choose this only for a controlled local rehearsal; the deployed facilitator console should use Firebase.

## Errors

- **Sign-in not configured:** set all four Firebase web fields and backend credentials.
- **Unauthorized domain:** add the actual hostname in Firebase Authentication settings.
- **Not in workshop admin list:** inspect `admins/{verified-email}` in the existing project. Anonymous/student accounts cannot access this console.
- **Verification / lookup unavailable:** check backend credentials, IAM permissions, outbound network access and project selection. Access stays denied during an outage.
- **Popup blocked:** allow the sign-in popup and retry by clicking the Google button.

Authorization tests use injected verification and Firestore adapters; they do not access your live Firebase project. Actual Google sign-in, IAM and deployed-domain configuration need a live rehearsal. The existing quiz app and Firestore rules were not modified.

References: [verify ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [revocation checks](https://firebase.google.com/docs/auth/admin/manage-sessions), [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin).

The runtime dependency override pins UUID 11 for Gaxios 6 to avoid a known UUID buffer-bounds advisory; Gaxios uses the supported `v4` API. Keep this override under review when updating the Firebase SDK.

## Customer ordering

The storefront uses Google sign-in from the same Firebase project. Any verified Google customer can order; customers do not need an `admins` entry. The backend verifies identity on checkout, order history, and tracking. Ownership is recorded from the verified UID; browser-supplied owner fields and old lookup tokens cannot grant access to another user's order. Sign-out clears the visible history/tracking. Orders from earlier versions without a customer UID are not added to a new customer's history.

In explicit `AUTH_MODE=local-token` rehearsal mode, **Sign in (demo)** creates an opaque server-side session valid for one hour. This is a simulated identity, not verified email/password authentication. Restarting or refreshing/signing out loses access to that demo customer's history. This endpoint is disabled in Firebase mode.

CLI load testing in Firebase mode requires `CUSTOMER_ID_TOKEN` for a verified Google customer (keep it out of source control). Local-mode load testing obtains a demo session automatically. The facilitator's browser surge uses its signed-in Google identity; Firebase token-verification calls add latency and quota use, so rehearse the load on the configured environment.
