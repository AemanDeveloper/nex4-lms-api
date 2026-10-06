-- Nex4LMS Learning Core: invitations, classes, progress, submissions and quizzes.
-- This migration is additive and backfills existing tenants into a General Class.

CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'GRADED', 'RETURNED');
CREATE TYPE "QuizQuestionType" AS ENUM ('MCQ', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY', 'FILE_RESPONSE');
CREATE TYPE "QuizScorePolicy" AS ENUM ('HIGHEST', 'LATEST');
CREATE TYPE "QuizAttemptStatus" AS ENUM ('IN_PROGRESS', 'PENDING_REVIEW', 'GRADED');

ALTER TABLE "lessons"
  ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "availableFrom" TIMESTAMP(3);

ALTER TABLE "assignments"
  ADD COLUMN "instructions" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "allowLateSubmissions" BOOLEAN NOT NULL DEFAULT false;

-- Existing learning content remains usable after class-first access is enabled.
UPDATE "lessons" SET "published" = true;

CREATE TABLE "invitations" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "role" "MembershipRole" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "invitedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "classes" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "branchId" UUID,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "academicYear" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "class_teachers" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "classId" UUID NOT NULL,
  "teacherMembershipId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "class_teachers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "class_students" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "classId" UUID NOT NULL,
  "studentMembershipId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "class_students_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_classes" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "courseId" UUID NOT NULL,
  "classId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_classes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lesson_progress" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "lessonId" UUID NOT NULL,
  "studentMembershipId" UUID NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assignment_submissions" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "assignmentId" UUID NOT NULL,
  "studentMembershipId" UUID NOT NULL,
  "body" TEXT,
  "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3),
  "score" INTEGER,
  "feedback" TEXT,
  "gradedAt" TIMESTAMP(3),
  "gradedByMembershipId" UUID,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "submission_attachments" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "submissionId" UUID NOT NULL,
  "storedFileId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "submission_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quizzes" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "courseId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "instructions" TEXT NOT NULL DEFAULT '',
  "published" BOOLEAN NOT NULL DEFAULT false,
  "availableFrom" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3),
  "attemptsAllowed" INTEGER NOT NULL DEFAULT 1,
  "scorePolicy" "QuizScorePolicy" NOT NULL DEFAULT 'HIGHEST',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quizzes_attempts_allowed_check" CHECK ("attemptsAllowed" BETWEEN 1 AND 5)
);

CREATE TABLE "quiz_questions" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "quizId" UUID NOT NULL,
  "type" "QuizQuestionType" NOT NULL,
  "prompt" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "options" JSONB,
  "correctAnswer" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quiz_questions_points_check" CHECK ("points" > 0)
);

CREATE TABLE "quiz_attempts" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "quizId" UUID NOT NULL,
  "studentMembershipId" UUID NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" "QuizAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "submittedAt" TIMESTAMP(3),
  "score" INTEGER,
  "gradedAt" TIMESTAMP(3),
  "gradedByMembershipId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quiz_attempt_number_check" CHECK ("attemptNumber" BETWEEN 1 AND 5)
);

CREATE TABLE "quiz_answers" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "attemptId" UUID NOT NULL,
  "questionId" UUID NOT NULL,
  "response" JSONB,
  "storedFileId" UUID,
  "awardedPoints" INTEGER,
  "feedback" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quiz_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");
