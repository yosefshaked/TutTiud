# Project Documentation: Employee & Payroll Management System

**Version: 1.11.0**
**Last Updated: 2025-10-22**

## 1. Vision & Purpose

The goal of this project is to provide a user-friendly, efficient, and reliable application for managing employee payroll. It serves as a replacement for an error-prone Excel file, tailored to the specific needs of a business with two main employee types: hourly workers and instructors paid per session.

**Key Requirements:**
- A simple and intuitive user interface (primarily in Hebrew).
- The ability to define dynamic rates that can change over time.
- Flexible management of service types (sessions) that instructors can perform.
- Accurate and interactive reporting.
- Preservation of historical accuracy for all financial data.

---

## 2. Architecture & Technology Stack

The system is built on a modern client-server architecture, packaged as a standalone desktop application.

*   **Desktop Application Shell:**
    *   **Framework:** Electron
    *   **Packaging:** electron-builder
    *   **Features:** Includes a custom launcher for opening the app in its own window or in the user's default browser.

*   **Frontend (Client-Side):** A Single Page Application (SPA) built with:
    *   **Framework:** React
    *   **Routing:** React Router (`HashRouter` for desktop compatibility)
    *   **Build Tool:** Vite
    *   **Styling:** Tailwind CSS
    *   **Component Library:** shadcn/ui

*   **Backend & Database:**
    *   **Secure API Gateway:** Azure Functions hosts all `/api/*` endpoints that proxy requests after validating identity, organization membership, and roles.
    *   **Data Platform:** Supabase PostgreSQL projects per customer tenant, accessed only through the server-side `tenantClient` created inside the Azure Functions.
    *   **Data Access Rule:** The frontend never talks to the customer database directly for writes; it always calls the secure API which then executes the database operation.

*   **Configuration Management:**
    *   Runtime credentials load exclusively from the `/api/config` Azure Function. Without a bearer token the function returns the core Supabase URL and anon key defined by `APP_SUPABASE_URL` and `APP_SUPABASE_ANON_KEY`.
*   Organization-specific Supabase URLs and anon keys are retrieved via `GET /api/org/<org-id>/keys` with the header `X-Supabase-Authorization: Bearer <supabase_access_token>`, which forwards the caller’s JWT to the Supabase RPC `public.get_org_public_keys` to verify membership before returning secrets.

### 2.1. Organization & Membership Model

- The desktop shell keeps a dedicated Supabase project for application metadata. Core tables include `organizations`, `org_memberships`, and `org_invitations`.
- Each organization row stores the Supabase public connection details (`supabase_url`, `supabase_anon_key`), the encrypted dedicated key (`dedicated_key_encrypted`) that unlocks server-side write access, optional `policy_links` (array of URLs), `legal_settings` (JSON payload for contact email, terms, privacy policy), and lifecycle markers (`setup_completed`, `verified_at`).
- Membership rows link Supabase Auth `user_id` values to an organization with a `role` (`admin` or `member`). Each user currently belongs to a single organization; switching orgs updates the active organization context used by secure API calls instead of retargeting a browser Supabase client.
- Invitation rows record pending emails. Admins can issue invites from **Settings → Org Members**, revoke pending ones, or remove existing members (except themselves).
- On login the `OrgProvider` loads the user’s memberships, persists the last selected org in `localStorage`, and ensures routes without a saved connection redirect to **Settings** so the Setup Assistant can finish configuration. The active organization context is then forwarded with every secure API call instead of wiring the UI directly to the tenant database.

### 2.2. Secure API Gateway Flow

- **Request Initiation:** The frontend issues authenticated fetches to endpoints such as `POST /api/services` or `GET /api/work-sessions`, always attaching the user’s Supabase JWT in the `Authorization: Bearer <token>` header.
- **Control Validation:** The Azure Function validates the JWT against the Control DB, ensuring the session is active and gathering the caller’s profile.
- **Membership & Role Check:** The function confirms the user belongs to the requested organization via `org_memberships` and blocks write operations unless the role is `admin` or `owner`.
- **Tenant Resolution:** Once authorized, the function loads the organization’s Supabase connection details, including the encrypted dedicated key (`dedicated_key_encrypted`).
- **Key Decryption:** Using the server-side secret `APP_ORG_CREDENTIALS_ENCRYPTION_KEY`, the function decrypts the dedicated key and creates a privileged `tenantClient` scoped to the tenant’s Data DB with the `app_user` role.
- **Database Action:** All reads and writes execute through this server-only `tenantClient`. The function performs the requested query (e.g., selecting ordered services or inserting work sessions) and captures any errors.
- **Response:** The function returns a JSON payload to the frontend, translating Supabase errors into standardized API messages. The UI never holds the dedicated key nor performs direct writes, ensuring RLS and auditing remain intact.

### 2.3. Organization Invitations API

