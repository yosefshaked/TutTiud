# TutTiud – Project Overview

TutTiud is a multi-tenant SaaS platform built for health and wellbeing organizations. The application documents guided meetings and therapy sessions while ensuring data isolation per tenant.

## Current Milestone

- React + Vite application scaffold with Tailwind CSS and shadcn/ui baseline.
- Supabase client initialised with environment-based configuration.
- RTL-first user interface with Hebrew copy for the onboarding journey.
- Authentication and organization context providers prepared for future integration with the Control DB.
- Routing guards enforcing authentication and organization selection before accessing protected screens.
- Interactive Setup Wizard page that first calls the new `/api/setup-status` Azure Function to detect whether an encrypted TutTiud app key already exists. Returning tenants see a “Verify configuration” path backed by `/api/verify-tuttiud-setup`, while new tenants walk through the Step 0 checklist (schema exposure, canonical SQL script v2.2, copying the generated `APP_DEDICATED_KEY`) and unlock Step 1 to submit the key to `/api/store-tuttiud-app-key`. If verification fails the checklist collapses to the SQL script only, and Step 2 handles initialization/diagnostics before marking the connection as `"connected"`.
- Organization selector now inspects `org_settings.metadata.connections.tuttiud` to route users either back to their intended screen or into the Setup Wizard, and the wizard marks the connection as `"connected"` when all checks succeed.
- Secure Backend-for-Frontend (Azure Functions) layer authenticating each request, exposing `/api/setup-status`, `/api/verify-tuttiud-setup`, and `/api/store-tuttiud-app-key` for onboarding alongside the instructor/student/backup endpoints, and requiring Function App settings for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_ORG_CREDENTIALS_ENCRYPTION_KEY` to operate safely.
- New authenticated modules in the React client: a “My Students” view with refresh + call-to-action, a guided session-record form that posts to the BFF, an admin backup panel, and an updated landing page highlighting the onboarding flow.

## Next Steps (High-level)

1. Expand role-based experiences (e.g., instructor session history, admin overviews) using the BFF pattern.
2. Connect additional Control DB metadata (profiles, invitations) to enrich organization context.
3. Extend the Setup Wizard with progress persistence, audit logging, and retry scheduling.
4. Implement editing/review flows for existing session records and add student management tools.
5. Add automated testing (unit + e2e) and CI workflows.
