-- Close the loop: a real scraped post can be the published result of an idea.
ALTER TABLE "ContentPiece" ADD COLUMN "ideaId" TEXT;

CREATE INDEX "ContentPiece_ideaId_idx" ON "ContentPiece"("ideaId");

ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
