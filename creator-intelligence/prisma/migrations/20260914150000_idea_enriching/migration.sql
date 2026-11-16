-- Track whether automatic link enrichment (oEmbed + AI research) is running for an idea.
ALTER TABLE "Idea" ADD COLUMN "enriching" BOOLEAN NOT NULL DEFAULT false;
