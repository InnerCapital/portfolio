-- Accumulated findings pushed from measurement, so the Ideas Bank builds on
-- prior analysis instead of siloed one-off pushes.
ALTER TABLE "Profile" ADD COLUMN "insightsContext" TEXT NOT NULL DEFAULT '';