- The Azure Function at `/api/invitations` is the single entry point for creating, listing, validating, and actioning organization invites.
- It instantiates a Supabase admin client with `APP_CONTROL_DB_URL` and `APP_CONTROL_DB_SERVICE_ROLE_KEY`, validates the caller’s JWT, and re-checks membership/role directly against `org_memberships` before performing any write.
- `POST /api/invitations` accepts `{ orgId, email, expiresAt?, redirectTo?, emailData? }` from admins/owners, blocks duplicates or existing members, inserts a row into `org_invitations`, and then calls `supabase.auth.admin.inviteUserByEmail` with metadata `{ orgId, orgName, invitationId, invitationToken }`.
- `GET /api/invitations` (admin-only) filters pending rows for the requested organization, auto-expires rows whose `expires_at` has passed, and returns sanitized invitation records.
- `GET /api/invitations/token/:token` exposes a public lookup that verifies the token, checks expiry, and returns `{ orgName, email, status }` without leaking sensitive fields.
- `POST /api/invitations/:id/accept` requires the invitee’s authenticated email to match the invitation, upserts an `org_memberships` row with role `member`, and marks the invite as `accepted`.
- `POST /api/invitations/:id/decline` verifies the caller and flips the status to `declined`; `DELETE /api/invitations/:id` allows admins to revoke pending invites.
- Status lifecycle: `pending` → (`accepted` | `declined` | `revoked` | `expired` | `failed`). Expired invites are updated server-side before responses so the UI never shows stale entries.

### 2.4. Settings → Org Members Invitation UI

- `src/api/invitations.js` wraps the Azure Function endpoints with `createInvitation`, `listPendingInvitations`, and `revokeInvitation`, validating UUIDs/emails and surfacing localized error messages when requests fail.
- `OrgMembersCard.jsx` now loads pending invitations on mount, surfaces loading/error/empty states, and refreshes the list after every create or revoke action. Abort signals prevent state updates when the component unmounts.
- Admins and owners see the invite form (with an accessible email label) and the pending list; members keep a read-only view of active users. Successful sends and revocations raise green toasts, while validation or network issues produce red toasts.
- The pending list displays email, send date, and current status badge alongside a revoke button that enters a temporary "מבטל..." state while awaiting the API response.

### 2.5. Invitation Registration Completion Flow

- Invitation emails now deep-link new users to `/#/complete-registration?token_hash=<supabase>&invitation_token=<internal>`, which renders the dedicated **CompleteRegistrationPage** component.
- On mount the page parses `token_hash` and immediately calls `supabase.auth.verifyOtp({ type: 'invite', token_hash })` through the shared auth client. A successful response establishes the Supabase session so the user is fully authenticated before interacting with the form.
- After verification the UI presents a branded password form (new password + confirmation). Client-side validation enforces non-empty fields and matching values before calling `supabase.auth.updateUser({ password })`.
- Once the password is saved the app automatically redirects to `/#/accept-invite`, forwarding the `invitation_token` query parameter so the organization invitation flow can finalize acceptance without re-fetching control-plane metadata.

### 2.6. Invitation Acceptance Experience

- The `/components/pages/AcceptInvitePage.jsx` module orchestrates the secure acceptance flow at `/#/accept-invite`.
- On mount it parses the `invitation_token`, fetches the invitation via `getInvitationByToken(token)`, and displays branded loading and error states while handling expired or invalid links.
- Scenario A (no active Supabase session): the page surfaces the organization name, invitation email, and provides "Log In" and "Complete Registration" buttons that preserve the invitation token when redirecting to the relevant routes.
- Scenario B (active session, matching email): the app enables "Accept" and "Decline" actions wired to `acceptInvitation` / `declineInvitation`, shows localized API errors, and on success either redirects to the Dashboard (accept) or confirms the decline.
- Scenario C (active session, mismatched email): a warning banner instructs the user to sign out. The "Switch Account" button calls `signOut` and redirects back to `/login` with contextual guidance while retaining the invitation token.

---

## 3. Database Schema

This is the core of the system. The database consists of four primary tables:

### 3.1. `Employees` Table
Contains general information about each employee.

| Column | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | Auto-generated unique identifier | **Primary Key** |
| `name` | `text` | Employee's full name | Not NULL |
| `employee_type`| `text` | Employee type ('hourly', 'instructor', 'global') | Not NULL |
| `current_rate` | `numeric` | General hourly or monthly rate snapshot | |
| `working_days` | `jsonb` | Array of working day codes (e.g., `["SUN","MON"]`) | Default: `["SUN","MON","TUE","WED","THU"]` |
| `is_active` | `boolean`| Whether the employee is currently active | Default: `true` |
| ... | ... | Additional fields: `employee_id`, `phone`, `email`, `start_date`, `notes` | |

### 3.2. `Services` Table
Contains the dynamic list of services/sessions that instructors can perform.

