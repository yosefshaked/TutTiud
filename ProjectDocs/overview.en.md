# TutTiud – Project Overview

TutTiud is a multi-tenant SaaS platform built for health and wellbeing organizations. The application documents guided meetings and therapy sessions while ensuring data isolation per tenant.

## Current Milestone

- React + Vite application scaffold with Tailwind CSS and shadcn/ui baseline.
- Supabase client initialised with environment-based configuration.
- RTL-first user interface with Hebrew copy for the onboarding journey.
- Authentication and organization context providers prepared for future integration with the Control DB.
- Routing guards enforcing authentication and organization selection before accessing protected screens.
- Interactive Setup Wizard page that loads organization metadata, walks new tenants through a gated Step 0 checklist (schema exposure, running the canonical Tuttiud SQL setup script v2.1, copying the generated `APP_DEDICATED_KEY`), unlocks Step 1 for secure key submission to the `/api/store-tuttiud-app-key` Azure Function, and only then lets the user trigger Step 2 (validation) before the automated schema/diagnostics checks run.
- Organization selector now inspects `org_settings.metadata.connections.tuttiud` to route users either back to their intended screen or into the Setup Wizard, and the wizard marks the connection as `"connected"` when all checks succeed.
- Secure Backend-for-Frontend (Azure Functions) layer authenticating each request, storing the encrypted TutTiud app key, fetching instructor-specific students, creating session records with server-side authorization, and generating full JSON backups for admins/owners only.
- New authenticated modules in the React client: a “My Students” view with refresh + call-to-action, a guided session-record form that posts to the BFF, an admin backup panel, and an updated landing page highlighting the onboarding flow.

## Next Steps (High-level)

1. Expand role-based experiences (e.g., instructor session history, admin overviews) using the BFF pattern.
2. Connect additional Control DB metadata (profiles, invitations) to enrich organization context.
3. Extend the Setup Wizard with progress persistence, audit logging, and retry scheduling.
4. Implement editing/review flows for existing session records and add student management tools.
5. Add automated testing (unit + e2e) and CI workflows.
