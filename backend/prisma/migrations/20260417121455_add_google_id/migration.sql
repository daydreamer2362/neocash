/*
  Warnings:

  - A unique constraint covering the columns `[googleId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "isCarousel" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "email" TEXT,
ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "totalUSDTTraded" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SecurityEventLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "ip" TEXT,
    "method" TEXT,
    "path" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SecurityEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "USDTOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "bonus" DECIMAL(65,30) NOT NULL,
    "totalReceive" DECIMAL(65,30) NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Bank-USDT',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "referenceNo" TEXT NOT NULL,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "USDTOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityEventLog_createdAt_idx" ON "SecurityEventLog"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityEventLog_severity_createdAt_idx" ON "SecurityEventLog"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEventLog_resolvedAt_createdAt_idx" ON "SecurityEventLog"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEventLog_type_createdAt_idx" ON "SecurityEventLog"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "USDTOrder_referenceNo_key" ON "USDTOrder"("referenceNo");

-- CreateIndex
CREATE INDEX "USDTOrder_userId_idx" ON "USDTOrder"("userId");

-- CreateIndex
CREATE INDEX "USDTOrder_status_idx" ON "USDTOrder"("status");

-- CreateIndex
CREATE INDEX "USDTOrder_referenceNo_idx" ON "USDTOrder"("referenceNo");

-- CreateIndex
CREATE INDEX "Order_isCarousel_status_idx" ON "Order"("isCarousel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "UserOrder_userId_amount_idx" ON "UserOrder"("userId", "amount");

-- CreateIndex
CREATE INDEX "UserOrder_status_expiresAt_idx" ON "UserOrder"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "USDTOrder" ADD CONSTRAINT "USDTOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