| Column | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | Auto-generated unique identifier | **Primary Key** |
| `name` | `text` | Name of the service (e.g., "Therapeutic Riding 30 min") | Not NULL |
| `duration_minutes`| `int8`| Duration of the service in minutes (for hour calculations) | |
| `payment_model` | `text` | Payment model ('fixed_rate' or 'per_student') | Not NULL |
| `color` | `text` | A hex color code (e.g., `#8B5CF6`) for UI display | |

### 3.3. `RateHistory` Table
The most critical table. It stores the historical log of rates for each employee and service.

| Column | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | Auto-generated unique identifier | **Primary Key** |
| `employee_id` | `uuid` | References the `Employees` table | **Foreign Key** |
| `service_id` | `uuid` | References the `Services` table | **Foreign Key** |
| `rate` | `numeric` | The rate amount | Not NULL |
| `effective_date`| `date` | The date from which this rate is effective | Not NULL |
| `notes` | `text` | Notes about the rate change | |
| **Composite Unique Constraint** | `UNIQUE` | On columns: `employee_id`, `service_id`, `effective_date` | |

### 3.4. `WorkSessions` Table
The work log. Each row represents a completed work session.

| Column | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | Auto-generated unique identifier | **Primary Key** |
| `employee_id` | `uuid` | References the `Employees` table | **Foreign Key** |
| `service_id` | `uuid` | References the `Services` table (for instructors) | **Foreign Key** |
| `date` | `date` | The date the work was performed | Not NULL |
| `entry_type` | `text` | 'session', 'hours', 'adjustment', 'leave_employee_paid', 'leave_system_paid', 'leave_unpaid', or 'leave_half_day' | Not NULL |
| `hours` | `numeric` | Number of hours (display-only for globals) | |
| `sessions_count`| `int8` | Number of sessions (for instructors) | |
| `students_count`| `int8` | Number of students (for `per_student` model) | |
| `rate_used` | `numeric`| A "snapshot" of the rate used at the time of calculation | |
| `total_payment`| `numeric`| A "snapshot" of the final calculated amount | |

#### WorkSessions Calculation Rules

- `rate_used` is loaded from `RateHistory` on each create/update. Instructors resolve it by `(employee_id, service_id, date)`; hourly and global employees resolve it by `(employee_id, date)`.
- `service_id` is mandatory for instructor sessions. Saving is blocked if no matching rate exists for the date.
- `effectiveWorkingDays(employee, month)` counts calendar days whose weekday exists in `employee.working_days`. If the result is `0`, saving is blocked.
- `total_payment` is computed per row and stored:
  - Instructors: `sessions_count * students_count * rate_used` (or without students when not per-student).
  - Hourly employees: `hours * rate_used`.
  - Global hours: `monthly_rate / effectiveWorkingDays(employee, month)` (each row represents one day; hours field is ignored and multiple rows on the same date count once).
  - Leave rows: quota deductions use `entry_type='leave_employee_paid'`, system-paid holidays use `entry_type='leave_system_paid'`, unpaid leave records use `entry_type='leave_unpaid'` with `total_payment=0`, and half-day deductions use `entry_type='leave_half_day'` with `total_payment` equal to half of the resolved daily value.
  - Monthly totals and reports sum `total_payment` from `WorkSessions` rows only, deduplicating global rows by day; no external base salary is added.
  - Each row may include optional `notes` (free text, max 300 chars).

Half-day usage is now driven entirely by the `entry_type='leave_half_day'` flag; metadata no longer stores a `leave.half_day` boolean.

All `POST /api/work-sessions` calls now return the full inserted records (not just identifiers) so the client can immediately link newly created leave rows to their ledger entries.

#### WorkSessions Deletion Workflow

- **Soft delete is the default:** Any removal initiated outside the Trash tab issues a soft delete (`deleted=true`, `deleted_at=NOW()`). The record remains recoverable and surfaces in the Trash view.
- **Permanent delete is restricted:** Only the Trash tab can trigger a permanent delete. The UI requires the administrator to type "מחק" to confirm and the API must receive `DELETE /api/work-sessions/{id}?permanent=true`.
- **API contract:** The Azure Function interprets `permanent=true` as an irreversible delete (`DELETE`). Calls without the flag always perform the soft-delete update.
- **Ledger synchronization:** When the target row is a leave session, the API permanently removes the linked `LeaveBalances` entry on soft delete and recreates it automatically on restore. Permanent deletes clear both records together.
- **UI confirmations:** Standard delete flows (forms, inline rows) show an informational dialog clarifying that the row will move to the Trash. The Trash tab exclusively presents the high-friction confirmation before final deletion.

### 3.5. `Settings` Table
Stores organization-wide configuration values, accessed via a stable `key`.

| Column | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | Auto-generated unique identifier | **Primary Key** |
| `key` | `text` | Settings bucket identifier (e.g., `leave_policy`) | **Unique** |
| `settings_value` | `jsonb` | Structured JSON payload for the setting | Not NULL |
| `created_at` | `timestamptz` | Creation timestamp | Default: `now()` |
| `updated_at` | `timestamptz` | Last update timestamp | Default: `now()` |

