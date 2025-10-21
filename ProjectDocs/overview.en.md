# TutTiud – Project Overview

TutTiud is a multi-tenant SaaS platform built for health and wellbeing organizations. The application documents guided meetings and therapy sessions while ensuring data isolation per tenant.

## Current Milestone

- React + Vite application scaffold with Tailwind CSS and shadcn/ui baseline.
- Supabase client initialised with environment-based configuration.
- RTL-first user interface with Hebrew copy for the onboarding journey.
- Authentication and organization context providers prepared for future integration with the Control DB.
- Routing guards enforcing authentication and organization selection before accessing protected screens.
- Interactive Setup Wizard page that loads organization metadata, presents a guided Step 1 with the canonical Tuttiud SQL setup script (v2.1) and schema exposure instructions, collects the generated `APP_DEDICATED_KEY` in Step 2, requires a user-triggered RPC check in Step 3, and then continues with automated schema and diagnostics steps.
- Organization selector now inspects `org_settings.metadata.connections.tuttiud` to route users either back to their intended screen or into the Setup Wizard, and the wizard marks the connection as `"connected"` when all checks succeed.

## Next Steps (High-level)

1. Implement secure API layer for privileged Supabase operations.
2. Connect Control DB schemas once available and map membership queries accordingly.
3. Extend the Setup Wizard with progress persistence, role-based enforcement, and backend orchestration.
4. Expand module structure (Students, Session Summaries, Auditing, etc.).
5. Add automated testing (unit + e2e) and CI workflows.
