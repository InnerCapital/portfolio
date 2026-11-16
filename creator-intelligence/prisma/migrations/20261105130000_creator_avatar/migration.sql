-- Real Instagram profile picture for the self account (and competitors).
ALTER TABLE "Creator" ADD COLUMN "avatarUrl" TEXT NOT NULL DEFAULT '';