The `leave_policy` record contains the leave-management configuration consumed across the app:

- `allow_half_day` – allow employees to consume 0.5 day at a time.
- `allow_negative_balance` – enable overdraft until reaching the configured floor.
- `negative_floor_days` – minimum balance allowed (negative values represent how far below zero the balance may go).
- `carryover_enabled` / `carryover_max_days` – governs how many unused days roll into the next year.
- `holiday_rules[]` – array of `{ id, name, type, start_date, end_date, recurrence }` objects that mark holiday ranges and tag them as system-paid, employee-paid, unpaid, mixed, or half-day.

All read/write operations should reuse the helpers in `src/lib/leave.js` to normalize the JSON and guarantee consistent IDs.

### 3.6. `LeaveBalances` Table
Acts as the immutable ledger for employee leave allocations and usage.

| Column | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `bigint` | Auto-incrementing identifier | **Primary Key** |
| `employee_id` | `uuid` | References the `Employees` table | **Foreign Key** |
| `work_session_id` | `uuid` | Links to the originating `WorkSessions` row (time-entry generated) | **Foreign Key**, Nullable |
| `leave_type` | `text` | Context for the entry (e.g., `allocation`, `usage_employee_paid`, `time_entry_leave_employee_paid`) | Not NULL |
| `balance` | `numeric` | Positive values add quota, negative values deduct usage | Not NULL, Default `0` |
| `effective_date` | `date` | Effective date of the leave event | Not NULL |
| `notes` | `text` | Optional free-form details | |
| `created_at` | `timestamptz` | Insert timestamp | Default: `now()` |

Ledger entries support fractional values (e.g., `-0.5` for half-day usage when policy allows it). Negative entries representing usage are validated against the configured floor before insert; attempts to exceed the overdraft surface the toast "חריגה ממכסה ימי החופשה המותרים" and are rejected. Every leave saved through the Time Entry flow now creates a matching `LeaveBalances` row linked via `work_session_id`, even for unpaid or system-paid leave (balance `0`).

### Multi-date Quick Entry UX

Users can enable **"בחר תאריכים להזנה מרובה"** in the time-entry table to select multiple dates and employees. Clicking **"הזן"** opens a modal listing all selected dates as stacked mini-forms—one row per date and employee. Each field has an **"העתק מהרישום הקודם"** button to copy from the previous row.
Global employees see an hours field for reference only and a toggle between regular day and paid leave; pay is still one daily rate per row.
Saving creates a `WorkSessions` record for every employee × date combination selected.

### Hebrew Data Import

The import modal supports either pasting text or uploading a `.csv` file. Lines starting with `#` are treated as comments and skipped. The employee is chosen inside the modal; the file must not contain an employee column. Supported delimiters are comma, TAB, semicolon and pipe—auto detected with a manual override.

**Header Mapping**

| Hebrew             | Internal field |
|-------------------|----------------|
| תאריך            | `date` (DD/MM/YYYY → YYYY-MM-DD) |
| סוג רישום        | `entry_type` (`שיעור`=`session`, `שעות`=`hours`, `התאמה`=`adjustment`, `חופשה בתשלום`=`leave_employee_paid`, `חופשה מערכת`=`leave_system_paid`, `חופשה ללא תשלום`=`leave_unpaid`, `חצי יום`=`leave_half_day`) |
| שירות            | `service_name` |
| שעות             | `hours` |
| מספר שיעורים     | `sessions_count` |
| מספר תלמידים     | `students_count` |
| סכום התאמה       | `adjustment_amount` |
| הערות            | `notes` |

The preview shows up to 100 rows with per-row error messages. Duplicate rows are flagged and skipped unless the user opts in to import them.

**Templates**

Buttons in the modal allow downloading a CSV template (UTF‑8 with BOM) and a basic Excel placeholder. Both templates include instructional comment lines and example rows marked “(דוגמה)” that should be deleted before upload.

**Validation Rules**

- `date` must parse to ISO format.
- `session` rows require `service_name`, `sessions_count` ≥1, `students_count` ≥1 and a rate snapshot.
- `hours` rows require a rate snapshot; hourly employees must supply `hours`, while global employees ignore it and use a daily rate.
- Leave entry types (`leave_employee_paid`, `leave_system_paid`, `leave_half_day`) require a rate snapshot for the selected employee and date; `leave_unpaid` rows insert with zero payment but still require the basic identifying fields.
- `adjustment` rows require an `adjustment_amount` and ignore other fields.

Only valid rows are inserted into `WorkSessions`; the summary dialog lists inserted, failed and skipped rows.

### Global Single-Day Editor
- When editing a global employee for a specific date, the modal aggregates all segments under one day header. A single day type selector controls the entire day, and adding hour segments does **not** multiply pay. Removing the last segment is blocked with a notice.
- The month view sums the hours of all segments per day for global employees, showing `X שעות` while pay remains counted once per day.

