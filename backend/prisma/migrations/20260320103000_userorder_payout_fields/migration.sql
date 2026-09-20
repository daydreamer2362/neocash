/*
  Store user-selected payout wallet/account/UPI on UserOrder.
*/

ALTER TABLE "UserOrder"
ADD COLUMN     "payoutWallet" TEXT,
ADD COLUMN     "payoutAccount" TEXT,
ADD COLUMN     "payoutUPI" TEXT;
