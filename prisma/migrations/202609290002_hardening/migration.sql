-- Apply after the generated Prisma migration in every environment.
-- Runtime connections must never use the migration role.

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.reject_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'audit_logs are append-only';
end;
$$;

drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable
before update or delete on public.audit_logs
for each row execute function private.reject_audit_mutation();

alter table public.branches enable row level security;
alter table public.branches force row level security;
alter table public.memberships enable row level security;
alter table public.memberships force row level security;
alter table public.courses enable row level security;
alter table public.courses force row level security;
alter table public.announcements enable row level security;
alter table public.announcements force row level security;
alter table public.lessons enable row level security;
alter table public.lessons force row level security;
alter table public.assignments enable row level security;
alter table public.assignments force row level security;

create policy branches_tenant_isolation on public.branches
  using ("organisationId" = nullif(current_setting('app.current_organisation_id', true), '')::uuid)
  with check ("organisationId" = nullif(current_setting('app.current_organisation_id', true), '')::uuid);
create policy memberships_tenant_isolation on public.memberships
  using ("organisationId" = nullif(current_setting('app.current_organisation_id', true), '')::uuid)
  with check ("organisationId" = nullif(current_setting('app.current_organisation_id', true), '')::uuid);
create policy courses_tenant_isolation on public.courses
  using ("organisationId" = nullif(current_setting('app.current_organisation_id', true), '')::uuid)
  with check ("organisationId" = nullif(current_setting('app.current_organisation_id', true), '')::uuid);
create policy announcements_tenant_isolation on public.announcements
  using ("organisationId" = nullif(current_setting('app.current_organisation_id', true), '')::uuid)
  with check ("organisationId" = nullif(current_setting('app.current_organisation_id', true), '')::uuid);
create policy lessons_tenant_isolation on public.lessons
  using (exists (
    select 1 from public.courses
    where courses.id = lessons."courseId"
      and courses."organisationId" = nullif(current_setting('app.current_organisation_id', true), '')::uuid
  ));
create policy assignments_tenant_isolation on public.assignments
  using (exists (
    select 1 from public.courses
    where courses.id = assignments."courseId"
      and courses."organisationId" = nullif(current_setting('app.current_organisation_id', true), '')::uuid
  ));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
  end if;
end $$;

revoke update, delete, truncate on public.audit_logs from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'nex4_app') then
    grant usage on schema public to nex4_app;
    grant select, insert, update, delete on all tables in schema public to nex4_app;
    grant usage, select on all sequences in schema public to nex4_app;
    revoke update, delete, truncate on public.audit_logs from nex4_app;

    alter default privileges for role nex4_migrator in schema public
      grant select, insert, update, delete on tables to nex4_app;
    alter default privileges for role nex4_migrator in schema public
      grant usage, select on sequences to nex4_app;
  end if;
end $$;