---

## 4. Architectural Decisions & Lessons Learned

Several key decisions were made during development that shaped the system:

1.  **Using a separate `RateHistory` table:** Instead of adding rate columns to the `Employees` table.
    *   **Reasoning:** This provides infinite flexibility for adding new services without altering the database schema. Most importantly, it maintains a **perfectly accurate rate history**, which is essential for retroactive calculations.
    *   **Lesson:** Historical accuracy in financial data outweighs the simplicity of a "flat" data structure.

2.  **Using `upsert` with a composite `onConflict` constraint:** To prevent duplicate rate entries for the same day, we defined a unique constraint on the combination of `employee_id`, `service_id`, and `effective_date`.
    *   **Reasoning:** This allows us to use an efficient `upsert` command that overwrites changes made on the same day, thus preventing database "clutter" and maintaining a single source of truth for any given day.
    *   **Lesson:** Proper use of database constraints simplifies application logic and prevents bugs.

3.  **Making components "smart" and self-sufficient:** A bug where the employee edit form didn't show updated rates was solved by making the `EmployeeForm` component responsible for fetching its own up-to-date data, rather than relying on potentially stale data from its parent.
    *   **Lesson:** It's crucial to manage state wisely and ensure components always work with the most current data they need.

4.  **Prioritizing User Experience (UX):** We debated extensively about form behavior, especially when switching between employee types.
    *   **The Decision:** Instead of a full form reset, we implemented a "smart partial reset" and added a styled `AlertDialog` to give the user full control over actions that could cause data loss.
    *   **Lesson:** A good user experience requires thinking about edge cases and avoiding automatic behaviors that might frustrate the user.

5.  **Centralized rate history management:** A dedicated `RateHistoryManager` component lets admins add or edit historical rates directly from an employee's form; deletion is intentionally disabled to preserve audit history.
    *   **Lesson:** Consolidating rate edits in one place keeps payroll data consistent and transparent.

6.  **Manual collapsible rows for leave history:** Drill-down sections inside tables now rely on `useState` toggles that append a second `<tr>` with a spanning drawer cell instead of wrapping rows with headless collapsible primitives.
    *   **Reasoning:** Keeping the DOM as sibling `<tr>` elements preserves accessible table semantics, prevents column misalignment, and avoids layout breakage when browsers auto-correct invalid table markup.
    *   **Lesson:** When enhancing tables with expandable drawers, prefer explicit conditional rendering over generic disclosure components to maintain structural integrity.

---

## 5. Setup and Deployment Guide

This guide is for a new developer (or AI) joining the project who needs to set up the development environment from scratch.
### Development Setup

1.  **Clone the Repository:** `git clone [repository-url]`
2.  **Install Dependencies:** `npm install`
3.  **Setup Supabase:**
    *   Create a new project on `supabase.com`.
    *   Create the 4 tables (`Employees`, `Services`, `RateHistory`, `WorkSessions`) as specified in Section 3.
    *   Ensure all `Primary Keys`, `Foreign Keys`, and `Constraints` are configured correctly.

### Organization Onboarding Flow

1. Sign in with Supabase Auth (Google, Microsoft, or email+password).
2. The **Select Organization** screen lists any memberships tied to your account. Create a new organization or accept pending invites to continue.
3. After selecting an organization, open **Settings → Setup Assistant** to store the Supabase URL/anon key and run the guided SQL.
4. Use **Settings → Org Members** to invite additional admins. They will see the invite on the Select Organization screen and inherit the same Supabase connection once accepted.

### Supabase Security Baseline (Row Level Security)

Every customer project must enable row level security (RLS) so that only authenticated users can read or modify data. The in-app Setup Assistant (Settings → Setup Assistant) guides admins through three required steps:

1. **Connect** – enter the Supabase public URL and anon key. The values are saved on the organization record (`app_organizations.supabase_url` / `supabase_anon_key`) together with any policy links or legal metadata so every admin sees the same configuration.
2. **Apply SQL** – run the schema/helper block and the RLS baseline block below (in this order) from the Supabase SQL editor while signed in as the project owner.
3. **Verify** – click “הרץ אימות” in the assistant. It calls the `setup_assistant_diagnostics()` helper with the anon key, reports any missing pieces, and flips `app_organizations.setup_completed` + `verified_at` when everything passes. Routes other than **Settings** remain blocked until this step succeeds.

#### Mandatory SQL additions

The setup script for every customer project **must** include the following commands before applying RLS policies:

```sql
INSERT INTO "public"."Services" ("id", "name", ...)
VALUES ('00000000-...', 'תעריף כללי...', ...);
```

```sql
GRANT app_user TO postgres, anon;
```

```sql
ALTER TABLE public."RateHistory"
ADD CONSTRAINT "RateHistory_employee_service_effective_date_key"
UNIQUE (employee_id, service_id, effective_date);
```

