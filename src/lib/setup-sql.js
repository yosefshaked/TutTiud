export const SETUP_SQL_SCRIPT = `
-- IMPORTANT: Replace 'YOUR_SUPER_SECRET_AND_LONG_JWT_SECRET_HERE' with your actual JWT secret from Supabase Project Settings -> API -> JWT Settings.
CREATE EXTENSION IF NOT EXISTS pgjwt WITH SCHEMA extensions;

-- שלב 1: יצירת סכימה מלאה ו-אובייקט עזר לאימות
set search_path = public, extensions;

create extension if not exists "pgcrypto";

create table if not exists public."Employees" (
  "id" uuid not null default gen_random_uuid(),
  "name" text not null,
  "employee_id" text not null,
  "employee_type" text,
  "current_rate" numeric,
  "phone" text,
  "email" text,
  "start_date" date,
  "is_active" boolean default true,
  "notes" text,
  "working_days" jsonb,
  "annual_leave_days" numeric default 12,
  "leave_pay_method" text,
  "leave_fixed_day_rate" numeric,
  "metadata" jsonb,
  constraint "Employees_pkey" primary key ("id")
);

ALTER TABLE "public"."Employees"
ADD COLUMN IF NOT EXISTS "employment_scope" TEXT;

create table if not exists public."Services" (
  "id" uuid not null default gen_random_uuid(),
  "name" text not null,
  "duration_minutes" bigint,
  "payment_model" text,
  "color" text,
  "metadata" jsonb,
  constraint "Services_pkey" primary key ("id")
);

-- Ensure the generic, non-deletable service for general rates exists.
INSERT INTO "public"."Services" ("id", "name", "duration_minutes", "payment_model", "color", "metadata")
VALUES ('00000000-0000-0000-0000-000000000000', 'תעריף כללי *לא למחוק או לשנות*', null, 'fixed_rate', '#84CC16', null)
ON CONFLICT (id) DO NOTHING;

create table if not exists public."RateHistory" (
  "id" uuid not null default gen_random_uuid(),
  "rate" numeric not null,
  "effective_date" date not null,
  "notes" text,
  "employee_id" uuid not null default gen_random_uuid(),
  "service_id" uuid default gen_random_uuid(),
  "metadata" jsonb,
  constraint "RateHistory_pkey" primary key ("id"),
  constraint "RateHistory_employee_id_fkey" foreign key ("employee_id") references public."Employees"("id"),
  constraint "RateHistory_service_id_fkey" foreign key ("service_id") references public."Services"("id")
);

-- Add the unique constraint that prevents duplicate rate history rows per employee/service/effective date
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RateHistory_employee_service_effective_date_key'
  ) THEN
    ALTER TABLE public."RateHistory"
      ADD CONSTRAINT "RateHistory_employee_service_effective_date_key"
      UNIQUE (employee_id, service_id, effective_date);
  END IF;
END;
$$;

create table if not exists public."WorkSessions" (
  "id" uuid not null default gen_random_uuid(),
  "employee_id" uuid not null default gen_random_uuid(),
  "service_id" uuid default gen_random_uuid(),
  "date" date not null,
  "session_type" text,
  "hours" numeric,
  "sessions_count" bigint,
  "students_count" bigint,
  "rate_used" numeric,
  "total_payment" numeric,
  "notes" text,
  "created_at" timestamptz default now(),
  "entry_type" text not null default 'hours',
  "payable" boolean,
  "metadata" jsonb,
  "deleted" boolean not null default false,
  "deleted_at" timestamptz,
  constraint "WorkSessions_pkey" primary key ("id"),
  constraint "WorkSessions_employee_id_fkey" foreign key ("employee_id") references public."Employees"("id"),
  constraint "WorkSessions_service_id_fkey" foreign key ("service_id") references public."Services"("id")
);

create table if not exists public."LeaveBalances" (
  "id" bigint generated always as identity primary key,
  "created_at" timestamptz not null default now(),
  "employee_id" uuid not null default gen_random_uuid(),
  "leave_type" text not null,
  "balance" numeric not null default 0,
  "effective_date" date not null,
  "notes" text,
  "metadata" jsonb,
  constraint "LeaveBalances_employee_id_fkey" foreign key ("employee_id") references public."Employees"("id")
);

-- Add the foreign key link from LeaveBalances to WorkSessions
ALTER TABLE public."LeaveBalances"
ADD COLUMN IF NOT EXISTS work_session_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'LeaveBalances_work_session_id_fkey'
  ) THEN
    ALTER TABLE public."LeaveBalances"
      ADD CONSTRAINT "LeaveBalances_work_session_id_fkey"
      FOREIGN KEY (work_session_id) REFERENCES public."WorkSessions"(id) ON DELETE SET NULL;
  END IF;
END;
$$;

create table if not exists public."Settings" (
  "id" uuid not null default gen_random_uuid(),
  "created_at" timestamptz not null default now(),
  "settings_value" jsonb not null,
  "updated_at" timestamptz default now(),
  "key" text not null unique,
  "metadata" jsonb,
  constraint "Settings_pkey" primary key ("id")
);

create index if not exists "RateHistory_employee_service_idx" on public."RateHistory" ("employee_id", "service_id", "effective_date");
create index if not exists "LeaveBalances_employee_date_idx" on public."LeaveBalances" ("employee_id", "effective_date");
create index if not exists "WorkSessions_employee_date_idx" on public."WorkSessions" ("employee_id", "date");
create index if not exists "WorkSessions_service_idx" on public."WorkSessions" ("service_id");
create index if not exists "WorkSessions_deleted_idx" on public."WorkSessions" ("deleted") where "deleted" = true;

-- שלב 2: הפעלת RLS והוספת מדיניות מאובטחת
ALTER TABLE public."Employees" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated select Employees" ON public."Employees";
CREATE POLICY "Authenticated select Employees" ON public."Employees"
  FOR SELECT TO authenticated, app_user
  USING (true);

DROP POLICY IF EXISTS "Authenticated insert Employees" ON public."Employees";
CREATE POLICY "Authenticated insert Employees" ON public."Employees"
  FOR INSERT TO authenticated, app_user
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update Employees" ON public."Employees";
CREATE POLICY "Authenticated update Employees" ON public."Employees"
  FOR UPDATE TO authenticated, app_user
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated delete Employees" ON public."Employees";
CREATE POLICY "Authenticated delete Employees" ON public."Employees"
  FOR DELETE TO authenticated, app_user
  USING (true);

ALTER TABLE public."WorkSessions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated select WorkSessions" ON public."WorkSessions";
CREATE POLICY "Authenticated select WorkSessions" ON public."WorkSessions"
  FOR SELECT TO authenticated, app_user
  USING (true);

DROP POLICY IF EXISTS "Authenticated insert WorkSessions" ON public."WorkSessions";
CREATE POLICY "Authenticated insert WorkSessions" ON public."WorkSessions"
  FOR INSERT TO authenticated, app_user
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update WorkSessions" ON public."WorkSessions";
CREATE POLICY "Authenticated update WorkSessions" ON public."WorkSessions"
  FOR UPDATE TO authenticated, app_user
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated delete WorkSessions" ON public."WorkSessions";
CREATE POLICY "Authenticated delete WorkSessions" ON public."WorkSessions"
  FOR DELETE TO authenticated, app_user
  USING (true);

ALTER TABLE public."LeaveBalances" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated select LeaveBalances" ON public."LeaveBalances";
CREATE POLICY "Authenticated select LeaveBalances" ON public."LeaveBalances"
  FOR SELECT TO authenticated, app_user
  USING (true);

DROP POLICY IF EXISTS "Authenticated insert LeaveBalances" ON public."LeaveBalances";
CREATE POLICY "Authenticated insert LeaveBalances" ON public."LeaveBalances"
  FOR INSERT TO authenticated, app_user
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update LeaveBalances" ON public."LeaveBalances";
CREATE POLICY "Authenticated update LeaveBalances" ON public."LeaveBalances"
  FOR UPDATE TO authenticated, app_user
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated delete LeaveBalances" ON public."LeaveBalances";
CREATE POLICY "Authenticated delete LeaveBalances" ON public."LeaveBalances"
  FOR DELETE TO authenticated, app_user
  USING (true);

ALTER TABLE public."RateHistory" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated select RateHistory" ON public."RateHistory";
CREATE POLICY "Authenticated select RateHistory" ON public."RateHistory"
  FOR SELECT TO authenticated, app_user
  USING (true);

DROP POLICY IF EXISTS "Authenticated insert RateHistory" ON public."RateHistory";
CREATE POLICY "Authenticated insert RateHistory" ON public."RateHistory"
  FOR INSERT TO authenticated, app_user
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update RateHistory" ON public."RateHistory";
CREATE POLICY "Authenticated update RateHistory" ON public."RateHistory"
  FOR UPDATE TO authenticated, app_user
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated delete RateHistory" ON public."RateHistory";
CREATE POLICY "Authenticated delete RateHistory" ON public."RateHistory"
  FOR DELETE TO authenticated, app_user
  USING (true);

ALTER TABLE public."Services" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated select Services" ON public."Services";
CREATE POLICY "Authenticated select Services" ON public."Services"
  FOR SELECT TO authenticated, app_user
  USING (true);

DROP POLICY IF EXISTS "Authenticated insert Services" ON public."Services";
CREATE POLICY "Authenticated insert Services" ON public."Services"
  FOR INSERT TO authenticated, app_user
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update Services" ON public."Services";
CREATE POLICY "Authenticated update Services" ON public."Services"
  FOR UPDATE TO authenticated, app_user
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated delete Services" ON public."Services";
CREATE POLICY "Authenticated delete Services" ON public."Services"
  FOR DELETE TO authenticated, app_user
  USING (true);

ALTER TABLE public."Settings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated select Settings" ON public."Settings";
CREATE POLICY "Authenticated select Settings" ON public."Settings"
  FOR SELECT TO authenticated, app_user
  USING (true);

DROP POLICY IF EXISTS "Authenticated insert Settings" ON public."Settings";
CREATE POLICY "Authenticated insert Settings" ON public."Settings"
  FOR INSERT TO authenticated, app_user
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update Settings" ON public."Settings";
CREATE POLICY "Authenticated update Settings" ON public."Settings"
  FOR UPDATE TO authenticated, app_user
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated delete Settings" ON public."Settings";
CREATE POLICY "Authenticated delete Settings" ON public."Settings"
  FOR DELETE TO authenticated, app_user
  USING (true);

-- שלב 3: יצירת תפקיד מאובטח ומוגבל הרשאות עבור האפליקציה
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
-- Allow the anonymous and postgres roles to impersonate the app_user role.
GRANT app_user TO postgres, anon;

-- שלב 4: יצירת מפתח גישה ייעודי (JWT) עבור התפקיד החדש
-- IMPORTANT: This script assumes you have a JWT secret configured in your Supabase project's settings.
-- You can find this under Project Settings -> API -> JWT Settings -> JWT Secret.
-- We are using a placeholder here. In a real scenario, the secret should be managed securely.
-- For the purpose of this script, we will use the function correctly,
-- but acknowledge the secret needs to be known.

SELECT extensions.sign(
  json_build_object(
    'role', 'app_user',
    'exp', (EXTRACT(epoch FROM (NOW() + INTERVAL '1 year')))::integer,
    'iat', (EXTRACT(epoch FROM NOW()))::integer
  ),
  'YOUR_SUPER_SECRET_AND_LONG_JWT_SECRET_HERE' -- This needs to be replaced by the user with their actual JWT secret.
) AS "APP_DEDICATED_KEY (COPY THIS BACK TO THE APP)";

-- פונקציה אבחונית לבדיקת סטטוס ההתקנה
create or replace function public.setup_assistant_diagnostics()
returns table (
  table_name text,
  has_table boolean,
  rls_enabled boolean,
  missing_policies text[],
  delta_sql text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  required_tables constant text[] := array['Employees', 'WorkSessions', 'LeaveBalances', 'RateHistory', 'Services', 'Settings'];
  required_policy_names text[];
  required_commands constant text[] := array['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  table_reg regclass;
  existing_policies text[];
  idx integer;
  required_role constant text := 'app_user';
  required_role_members constant text[] := array['postgres', 'anon'];
  required_default_service_id constant uuid := '00000000-0000-0000-0000-000000000000';
  required_default_service_insert text;
  required_rate_history_constraint constant text := 'RateHistory_employee_service_effective_date_key';
  required_rate_history_constraint_sql text;
  role_oid oid;
  role_exists boolean;
  missing_role_grants text[];
  default_service_exists boolean;
  services_table_exists boolean;
  rate_history_table_exists boolean;
  rate_history_constraint_exists boolean;
begin
  required_default_service_insert := 'INSERT INTO "public"."Services" ("id", "name", "duration_minutes", "payment_model", "color", "metadata") VALUES (''00000000-0000-0000-0000-000000000000'', ''תעריף כללי *לא למחוק או לשנות*'', null, ''fixed_rate'', ''#84CC16'', null);';
  required_rate_history_constraint_sql := 'ALTER TABLE public."RateHistory"\n  ADD CONSTRAINT "RateHistory_employee_service_effective_date_key"\n  UNIQUE (employee_id, service_id, effective_date);';
  foreach table_name in array required_tables loop
    required_policy_names := array[
      format('Authenticated select %s', table_name),
      format('Authenticated insert %s', table_name),
      format('Authenticated update %s', table_name),
      format('Authenticated delete %s', table_name)
    ];

    table_reg := to_regclass(format('public.%I', table_name));
    has_table := table_reg is not null;
    rls_enabled := false;
    missing_policies := array[]::text[];
    delta_sql := '';

    if not has_table then
      missing_policies := required_policy_names;
      delta_sql := format('-- הטבלה "%s" חסרה. הרץ את בלוק הסכימה המלא.', table_name);
      return next;
      continue;
    end if;

    select coalesce(c.relrowsecurity, false)
      into rls_enabled
    from pg_class c
    where c.oid = table_reg;

    select coalesce(array_agg(policyname order by policyname), array[]::text[])
      into existing_policies
    from pg_policies
    where schemaname = 'public'
      and lower(tablename) = lower(table_name);

    missing_policies := array(
      select policy_name
      from unnest(required_policy_names) as policy_name
      where not (policy_name = any(existing_policies))
    );

    if not rls_enabled then
      delta_sql := delta_sql || format('ALTER TABLE public."%s" ENABLE ROW LEVEL SECURITY;', table_name) || E'\n';
    end if;

    if array_length(missing_policies, 1) is null then
      missing_policies := array[]::text[];
    else
      for idx in 1..array_length(required_policy_names, 1) loop
        if array_position(missing_policies, required_policy_names[idx]) is not null then
          if required_commands[idx] = 'SELECT' then
            delta_sql := delta_sql || format(
              'DROP POLICY IF EXISTS "%s" ON public."%s";%sCREATE POLICY "%s" ON public."%s"%s  FOR SELECT TO authenticated, app_user%s  USING (true);%s',
              required_policy_names[idx],
              table_name,
              E'\n',
              required_policy_names[idx],
              table_name,
              E'\n',
              E'\n',
              E'\n'
            );
          elsif required_commands[idx] = 'INSERT' then
            delta_sql := delta_sql || format(
              'DROP POLICY IF EXISTS "%s" ON public."%s";%sCREATE POLICY "%s" ON public."%s"%s  FOR INSERT TO authenticated, app_user%s  WITH CHECK (true);%s',
              required_policy_names[idx],
              table_name,
              E'\n',
              required_policy_names[idx],
              table_name,
              E'\n',
              E'\n',
              E'\n'
            );
          elsif required_commands[idx] = 'UPDATE' then
            delta_sql := delta_sql || format(
              'DROP POLICY IF EXISTS "%s" ON public."%s";%sCREATE POLICY "%s" ON public."%s"%s  FOR UPDATE TO authenticated, app_user%s  USING (true)%s  WITH CHECK (true);%s',
              required_policy_names[idx],
              table_name,
              E'\n',
              required_policy_names[idx],
              table_name,
              E'\n',
              E'\n',
              E'\n',
              E'\n'
            );
          elsif required_commands[idx] = 'DELETE' then
            delta_sql := delta_sql || format(
              'DROP POLICY IF EXISTS "%s" ON public."%s";%sCREATE POLICY "%s" ON public."%s"%s  FOR DELETE TO authenticated, app_user%s  USING (true);%s',
              required_policy_names[idx],
              table_name,
              E'\n',
              required_policy_names[idx],
              table_name,
              E'\n',
              E'\n',
              E'\n'
            );
          end if;
        end if;
      end loop;
    end if;
    if delta_sql = '' then
      delta_sql := null;
    end if;

    return next;
  end loop;

  table_name := 'rate_history_unique_constraint';
  has_table := false;
  rls_enabled := false;
  missing_policies := array[]::text[];
  delta_sql := '';
  rate_history_constraint_exists := false;

  table_reg := to_regclass('public.RateHistory');
  rate_history_table_exists := table_reg is not null;

  if not rate_history_table_exists then
    missing_policies := array['-- הטבלה "RateHistory" חסרה. הרץ את בלוק הסכימה המלא.'];
    delta_sql := null;
    return next;
  end if;

  select exists(
    select 1
    from pg_constraint
    where conname = required_rate_history_constraint
      and conrelid = table_reg
  )
    into rate_history_constraint_exists;

  has_table := rate_history_constraint_exists;
  rls_enabled := rate_history_constraint_exists;

  if not rate_history_constraint_exists then
    missing_policies := array[required_rate_history_constraint_sql];
    delta_sql := required_rate_history_constraint_sql;
  else
    missing_policies := array[]::text[];
    delta_sql := null;
  end if;

  return next;

  table_name := 'services_default_rate_seed';
  has_table := false;
  rls_enabled := false;
  missing_policies := array[]::text[];
  delta_sql := '';
  default_service_exists := false;

  table_reg := to_regclass('public.Services');
  services_table_exists := table_reg is not null;

  if not services_table_exists then
    missing_policies := array['-- הטבלה "Services" חסרה. הרץ את בלוק הסכימה המלא.'];
    delta_sql := null;
    return next;
  end if;

  select exists(
    select 1
    from public."Services"
    where id = required_default_service_id
  )
    into default_service_exists;

  has_table := default_service_exists;
  rls_enabled := default_service_exists;

  if not default_service_exists then
    missing_policies := array[required_default_service_insert];
    delta_sql := required_default_service_insert;
  else
    missing_policies := array[]::text[];
    delta_sql := null;
  end if;

  return next;

  table_name := 'app_user_role_grants';
  has_table := false;
  rls_enabled := false;
  missing_policies := array[]::text[];
  delta_sql := '';
  missing_role_grants := array[]::text[];

  select oid
    into role_oid
  from pg_roles
  where rolname = required_role;

  role_exists := role_oid is not null;
  has_table := role_exists;

  if not role_exists then
    missing_policies := array['CREATE ROLE app_user'];
    delta_sql := 'CREATE ROLE app_user;';
    missing_role_grants := required_role_members;
  else
    select array(
      select member_name
      from unnest(required_role_members) as member_name
      where not exists (
        select 1
        from pg_auth_members am
        join pg_roles member_role on member_role.oid = am.member
        where am.roleid = role_oid
          and member_role.rolname = member_name
      )
    )
      into missing_role_grants;

    if missing_role_grants is null then
      missing_role_grants := array[]::text[];
    end if;
  end if;

  if array_length(missing_role_grants, 1) is not null then
    missing_policies := missing_policies || array(
      select format('GRANT app_user TO %s', member_name)
      from unnest(missing_role_grants) as member_name
    );

    if delta_sql <> '' then
      delta_sql := delta_sql || E'\n';
    end if;

    delta_sql := delta_sql || format('GRANT app_user TO %s;', array_to_string(missing_role_grants, ', '));
  end if;

  if array_length(missing_policies, 1) is null then
    missing_policies := array[]::text[];
  end if;

  if delta_sql = '' then
    delta_sql := null;
  end if;

  rls_enabled := role_exists and array_length(missing_role_grants, 1) is null;

  return next;

  return;
end;
$$;

grant execute on function public.setup_assistant_diagnostics() to authenticated;
`;
