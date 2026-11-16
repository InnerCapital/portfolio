-- Multi-platform self account: extra handles + per-platform follower counts.
ALTER TABLE "Creator" ADD COLUMN "tiktokHandle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Creator" ADD COLUMN "linkedinUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Creator" ADD COLUMN "platformFollowers" JSONB;
