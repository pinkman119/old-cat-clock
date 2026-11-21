-- CreateTable
CREATE TABLE "ClientRelease" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientRelease_storageName_key" ON "ClientRelease"("storageName");

-- CreateIndex
CREATE INDEX "ClientRelease_platform_createdAt_idx" ON "ClientRelease"("platform", "createdAt");
