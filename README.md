# Employee Management

This project is a Vite + React application for managing employees, work sessions and payroll records. Supabase provides persistence and authentication.

## Key UI behavior

- The **Vacations & Holidays** tab on the Employees page is an informational overview with collapsible history rows. All leave entries must be created or updated from the dedicated **Time Entry** screen.
- Creating leave from Time Entry always writes both a `WorkSessions` row and a linked `LeaveBalances` ledger entry (`work_session_id`), and the secure API keeps the two tables synchronized on delete/restore actions.
- Organization invitations (sending, listing, accepting, declining, and revoking) flow through the privileged Azure Function at `/api/invitations`, which validates admin permissions against `org_memberships`, auto-expires stale rows, and updates statuses (`pending`, `accepted`, `declined`, `revoked`, `expired`, `failed`).
- Admins and owners can send invites from **Settings → Org Members**, which surfaces a toast-enabled form, loads pending invitations on mount, and lets them revoke invites with inline loading states while members see a read-only directory.
- Invitation emails now send new users to the branded `/#/complete-registration` flow, which verifies the Supabase invite token, collects a new password, and forwards the original `invitation_token` to `/#/accept-invite` for final acceptance.
- The `/#/accept-invite` experience validates the invitation token, surfaces login/registration calls to action when no session exists, blocks mismatched accounts until they sign out, and lets the correct user accept (redirecting to the Dashboard) or decline the invite via the secure `/api/invitations` endpoints.

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `api/local.settings.json` with your Supabase credentials:
   ```json
   {
     "IsEncrypted": false,
     "Values": {
       "APP_SUPABASE_URL": "https://your-project.supabase.co",
       "APP_SUPABASE_ANON_KEY": "public-anon-key",
       "APP_SUPABASE_SERVICE_ROLE": "service-role-key-with-org-access"
     }
   }
   ```
3. Start the Vite dev server:
   ```bash
   npm run dev
   ```
4. In another terminal launch the Azure Static Web Apps emulator so `/api/config` is available:
   ```bash
   swa start http://localhost:5173 --api-location api
   ```

## Building for Azure Static Web Apps

The production build uses the standard Vite flow:

```bash
npm run build
```

The command outputs static assets to the `dist/` directory. Configure Azure Static Web Apps with `app_location: "/"`, `output_location: "dist"`, `api_location: "api"`, and `npm run build` as the build command.

## Runtime configuration

At bootstrap the SPA calls the Azure Function `GET /api/config`. Without credentials the function returns the core Supabase URL and anon key defined by `APP_SUPABASE_URL` and `APP_SUPABASE_ANON_KEY`.

After the user signs in and selects an organization the client issues `GET /api/org/<org-id>/keys` with the header `X-Supabase-Authorization: Bearer <supabase_access_token>`. The API forwards the token to the Control database RPC `public.get_org_public_keys`, which verifies the caller’s membership before returning the organization’s `supabase_url` and `anon_key`. Missing or invalid tokens yield `401`, while users outside the organization receive `403` or `404`.

Visit `/#/diagnostics` in development to review the last configuration request (endpoint, org id, HTTP status, and request scope). Secrets are masked except for the last four characters.

If either `/api/config` or `/api/org/:id/keys` is unreachable or returns non-JSON content the UI shows a blocking error screen in Hebrew with recovery steps.

## Bootstrap flow

Runtime credentials must be resolved before the React tree renders. The bootstrap script performs the following steps:

1. Fetch `/api/config` and await the JSON response.
2. Call `initializeAuthClient(config)` from `src/lib/supabase-manager.js` to hydrate the shared Supabase auth singleton.
3. Render the application once `getAuthClient()` succeeds, passing the resolved config into the runtime providers.

Do not instantiate Supabase clients manually. Components should access the control client through `getAuthClient()` or `useSupabase()` and rely on the hook’s `dataClient` for organization-specific data access.

## Supabase guardrails for contributors

- Reuse the shared clients from `src/lib/supabase-manager.js`: call `getAuthClient()` for the persistent control-database singleton and rely on the organization data helpers provided by `useSupabase()` (e.g., `dataClient`) for tenant data. ESLint forbids importing `createClient` directly, so extend the manager if additional behavior is required.
- Normalize thrown values with `asError` from `src/lib/error-utils.js` or dedicated error classes. Do not assign to `error.name` or mutate built-in error properties—linting will fail if you do.
- When touching Supabase runtime flows run `npm run build` and `node --test` to ensure the guardrails and helper tests still pass.
- Run `npm run dep:check` before committing to ensure no circular dependencies were introduced. The check wraps Madge with the same alias configuration used by Vite, so failures point at real module cycles.

## Health check endpoint

Azure Static Web Apps automatically deploys Azure Functions inside the `api/` directory. The `/api/healthcheck` function responds with:

```json
{ "ok": true }
```

Use this endpoint for platform health probes after deploying to Azure Static Web Apps.
