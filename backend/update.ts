import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const txns = await prisma.transaction.findMany({
    where: {
      OR: [
        { description: { contains: 'by admin' } },
        { description: { contains: 'approved' } },
        { description: { contains: 'sold by' } }
      ]
    }
  });

  for (const txn of txns) {
    let newDesc = txn.description || '';
    
    // Fix specifics
    newDesc = newDesc.replace('marked sold by admin', 'sold');
    newDesc = newDesc.replace('sold by admin', 'sold');
    newDesc = newDesc.replace('payment approved', 'sold');
    newDesc = newDesc.replace('sold via transfer approval', 'sold');
    newDesc = newDesc.replace('Ready-to-sell order', 'Order');
    
    if (newDesc.includes('approved')) {
      newDesc = newDesc.replace('approved', 'sold');
    }
    if (newDesc.includes('Rejected by admin')) {
      newDesc = newDesc.replace('Rejected by admin', 'Rejected');
    }

    newDesc = newDesc.replace(/\s+/g, ' ').trim();
    
    // Some descriptions might say "Order xyz sold sold" if we double replaced
    newDesc = newDesc.replace('sold sold', 'sold');

    if (newDesc !== txn.description) {
      await prisma.transaction.update({
        where: { id: txn.id },
        data: { description: newDesc }
      });
      console.log(`Updated txn \${txn.id}: \${txn.description} -> \${newDesc}`);
    }
  }

  // Also do notifications just in case!
  const notifs = await prisma.userNotification.findMany({
    where: {
      body: { contains: 'marked sold' }
    }
  });
  
  for (const n of notifs) {
    const newBody = n.body.replace('marked sold.', 'sold.');
    if (newBody !== n.body) {
      await prisma.userNotification.update({
        where: { id: n.id },
        data: { body: newBody }
      });
      console.log(`Updated notif \${n.id}: \${newBody}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