These statements seed the baseline service, ensure the runtime role mapping matches the secure API gateway, and guarantee deduplicated rate history across all tenants.

#### Schema + helper SQL

The complete schema and helper SQL script is maintained in the file `src/lib/setup-sql.js`. The application's Setup Assistant provides a copy-paste-ready version of this script for the user.

#### RLS baseline SQL

```sql
-- שלב 2: הפעלת RLS והוספת מדיניות מאובטחת
alter table public."Employees" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Employees'
      and policyname = 'Authenticated select Employees'
  ) then
    create policy "Authenticated select Employees" on public."Employees"
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Employees'
      and policyname = 'Authenticated insert Employees'
  ) then
    create policy "Authenticated insert Employees" on public."Employees"
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Employees'
      and policyname = 'Authenticated update Employees'
  ) then
    create policy "Authenticated update Employees" on public."Employees"
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Employees'
      and policyname = 'Authenticated delete Employees'
  ) then
    create policy "Authenticated delete Employees" on public."Employees"
      for delete to authenticated
      using (true);
  end if;
end;
$$;

alter table public."WorkSessions" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'WorkSessions'
      and policyname = 'Authenticated select WorkSessions'
  ) then
    create policy "Authenticated select WorkSessions" on public."WorkSessions"
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'WorkSessions'
      and policyname = 'Authenticated insert WorkSessions'
  ) then
    create policy "Authenticated insert WorkSessions" on public."WorkSessions"
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'WorkSessions'
      and policyname = 'Authenticated update WorkSessions'
  ) then
    create policy "Authenticated update WorkSessions" on public."WorkSessions"
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'WorkSessions'
      and policyname = 'Authenticated delete WorkSessions'
  ) then
    create policy "Authenticated delete WorkSessions" on public."WorkSessions"
      for delete to authenticated
      using (true);
  end if;
end;
$$;

alter table public."LeaveBalances" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'LeaveBalances'
      and policyname = 'Authenticated select LeaveBalances'
  ) then
    create policy "Authenticated select LeaveBalances" on public."LeaveBalances"
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'LeaveBalances'
      and policyname = 'Authenticated insert LeaveBalances'
  ) then
    create policy "Authenticated insert LeaveBalances" on public."LeaveBalances"
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'LeaveBalances'
      and policyname = 'Authenticated update LeaveBalances'
  ) then
    create policy "Authenticated update LeaveBalances" on public."LeaveBalances"
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'LeaveBalances'
      and policyname = 'Authenticated delete LeaveBalances'
  ) then
    create policy "Authenticated delete LeaveBalances" on public."LeaveBalances"
      for delete to authenticated
      using (true);
  end if;
end;
$$;

alter table public."RateHistory" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'RateHistory'
      and policyname = 'Authenticated select RateHistory'
  ) then
    create policy "Authenticated select RateHistory" on public."RateHistory"
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'RateHistory'
      and policyname = 'Authenticated insert RateHistory'
  ) then
    create policy "Authenticated insert RateHistory" on public."RateHistory"
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'RateHistory'
      and policyname = 'Authenticated update RateHistory'
  ) then
    create policy "Authenticated update RateHistory" on public."RateHistory"
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'RateHistory'
      and policyname = 'Authenticated delete RateHistory'
  ) then
    create policy "Authenticated delete RateHistory" on public."RateHistory"
      for delete to authenticated
      using (true);
  end if;
end;
$$;

alter table public."Services" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Services'
      and policyname = 'Authenticated select Services'
  ) then
    create policy "Authenticated select Services" on public."Services"
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Services'
      and policyname = 'Authenticated insert Services'
  ) then
    create policy "Authenticated insert Services" on public."Services"
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Services'
      and policyname = 'Authenticated update Services'
  ) then
    create policy "Authenticated update Services" on public."Services"
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Services'
      and policyname = 'Authenticated delete Services'
  ) then
    create policy "Authenticated delete Services" on public."Services"
      for delete to authenticated
      using (true);
  end if;
end;
$$;

alter table public."Settings" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Settings'
      and policyname = 'Authenticated select Settings'
  ) then
    create policy "Authenticated select Settings" on public."Settings"
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Settings'
      and policyname = 'Authenticated insert Settings'
  ) then
    create policy "Authenticated insert Settings" on public."Settings"
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Settings'
      and policyname = 'Authenticated update Settings'
  ) then
    create policy "Authenticated update Settings" on public."Settings"
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Settings'
      and policyname = 'Authenticated delete Settings'
  ) then
    create policy "Authenticated delete Settings" on public."Settings"
      for delete to authenticated
      using (true);
  end if;
end;
$$;
```

#### Verification helper

- `setup_assistant_diagnostics()` returns one row per table with `has_table`, `rls_enabled`, `missing_policies[]`, and an optional `delta_sql` snippet you can paste back into Supabase if anything is missing.
- The Setup Assistant displays the `delta_sql` output and re-runs the checks whenever you press the verify button so the UI goes green once everything is secured.
#### Verification helper

