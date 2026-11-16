-- Measurement and benchmark engine: real scraped metrics for the main creator
-- and competitors, plus follower-growth snapshots. No generated numbers.

-- AlterTable: the profile owner's own account and competitors are both Creators.
ALTER TABLE "Creator" ADD COLUMN "isSelf" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Creator" ADD COLUMN "followers" INTEGER;
ALTER TABLE "Creator" ADD COLUMN "lastScrapedAt" TIMESTAMP(3);

-- CreateTable: one real post per row, every metric scraped from Apify.
CREATE TABLE "ContentPiece" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "shortcode" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "mediaType" TEXT NOT NULL DEFAULT '',
    "postedAt" TIMESTAMP(3),
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "engagement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "analysis" JSONB,
    "analysedAt" TIMESTAMP(3),
    "commentsScrapedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT '',
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentPiece_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentPiece_creatorId_postedAt_idx" ON "ContentPiece"("creatorId", "postedAt");

-- CreateTable: account totals over time, for real growth and cadence.
CREATE TABLE "CreatorSnapshot" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "following" INTEGER NOT NULL DEFAULT 0,
    "postsCount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT '',
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreatorSnapshot_creatorId_scrapedAt_idx" ON "CreatorSnapshot"("creatorId", "scrapedAt");

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreatorSnapshot" ADD CONSTRAINT "CreatorSnapshot_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
