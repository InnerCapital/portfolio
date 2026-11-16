-- Rich saved-video analysis + recreate recipe on an Idea
ALTER TABLE "Idea"
  ADD COLUMN "videoAnalysis" JSONB,
  ADD COLUMN "videoAnalysedAt" TIMESTAMP(3),
  ADD COLUMN "videoAnalysing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recreation" JSONB,
  ADD COLUMN "recreatedAt" TIMESTAMP(3);
