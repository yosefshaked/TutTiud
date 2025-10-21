# TutTiud – Agent Notes

- The frontend must only use the Supabase anonymous key and read-only operations. Any privileged access should be proxied through `/api/*` endpoints (to be implemented later).
- Keep RTL and Hebrew support intact. All new UI strings should include Hebrew copy or be easily localisable.
- Respect the module boundaries:
  - `src/lib` – low-level utilities, Supabase client factories, helpers.
  - `src/app` – routing, providers, layout.
  - `src/pages` – screen-level components.
- `src/components` – reusable UI elements.
- Do not import React components inside `src/lib` modules.
- Run `npm run build` and `npx eslint .` before finishing any change.
- **Schema integrity:** When working with tenant data databases, never read from, write to, create, or modify anything in the `public` schema. All TutTiud application logic must operate strictly within the `tuttiud` schema. This rule is mandatory and overrides other considerations.
