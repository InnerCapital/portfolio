-- Deep video teardown per post (Route A). Numbers stay on ContentPiece; this
-- table only holds the qualitative/structural read + our six-area scores.
CREATE TABLE "PieceBreakdown" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "hookText" TEXT NOT NULL DEFAULT '',
    "hookType" TEXT NOT NULL DEFAULT '',
    "hookWhy" TEXT NOT NULL DEFAULT '',
    "transcript" TEXT NOT NULL DEFAULT '',
    "structure" JSONB,
    "shots" JSONB,
    "cutCount" INTEGER NOT NULL DEFAULT 0,
    "avgShotSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cutsPerMinute" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "onScreenText" JSONB,
    "durationSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scores" JSONB,
    "scoredAt" TIMESTAMP(3),
    "analysing" BOOLEAN NOT NULL DEFAULT false,
    "analysedAt" TIMESTAMP(3),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PieceBreakdown_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PieceBreakdown_pieceId_key" ON "PieceBreakdown"("pieceId");

ALTER TABLE "PieceBreakdown" ADD CONSTRAINT "PieceBreakdown_pieceId_fkey"
    FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;
