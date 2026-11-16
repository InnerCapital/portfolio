-- Capture what a post looks like (thumbnail) and what it says (transcript),
-- so the bank knows the content, not just the numbers.
ALTER TABLE "ContentPiece" ADD COLUMN "thumbnailUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ContentPiece" ADD COLUMN "transcript" TEXT NOT NULL DEFAULT '';
