-- Add durable email delivery metadata and private tenant file records.
ALTER TABLE "trial_requests"
  ADD COLUMN "verificationEmailId" TEXT,
  ADD COLUMN "verificationEmailSentAt" TIMESTAMP(3),
  ADD COLUMN "activationEmailId" TEXT,
  ADD COLUMN "activationEmailSentAt" TIMESTAMP(3);

ALTER TABLE "users" ADD COLUMN "mfaLastUsedStep" BIGINT;

CREATE TYPE "StoredFileStatus" AS ENUM ('PENDING', 'READY');

CREATE TABLE "stored_files" (
  "id" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "uploadedByUserId" UUID NOT NULL,
  "objectKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" VARCHAR(127) NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "status" "StoredFileStatus" NOT NULL DEFAULT 'PENDING',
  "etag" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stored_files_objectKey_key" ON "stored_files"("objectKey");
CREATE INDEX "stored_files_organisationId_status_createdAt_idx" ON "stored_files"("organisationId", "status", "createdAt");
CREATE INDEX "stored_files_uploadedByUserId_createdAt_idx" ON "stored_files"("uploadedByUserId", "createdAt");

ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.stored_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stored_files FORCE ROW LEVEL SECURITY;
CREATE POLICY stored_files_tenant_isolation ON public.stored_files
  USING ("organisationId" = nullif(current_setting('app.current_organisation_id', true), '')::uuid)
  WITH CHECK ("organisationId" = nullif(current_setting('app.current_organisation_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.stored_files FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.stored_files FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nex4_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.stored_files TO nex4_app;
  END IF;
END $$;