CREATE INDEX "invitations_organisationId_role_createdAt_idx" ON "invitations"("organisationId", "role", "createdAt");
CREATE INDEX "invitations_organisationId_email_idx" ON "invitations"("organisationId", "email");
CREATE UNIQUE INDEX "classes_organisationId_name_key" ON "classes"("organisationId", "name");
CREATE UNIQUE INDEX "classes_organisationId_code_key" ON "classes"("organisationId", "code");
CREATE INDEX "classes_organisationId_branchId_idx" ON "classes"("organisationId", "branchId");
CREATE UNIQUE INDEX "class_teachers_classId_teacherMembershipId_key" ON "class_teachers"("classId", "teacherMembershipId");
CREATE INDEX "class_teachers_organisationId_teacherMembershipId_idx" ON "class_teachers"("organisationId", "teacherMembershipId");
CREATE UNIQUE INDEX "class_students_classId_studentMembershipId_key" ON "class_students"("classId", "studentMembershipId");
CREATE INDEX "class_students_organisationId_studentMembershipId_idx" ON "class_students"("organisationId", "studentMembershipId");
CREATE UNIQUE INDEX "course_classes_courseId_classId_key" ON "course_classes"("courseId", "classId");
CREATE INDEX "course_classes_organisationId_classId_idx" ON "course_classes"("organisationId", "classId");
CREATE UNIQUE INDEX "lesson_progress_lessonId_studentMembershipId_key" ON "lesson_progress"("lessonId", "studentMembershipId");
CREATE INDEX "lesson_progress_organisationId_studentMembershipId_idx" ON "lesson_progress"("organisationId", "studentMembershipId");
CREATE UNIQUE INDEX "assignment_submissions_assignmentId_studentMembershipId_key" ON "assignment_submissions"("assignmentId", "studentMembershipId");
CREATE INDEX "assignment_submissions_organisationId_studentMembershipId_status_idx" ON "assignment_submissions"("organisationId", "studentMembershipId", "status");
CREATE INDEX "assignment_submissions_organisationId_assignmentId_status_idx" ON "assignment_submissions"("organisationId", "assignmentId", "status");
CREATE UNIQUE INDEX "submission_attachments_submissionId_key" ON "submission_attachments"("submissionId");
CREATE UNIQUE INDEX "submission_attachments_storedFileId_key" ON "submission_attachments"("storedFileId");
CREATE INDEX "submission_attachments_organisationId_idx" ON "submission_attachments"("organisationId");
CREATE INDEX "quizzes_organisationId_courseId_published_idx" ON "quizzes"("organisationId", "courseId", "published");
CREATE UNIQUE INDEX "quiz_questions_quizId_position_key" ON "quiz_questions"("quizId", "position");
CREATE INDEX "quiz_questions_organisationId_quizId_idx" ON "quiz_questions"("organisationId", "quizId");
CREATE UNIQUE INDEX "quiz_attempts_quizId_studentMembershipId_attemptNumber_key" ON "quiz_attempts"("quizId", "studentMembershipId", "attemptNumber");
CREATE INDEX "quiz_attempts_organisationId_studentMembershipId_status_idx" ON "quiz_attempts"("organisationId", "studentMembershipId", "status");
CREATE INDEX "quiz_attempts_organisationId_quizId_status_idx" ON "quiz_attempts"("organisationId", "quizId", "status");
CREATE UNIQUE INDEX "quiz_answers_attemptId_questionId_key" ON "quiz_answers"("attemptId", "questionId");
CREATE INDEX "quiz_answers_organisationId_attemptId_idx" ON "quiz_answers"("organisationId", "attemptId");
CREATE INDEX "quiz_answers_storedFileId_idx" ON "quiz_answers"("storedFileId");

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "classes" ADD CONSTRAINT "classes_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "classes" ADD CONSTRAINT "classes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_teacherMembershipId_fkey" FOREIGN KEY ("teacherMembershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_studentMembershipId_fkey" FOREIGN KEY ("studentMembershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_classes" ADD CONSTRAINT "course_classes_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_classes" ADD CONSTRAINT "course_classes_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_classes" ADD CONSTRAINT "course_classes_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_studentMembershipId_fkey" FOREIGN KEY ("studentMembershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_studentMembershipId_fkey" FOREIGN KEY ("studentMembershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_gradedByMembershipId_fkey" FOREIGN KEY ("gradedByMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "assignment_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_studentMembershipId_fkey" FOREIGN KEY ("studentMembershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_gradedByMembershipId_fkey" FOREIGN KEY ("gradedByMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing organisations, courses and memberships under class-first access rules.
INSERT INTO "classes" ("id", "organisationId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), organisation."id", 'General Class', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organisations" organisation
ON CONFLICT ("organisationId", "name") DO NOTHING;

INSERT INTO "course_classes" ("id", "organisationId", "courseId", "classId", "createdAt")
SELECT gen_random_uuid(), course."organisationId", course."id", classroom."id", CURRENT_TIMESTAMP
FROM "courses" course
JOIN "classes" classroom ON classroom."organisationId" = course."organisationId" AND classroom."name" = 'General Class'
ON CONFLICT ("courseId", "classId") DO NOTHING;

INSERT INTO "class_teachers" ("id", "organisationId", "classId", "teacherMembershipId", "createdAt")
SELECT gen_random_uuid(), membership."organisationId", classroom."id", membership."id", CURRENT_TIMESTAMP
FROM "memberships" membership
JOIN "classes" classroom ON classroom."organisationId" = membership."organisationId" AND classroom."name" = 'General Class'
WHERE membership."role" = 'TEACHER'
ON CONFLICT ("classId", "teacherMembershipId") DO NOTHING;

INSERT INTO "class_students" ("id", "organisationId", "classId", "studentMembershipId", "createdAt")
SELECT gen_random_uuid(), membership."organisationId", classroom."id", membership."id", CURRENT_TIMESTAMP
FROM "memberships" membership
JOIN "classes" classroom ON classroom."organisationId" = membership."organisationId" AND classroom."name" = 'General Class'
WHERE membership."role" = 'STUDENT'
ON CONFLICT ("classId", "studentMembershipId") DO NOTHING;

-- All new tables are private to the API role and isolated by the current tenant context.
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_teachers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_students FORCE ROW LEVEL SECURITY;
ALTER TABLE public.course_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_classes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.submission_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_answers FORCE ROW LEVEL SECURITY;

CREATE POLICY invitations_tenant_isolation ON public.invitations USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);
CREATE POLICY classes_tenant_isolation ON public.classes USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);
CREATE POLICY class_teachers_tenant_isolation ON public.class_teachers USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);
CREATE POLICY class_students_tenant_isolation ON public.class_students USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);
CREATE POLICY course_classes_tenant_isolation ON public.course_classes USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);
CREATE POLICY lesson_progress_tenant_isolation ON public.lesson_progress USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);
CREATE POLICY assignment_submissions_tenant_isolation ON public.assignment_submissions USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);
CREATE POLICY submission_attachments_tenant_isolation ON public.submission_attachments USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);
CREATE POLICY quizzes_tenant_isolation ON public.quizzes USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);
CREATE POLICY quiz_questions_tenant_isolation ON public.quiz_questions USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);
CREATE POLICY quiz_attempts_tenant_isolation ON public.quiz_attempts USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);
CREATE POLICY quiz_answers_tenant_isolation ON public.quiz_answers USING ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid) WITH CHECK ("organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.invitations, public.classes, public.class_teachers, public.class_students,
      public.course_classes, public.lesson_progress, public.assignment_submissions,
      public.submission_attachments, public.quizzes, public.quiz_questions,
      public.quiz_attempts, public.quiz_answers FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.invitations, public.classes, public.class_teachers, public.class_students,
      public.course_classes, public.lesson_progress, public.assignment_submissions,
      public.submission_attachments, public.quizzes, public.quiz_questions,
      public.quiz_attempts, public.quiz_answers FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nex4_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations, public.classes,
      public.class_teachers, public.class_students, public.course_classes,
      public.lesson_progress, public.assignment_submissions, public.submission_attachments,
      public.quizzes, public.quiz_questions, public.quiz_attempts, public.quiz_answers TO nex4_app;
  END IF;
END $$;
