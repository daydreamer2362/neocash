-- CreateTable
CREATE TABLE "HeroCarousel" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'IMAGE',
    "mediaUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "title" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeroCarousel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HeroCarousel_isActive_sortOrder_idx" ON "HeroCarousel"("isActive", "sortOrder");
