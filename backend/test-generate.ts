import prisma from './src/utils/prisma';
import { generateOrderCode, generateReferenceNo } from './src/utils/helpers';

async function test() {
  try {
    const amount = 100;
    const reward = 4;
    const payeeAccount = '12345';
    const payeeName = 'Tester';
    const ifscCode = 'TEST0001234';
    
    const code = generateOrderCode();
    const refNo = generateReferenceNo();

    console.log('Inserting order with code:', code, 'refNo:', refNo);
    
    // Simulate /admin/orders/generate Prisma call
    const order = await prisma.order.create({
      data: {
        code,
        amount: Number(amount),
        reward: Number(reward),
        incomePercent: ((Number(reward) / Number(amount)) * 100),
        payeeAccount,
        payeeName,
        ifscCode,
        paymentType: 'IMPS',
        payoutWallet: null,
        payoutAccount: null,
        payoutUPI: null,
        referenceNo: refNo,
        expiryMinutes: 30,
        adminUPIAccountId: null,
      },
    });
    
    console.log('Order generated successfully!', order.id);
  } catch (e: any) {
    console.error('Order generation error:', e);
  }

  try {
    const userId = "non-existent-user-id"; // This is likely what is sent for 404
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.log('Payment Order test: User not found (404 expected)');
    } else {
      console.log('User found:', user.id);
    }
  } catch (e: any) {
    console.error('Payment order creation error:', e);
  }
  
  await prisma.$disconnect();
}

test();
