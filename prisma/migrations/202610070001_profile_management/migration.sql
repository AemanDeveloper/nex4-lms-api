-- Add user-managed profile details while keeping avatar files private.
ALTER TABLE "users"
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "avatarFileId" UUID,
  ADD COLUMN "defaultOrganisationId" UUID;

CREATE UNIQUE INDEX "users_avatarFileId_key" ON "users"("avatarFileId");
CREATE INDEX "users_defaultOrganisationId_idx" ON "users"("defaultOrganisationId");

ALTER TABLE "users"
  ADD CONSTRAINT "users_avatarFileId_fkey"
  FOREIGN KEY ("avatarFileId") REFERENCES "stored_files"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users"
  ADD CONSTRAINT "users_defaultOrganisationId_fkey"
  FOREIGN KEY ("defaultOrganisationId") REFERENCES "organisations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "users" user_record
SET "defaultOrganisationId" = (
  SELECT "organisationId"
  FROM "memberships" membership
  WHERE "userId" = user_record."id"
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE user_record."defaultOrganisationId" IS NULL;
