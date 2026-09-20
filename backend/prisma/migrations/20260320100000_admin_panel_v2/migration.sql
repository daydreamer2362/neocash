/*
  Admin panel v2 fields: payoutAccount, voucher verification metadata, notifications, payout UTR.
*/

-- AlterTable: Order
ALTER TABLE "Order"
ADD COLUMN     "payoutAccount" TEXT;

-- AlterTable: UserOrder
ALTER TABLE "UserOrder"
ADD COLUMN     "payerUPI" TEXT,
ADD COLUMN     "payerName" TEXT,
ADD COLUMN     "voucherStatus" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectReason" TEXT;

-- AlterTable: PaymentOrder
ALTER TABLE "PaymentOrder"
ADD COLUMN     "utr" TEXT;

-- CreateTable: UserNotification
CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SYSTEM',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserNotification_userId_idx" ON "UserNotification"("userId");
CREATE INDEX "UserNotification_isRead_idx" ON "UserNotification"("isRead");

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
