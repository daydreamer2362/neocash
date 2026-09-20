/*
  Warnings:

  - A unique constraint covering the columns `[taskNumber]` on the table `Mission` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Mission" ADD COLUMN     "taskNumber" TEXT,
ADD COLUMN     "taskType" TEXT NOT NULL DEFAULT 'daily_tasks',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "adminUPIAccountId" TEXT,
ADD COLUMN     "expiryMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "ifscCode" TEXT,
ADD COLUMN     "payeeAccount" TEXT,
ADD COLUMN     "payeeName" TEXT,
ADD COLUMN     "paymentType" TEXT NOT NULL DEFAULT 'IMPS',
ADD COLUMN     "payoutUPI" TEXT,
ADD COLUMN     "payoutWallet" TEXT,
ADD COLUMN     "referenceNo" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "UserOrder" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "utr" TEXT;

-- CreateTable
CREATE TABLE "AdminUPIAccount" (
    "id" TEXT NOT NULL,
    "loginNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "walletType" TEXT NOT NULL,
    "upiId" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "ifsc" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimit" DECIMAL(65,30) NOT NULL DEFAULT 100000,
    "minAmount" DECIMAL(65,30) NOT NULL DEFAULT 100,
    "maxAmount" DECIMAL(65,30) NOT NULL DEFAULT 100000,
    "totalCollected" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "AdminUPIAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberCode" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "upiId" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "ifsc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "walletType" TEXT,
    "payoutType" TEXT,
    "merchantId" TEXT,
    "remark" TEXT,
    "settlementTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "walletType" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "utr" TEXT,
    "payerUPI" TEXT,
    "payerName" TEXT,
    "payerPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminUPIAccountId" TEXT,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminUPIAccount_isOnline_idx" ON "AdminUPIAccount"("isOnline");

-- CreateIndex
CREATE INDEX "AdminUPIAccount_walletType_idx" ON "AdminUPIAccount"("walletType");

-- CreateIndex
CREATE INDEX "PaymentOrder_userId_idx" ON "PaymentOrder"("userId");

-- CreateIndex
CREATE INDEX "PaymentOrder_status_idx" ON "PaymentOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineOrder_orderNumber_key" ON "OfflineOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "OfflineOrder_status_idx" ON "OfflineOrder"("status");

-- CreateIndex
CREATE INDEX "OfflineOrder_orderNumber_idx" ON "OfflineOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Mission_taskNumber_key" ON "Mission"("taskNumber");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_adminUPIAccountId_fkey" FOREIGN KEY ("adminUPIAccountId") REFERENCES "AdminUPIAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineOrder" ADD CONSTRAINT "OfflineOrder_adminUPIAccountId_fkey" FOREIGN KEY ("adminUPIAccountId") REFERENCES "AdminUPIAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
