-- Theme-level benchmarking: capture Maya's Notion Theme, Save rate and
-- Follows-from-post on each imported post so themes can be ranked by real
-- performance. No values are generated.
ALTER TABLE "ContentPiece" ADD COLUMN "theme" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ContentPiece" ADD COLUMN "saveRate" DOUBLE PRECISION;
ALTER TABLE "ContentPiece" ADD COLUMN "follows" INTEGER NOT NULL DEFAULT 0;