- `setup_assistant_diagnostics()` returns one row per table with `has_table`, `rls_enabled`, `missing_policies[]`, and an optional `delta_sql` snippet you can paste back into Supabase if anything is missing.
- The Setup Assistant displays the `delta_sql` output and re-runs the checks whenever you press the verify button so the UI goes green once everything is secured.

**Verification:** After running the SQL, return to the Setup Assistant and use the “Verify Policies” button. The routine performs read-only checks to confirm that authenticated requests succeed while anonymous requests receive 401/403 responses. All tables should report a green “Secured” badge before continuing.
4.  **Configure the Runtime API:**
    *   Create `api/local.settings.json` with:
        ---------------------------------------------------------------
        {
          "IsEncrypted": false,
          "Values": {
            "APP_SUPABASE_URL": "https://<metadata-project>.supabase.co",
            "APP_SUPABASE_ANON_KEY": "public-anon-key",
            "APP_SUPABASE_SERVICE_ROLE": "service-role-key-with-org-access"
          }
        }
        ---------------------------------------------------------------
    *   When deploying to Azure Static Web Apps, configure the same keys under the **API** application settings so `/api/config` can serve both bootstrap and organization requests.
5.  **Run the Development App:**
    ---------------------
    npm run electron:dev
    ---------------------
    In a second terminal run `swa start http://localhost:5173 --api-location api` so the `/api/config` function is reachable during development.
    ---------------------
    This will launch the application in a desktop window with hot-reloading.

### Building for Production

1.  **Run the build command:**
    ------------------------
    npm run electron:build
    ------------------------
2.  This command will:
    *   Build the React application into the `/dist` folder.
    *   Package the app with Electron into an executable installer.
3.  The final installer/application will be located in the `/release` directory (which is created outside the project folder).

## 6. Leave Policy & Holiday Management

The leave module centralizes all holiday rules, quotas, and ledger actions so employees, reports, and payroll share one source of truth.

### 6.1. Admin configuration

- The **"חגים וימי חופשה"** screen under Settings edits the `leave_policy` JSON described in Section 3.5.
- Toggles use the following Hebrew microcopy: "אישור חצי יום", "היתרה יכולה לרדת למינוס", "כמות חריגה מימי החופש המוגדרים", "העברת יתרה לשנה הבאה", and "מקסימום להעברה".
- Holiday rows capture a name, date range, and tag selected from:
  - `system_paid` → "חופשה בתשלום (על חשבון המערכת)" (no deduction; payroll marks the day as system funded).
  - `employee_paid` → "חופשה בתשלום" (deducts from the employee quota).
  - `unpaid` → "חופשה ללא תשלום".
  - `mixed` → "מעורב".
  - `half_day` → "חצי יום חופשה" (available only when half-day usage is enabled).
- All persistence is routed through the secure API, which performs Supabase `upsert` calls on the `Settings` table to avoid duplicate keys.

### 6.2. Employee quota and proration

- Each employee now has an `annual_leave_days` value. The helper `computeEmployeeLeaveSummary` prorates the yearly allowance based on `start_date` and the number of days remaining in the calendar year.
- Carry-over is applied automatically when enabled, capped by `carryover_max_days`.
- Summary data includes `quota`, `used`, `carryIn`, `remaining`, and `adjustments` for consistent display across dashboards.

### 6.3. Recording usage

- The Leave tab now provides a read-only balance overview with collapsible drill-down rows. Detailed entries are viewed in-place,
  while all new allocations or usage adjustments must be captured through the dedicated Time Entry workflow.
- Within the Time Entry form the "על חשבון המערכת" switch is the sole way to mark system-paid holidays; the leave dropdowns now
  present only "חופשה בתשלום", "חופשה ללא תשלום", and "חצי יום חופשה" labels for clarity.
- Usage inserts a negative `balance` into `LeaveBalances` with a `leave_type` like `usage_employee_paid` or `time_entry_leave_employee_paid`. Allocations insert a positive `balance` with `leave_type='allocation'`.
- When `allow_half_day` is false the UI blocks non-integer deductions. When enabled, half-day holidays auto-fill `-0.5`.
- Negative balances are blocked once the projected balance would drop below `negative_floor_days`; the blocking toast reads **"חריגה ממכסה ימי החופשה המותרים"**.
- `holiday_paid_system` days update payroll tables without inserting a negative ledger entry so paid holidays stay aligned with WorkSessions totals.

### 6.4. Shared selectors

- `selectHolidayForDate(policy, date)` resolves the correct holiday rule for disabling date pickers and tagging payroll rows.
- `selectLeaveRemaining(employeeId, date, context)` calls into `computeEmployeeLeaveSummary` and must be used by Employees, Reports, and Payroll so all surfaces show identical balances.
- The same helpers power unit tests in `test/leave.test.js` to protect proration math and negative-floor enforcement.

