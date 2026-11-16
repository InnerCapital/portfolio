-- CreateEnum
CREATE TYPE "Pillar" AS ENUM ('A', 'B', 'C');
CREATE TYPE "IdeaStatus" AS ENUM ('SPARK', 'DEVELOPING', 'SCHEDULED', 'POSTED', 'PARKED');
CREATE TYPE "Format" AS ENUM ('LONG_FORM', 'SHORT_FORM', 'CAROUSEL', 'LINKEDIN');

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL DEFAULT '',
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answers" JSONB,
    "context" TEXT NOT NULL DEFAULT '',
    "pillars" JSONB,
    "plan" JSONB,
    "apiToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "picture" TEXT NOT NULL DEFAULT '',
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "creatorId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "sourceComments" TEXT NOT NULL DEFAULT '',
    "ownComments" TEXT NOT NULL DEFAULT '',
    "ownPostRef" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pillar" "Pillar",
    "status" "IdeaStatus" NOT NULL DEFAULT 'SPARK',
    "analysis" JSONB,
    "analysedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Screenshot" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Screenshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Refinement" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "format" "Format" NOT NULL,
    "brief" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Refinement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Creator" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "niche" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "evidence" TEXT NOT NULL DEFAULT '',
    "breakdown" JSONB,
    "analysedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreatorTopic" (
    "creatorId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    CONSTRAINT "CreatorTopic_pkey" PRIMARY KEY ("creatorId","topicId")
);

CREATE TABLE "IdeaTopic" (
    "ideaId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    CONSTRAINT "IdeaTopic_pkey" PRIMARY KEY ("ideaId","topicId")
);

CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "mediaType" TEXT NOT NULL DEFAULT '',
    "permalink" TEXT NOT NULL DEFAULT '',
    "thumbnailUrl" TEXT NOT NULL DEFAULT '',
    "postedAt" TIMESTAMP(3),
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "parentId" TEXT,
    "username" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "postedAt" TIMESTAMP(3),
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdeaPost" (
    "ideaId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'signal',
    CONSTRAINT "IdeaPost_pkey" PRIMARY KEY ("ideaId","postId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_apiToken_key" ON "Profile"("apiToken");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Idea_profileId_createdAt_idx" ON "Idea"("profileId", "createdAt");
CREATE INDEX "Screenshot_ideaId_idx" ON "Screenshot"("ideaId");
CREATE INDEX "Refinement_ideaId_format_idx" ON "Refinement"("ideaId", "format");
CREATE UNIQUE INDEX "Creator_profileId_platform_handle_key" ON "Creator"("profileId", "platform", "handle");
CREATE UNIQUE INDEX "Topic_profileId_name_key" ON "Topic"("profileId", "name");
CREATE UNIQUE INDEX "SocialConnection_platform_accountId_key" ON "SocialConnection"("platform", "accountId");
CREATE INDEX "Post_connectionId_postedAt_idx" ON "Post"("connectionId", "postedAt");
CREATE INDEX "Comment_postId_idx" ON "Comment"("postId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Screenshot" ADD CONSTRAINT "Screenshot_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Refinement" ADD CONSTRAINT "Refinement_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreatorTopic" ADD CONSTRAINT "CreatorTopic_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreatorTopic" ADD CONSTRAINT "CreatorTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdeaTopic" ADD CONSTRAINT "IdeaTopic_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdeaTopic" ADD CONSTRAINT "IdeaTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SocialConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdeaPost" ADD CONSTRAINT "IdeaPost_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdeaPost" ADD CONSTRAINT "IdeaPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
