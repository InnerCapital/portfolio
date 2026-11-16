-- Per-post background read: an honest take and one nuanced suggestion,
-- generated cheaply and cached on the row.
ALTER TABLE "ContentPiece" ADD COLUMN "read" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ContentPiece" ADD COLUMN "suggestion" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ContentPiece" ADD COLUMN "readAt" TIMESTAMP(3);
ALTER TABLE "ContentPiece" ADD COLUMN "reading" BOOLEAN NOT NULL DEFAULT false;
