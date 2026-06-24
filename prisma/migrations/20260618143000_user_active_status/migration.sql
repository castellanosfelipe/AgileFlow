-- Add active/inactive access control for users.
ALTER TABLE "User"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "User_isActive_idx" ON "User"("isActive");
