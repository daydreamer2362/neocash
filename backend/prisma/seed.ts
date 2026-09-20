import { PrismaClient } from '../generated/prisma-client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding NavyPay database...\n');

  const adminPwd = await bcrypt.hash('admin123', 10);
  const userPwd = await bcrypt.hash('user123', 10);
  const pin = await bcrypt.hash('123456', 10);

  // ─── ADMIN USER ─────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { phone: '9999999999' },
    update: {},
    create: {
      phone: '9999999999',
      userName: 'AdminUser',
      password: adminPwd,
      pin,
      referralCode: 'JQGS5E',
      availableBalance: 50000,
      role: 'ADMIN',
      welcomeBonusClaimed: true,
    },
  });
  console.log(`✅ Admin: ${admin.userName} (referral: ${admin.referralCode})`);

  // ─── TEST USER ──────────────────────────────────
  const testUser = await prisma.user.upsert({
    where: { phone: '8888888888' },
    update: {},
    create: {
      phone: '8888888888',
      userName: 'Surya0007',
      password: userPwd,
      pin,
      referralCode: 'SRY007',
      inviterId: admin.id,
      availableBalance: 146.84,
      welcomeBonusClaimed: true,
    },
  });
  console.log(`✅ User: ${testUser.userName} (referral: ${testUser.referralCode})`);

  // Welcome bonus transaction
  await prisma.transaction.upsert({
    where: { id: 'welcome-bonus-test' },
    update: {},
    create: {
      id: 'welcome-bonus-test',
      userId: testUser.id,
      amount: 146.84,
      type: 'WELCOME_BONUS',
      description: 'Welcome bonus ₹146.84',
    },
  });

  // ─── SEED ORDERS (matching screenshots) ─────────
  const orderData = [
    { code: 'Bo5gQm', amount: 100, reward: 4,   incomePercent: 4 },
    { code: 'ackBie', amount: 200, reward: 8,   incomePercent: 4 },
    { code: '7VycSK', amount: 300, reward: 12,  incomePercent: 4 },
    { code: 'FpEjWZ', amount: 500, reward: 20,  incomePercent: 4 },
    { code: 'Kd3mXp', amount: 400, reward: 16,  incomePercent: 4 },
    { code: 'Nm8qYr', amount: 600, reward: 24,  incomePercent: 4 },
    { code: 'Ht5wZs', amount: 800, reward: 40,  incomePercent: 5 },
    { code: 'Jx9pAt', amount: 1000, reward: 50, incomePercent: 5 },
    { code: 'Lq2nBu', amount: 1200, reward: 72, incomePercent: 6 },
    { code: 'Ov6kCv', amount: 1500, reward: 90, incomePercent: 6 },
    { code: 'Pw4jDw', amount: 1850, reward: 111, incomePercent: 6 },
    { code: 'Rz1hEx', amount: 2000, reward: 120, incomePercent: 6 },
  ];

  for (const o of orderData) {
    await prisma.order.upsert({
      where: { code: o.code },
      update: {},
      create: o,
    });
  }
  console.log(`✅ ${orderData.length} orders seeded`);

  // ─── SEED UPI FOR TEST USER ─────────────────────
  await prisma.savedUPI.upsert({
    where: { id: 'seed-upi-1' },
    update: {},
    create: {
      id: 'seed-upi-1',
      userId: testUser.id,
      upiId: 'surya007@paytm',
      holderName: 'Surya Kumar',
      bankName: 'Paytm Payments Bank',
      isDefault: true,
      isVerified: true,
    },
  });
  console.log(`✅ Test UPI seeded`);

  // ─── SEED MISSIONS ─────────────────────────────
  const missions = [
    { title: 'First Order Bonus', description: 'Complete your first order', type: 'FIRST_ORDER', targetValue: 1, rewardValue: 10 },
    { title: 'Daily Login', description: 'Login every day', type: 'DAILY', targetValue: 1, rewardValue: 2 },
    { title: '5 Orders Bonus', description: 'Complete 5 orders', type: 'VOLUME', targetValue: 5, rewardValue: 50 },
  ];

  for (const m of missions) {
    await prisma.mission.upsert({
      where: { id: m.title.replace(/\s/g, '-').toLowerCase() },
      update: {},
      create: { id: m.title.replace(/\s/g, '-').toLowerCase(), ...m },
    });
  }
  console.log(`✅ ${missions.length} missions seeded`);

  // ─── SEED NOTICES ───────────────────────────────
  await prisma.notice.upsert({
    where: { id: 'welcome-notice' },
    update: {},
    create: {
      id: 'welcome-notice',
      title: 'Welcome to NavyPay',
      content: 'Start claiming orders to earn 4-6% cashback rewards!',
    },
  });
  console.log(`✅ Notice seeded`);

  // ─── SEED SETTINGS ─────────────────────────────
  const settings = [
    { key: 'USDT_RATE', value: '103' },
    { key: 'WELCOME_BONUS', value: '146.84' },
    { key: 'MIN_DEPOSIT_USDT', value: '1' },
    { key: 'MAX_DEPOSIT_USDT', value: '10000' },
    { key: 'HERO_CAROUSEL_ENABLED', value: 'true' },
  ];

  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }
  console.log(`✅ Settings seeded`);

  const slides = [
    {
      type: 'IMAGE',
      mediaUrl: 'https://images.unsplash.com/photo-1611974717482-982c7a69b4b0?q=80&w=2670&auto=format&fit=crop',
      title: 'Premium Rewards Await',
      isActive: true,
      sortOrder: 1
    },
    {
      type: 'IMAGE',
      mediaUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=2664&auto=format&fit=crop',
      title: 'Secure USDT Trading',
      isActive: true,
      sortOrder: 2
    },
    {
      type: 'IMAGE',
      mediaUrl: 'https://images.unsplash.com/photo-1551288049-bbbda536ad02?q=80&w=2670&auto=format&fit=crop',
      title: 'Advanced Market Insights',
      isActive: true,
      sortOrder: 3
    }
  ];

  for (let i = 0; i < slides.length; i++) {
    await prisma.heroCarousel.upsert({
      where: { id: `seed-hero-${i}` },
      update: {},
      create: { id: `seed-hero-${i}`, ...slides[i] }
    });
  }
  console.log(`✅ ${slides.length} hero slides seeded`);

  console.log('\n🎉 Seeding complete!\n');
  console.log('─── Test Credentials ───');
  console.log(`Admin: phone=9999999999 password=admin123 referral=JQGS5E`);
  console.log(`User:  phone=8888888888 password=user123  referral=SRY007`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => await prisma.$disconnect());
