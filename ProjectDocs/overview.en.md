# TutTiud – Project Overview

TutTiud is a multi-tenant SaaS platform built for health and wellbeing organizations. The application documents guided meetings and therapy sessions while ensuring data isolation per tenant.

## Current Milestone

- React + Vite application scaffold with Tailwind CSS and shadcn/ui baseline.
- Supabase client initialised with environment-based configuration.
- RTL-first user interface with Hebrew copy for the onboarding journey.
- Authentication and organization context providers prepared for future integration with the Control DB.
- Routing guards enforcing authentication and organization selection before accessing protected screens.

## Next Steps (High-level)

1. Implement secure API layer for privileged Supabase operations.
2. Connect Control DB schemas once available and map membership queries accordingly.
3. Build Setup Wizard flow to onboard organizations.
4. Expand module structure (Students, Session Summaries, Auditing, etc.).
5. Add automated testing (unit + e2e) and CI workflows.