---

## 7. Developer Guidelines

- **Golden Rule – Secure API Only:** Frontend code **must never** call `dataClient.insert()`, `dataClient.update()`, or any other direct write helpers against a tenant Supabase project. All create, update, and delete flows must call the appropriate client helper in `src/api/`, which forwards the request to a secure Azure Function endpoint (`/api/...`) that handles authentication, authorization, and tenant key decryption on the server side.

## Recent Updates

- Multi-date leave entry now mirrors the single-day form, supporting all leave types, half-day second-half options, and delegating validation/saving to the unified `useTimeEntry` hook.
- Centralized leave policy management via the new Settings screen, including holiday tagging and negative balance controls.
- Employee leave balances now rely on the `LeaveBalances` ledger with annual quota proration and carry-over enforcement.
- Payroll and reports consume the shared leave selectors so paid holidays and remaining days stay aligned across the app.
- Reports expose an Employment Scope filter and optional column that only render when the `employment_scope_policy` enables the active employee types.
- Date filters in reports accept manual input or calendar selection and support multiple formats.
- Hours KPI counts time for hourly employees only; employee type filter now includes global staff.
- Detailed entries report can group by employee type with subtotals.
- Global payroll aggregation now sums `total_payment` snapshots per employee-day to prevent double-paying segmented workdays.
- Monthly Report totals now track a dedicated “תשלום חופשה” (Leave Pay) column, populated from the per-employee leave payment accumulator.
- Recent Activity dashboard panel now uses the shared `getActivityDisplayDetails` helper to map work session `entry_type` values to accurate Hebrew labels for leave, adjustments, and instructor services, and now differentiates badge variants: outline tags for work/session activity tinted by teal or the service color, and solid blue/purple tags for leave and adjustments.

## 8. UX Review – Unified Time Entry

- Align layout affordances between the single-day form and multi-date modal (shared section headings, button ordering, and field grouping) so administrators immediately recognize the same workflow regardless of entry surface.
- Add inline explanations when a global segment resolves to ₪0 (e.g., tooltip or helper text near the total) to clarify that the day already received its full payment from another segment or paid leave.
- Surface a consolidated mixed-day summary that shows remaining payable portion after leave selection in both flows, reducing guesswork before saving combined leave/work scenarios.
- Improve the multi-date checklist to call out incomplete rows and provide quick navigation, lowering the effort required to review large batches before submission.
- Show post-save feedback that distinguishes successes from skips/zero-pay rows to avoid confusion when large batches include unpaid segments.

## 9. Reports CSV Export

### 8.1 Detailed Entries CSV Schema (Desktop Export)

The Reports page now builds CSV files through a dedicated transformation pipeline that resolves employees, services, employment scope labels, and leave metadata before serializing the output with a UTF-8 BOM for Excel compatibility. Rows are sorted by work date (oldest first) so administrators can review the period chronologically offline.

| Column Header (Hebrew) | Source Fields | Content Rules |
| :--- | :--- | :--- |
| שם העובד | `WorkSession.employee_id` → `Employee.name` | Falls back to "לא ידוע" when the employee record is missing. |
| מספר עובד | `Employee.employee_id` | Blank when the internal identifier is not defined. |
| סוג עובד | `Employee.employee_type` | Mapped with `EMPLOYEE_TYPE_LABELS` ("שעתי", "גלובלי", "מדריך"); blank if the type is unknown. |
| היקף משרה | `Employee` employment scope helpers | Uses `getEmploymentScopeValue` + `getEmploymentScopeLabel`; blank when scope is disabled or unset. |
| תאריך | `WorkSession.date` | Formatted as `DD/MM/YYYY` using `date-fns`. |
| יום בשבוע | `WorkSession.date` | Formatted with the Hebrew locale (e.g., "יום שני"). |
| סוג רישום | `WorkSession.entry_type` | Leave types map via `HOLIDAY_TYPE_LABELS`; other types use localized labels (hours, sessions, adjustments) with "רישום אחר" as the fallback. |
| תיאור / שירות | `WorkSession.entry_type`, `service_id` | Leave rows reuse the leave label, session rows show the resolved service name ("שירות לא ידוע" fallback), all other types display "עבודה שעתית". |
| שעות | `WorkSession.hours` | Rendered only for hourly/global entries with `entry_type === 'hours'`; numeric values preserve whole numbers or 2 decimals. |
| מספר מפגשים | `WorkSession.sessions_count` | Populated only when `entry_type === 'session'`. |
| מספר תלמידים | `WorkSession.students_count` | Populated only for session rows. |
| תעריף | `WorkSession.rate_used` | Serialized with two decimals when numeric; otherwise blank. |
| סה"כ לתשלום | `WorkSession.total_payment` | Serialized with two decimals when numeric; otherwise blank. |
| הערות | `WorkSession.notes` | Free-text note, blank when absent. |

