CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

CREATE TABLE "attendance_sessions" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "classId" UUID NOT NULL,
  "attendanceDate" DATE NOT NULL,
  "notes" TEXT,
  "createdByMembershipId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_records" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "studentMembershipId" UUID NOT NULL,
  "status" "AttendanceStatus" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "timetable_entries" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "classId" UUID NOT NULL,
  "courseId" UUID,
  "title" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "location" TEXT,
  "notes" TEXT,
  "createdByMembershipId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "timetable_entries_time_check" CHECK ("endsAt" > "startsAt")
);

CREATE UNIQUE INDEX "attendance_sessions_classId_attendanceDate_key" ON "attendance_sessions"("classId", "attendanceDate");
CREATE INDEX "attendance_sessions_organisationId_attendanceDate_idx" ON "attendance_sessions"("organisationId", "attendanceDate");
CREATE UNIQUE INDEX "attendance_records_sessionId_studentMembershipId_key" ON "attendance_records"("sessionId", "studentMembershipId");
CREATE INDEX "attendance_records_organisationId_studentMembershipId_status_idx" ON "attendance_records"("organisationId", "studentMembershipId", "status");
CREATE INDEX "timetable_entries_organisationId_startsAt_idx" ON "timetable_entries"("organisationId", "startsAt");
CREATE INDEX "timetable_entries_classId_startsAt_idx" ON "timetable_entries"("classId", "startsAt");

ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentMembershipId_fkey" FOREIGN KEY ("studentMembershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY attendance_sessions_tenant_isolation ON public.attendance_sessions USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);
CREATE POLICY attendance_records_tenant_isolation ON public.attendance_records USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);
CREATE POLICY timetable_entries_tenant_isolation ON public.timetable_entries USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.attendance_sessions, public.attendance_records, public.timetable_entries FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.attendance_sessions, public.attendance_records, public.timetable_entries FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nex4_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_sessions, public.attendance_records, public.timetable_entries TO nex4_app;
  END IF;
END $$;
