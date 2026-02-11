/**
 * Database seed script for Meridian
 *
 * Populates the database with initial data for development:
 * - Admin users
 * - Sample markets
 * - Sample RWA assets
 *
 * Usage: npx ts-node scripts/seed.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Seeding Meridian Database ===\n');

  // Create admin users
  console.log('>>> Creating admin users...');
  const admin = await prisma.admin.upsert({
    where: { email: 'admin@meridian.dev' },
    update: {},
    create: {
      email: 'admin@meridian.dev',
      name: 'Meridian Admin',
      role: 'SUPER_ADMIN',
      walletAddress: '11111111111111111111111111111111',
    },
  });
  console.log(`  Admin: ${admin.email} (${admin.role})`);

  const operator = await prisma.admin.upsert({
    where: { email: 'operator@meridian.dev' },
    update: {},
    create: {
      email: 'operator@meridian.dev',
      name: 'Meridian Operator',
      role: 'OPERATOR',
      walletAddress: '22222222222222222222222222222222',
    },
  });
  console.log(`  Admin: ${operator.email} (${operator.role})`);

  // Create sample markets
  console.log('\n>>> Creating sample markets...');
  const markets = [
    {
      symbol: 'MERI',
      name: 'Meridian Holdings',
      marketType: 'EQUITY',
      basePrice: 1500.0,
    },
    {
      symbol: 'SONY',
      name: 'Sony Group',
      marketType: 'EQUITY',
      basePrice: 3200.0,
    },
    {
      symbol: 'MERI-RE-001',
      name: 'Meridian Real Estate Fund 1',
      marketType: 'RWA',
      basePrice: 500000.0,
    },
  ];

  for (const m of markets) {
    const market = await prisma.market.upsert({
      where: { symbol: m.symbol },
      update: {},
      create: {
        symbol: m.symbol,
        name: m.name,
        securityMint: `${m.symbol}mint111111111111111111111111111`,
        quoteMint: 'STBLm111111111111111111111111111111111111111',
        marketType: m.marketType,
        tradingFeeBps: 30,
        isActive: true,
      },
    });
    console.log(`  Market: ${market.symbol} - ${market.name}`);

    // Create initial snapshot
    await prisma.marketSnapshot.create({
      data: {
        marketId: market.id,
        price: m.basePrice,
        volume24h: 0,
        high24h: m.basePrice,
        low24h: m.basePrice,
        change24h: 0,
      },
    });
  }

  // Create sample RWA assets
  console.log('\n>>> Creating sample RWA assets...');
  const rwaAssets = [
    {
      symbol: 'MERI-RE-001',
      name: 'Meridian Real Estate Fund 1',
      rwaType: 'REAL_ESTATE',
      valuation: 500000000, // ¥500M
    },
    {
      symbol: 'MERI-BD-001',
      name: 'Meridian Corporate Bond 2026',
      rwaType: 'BOND',
      valuation: 100000000, // ¥100M
    },
  ];

  for (const a of rwaAssets) {
    const asset = await prisma.rwaAsset.upsert({
      where: { symbol: a.symbol },
      update: {},
      create: {
        symbol: a.symbol,
        name: a.name,
        rwaType: a.rwaType,
        valuation: a.valuation,
        valuationCurrency: 'USD',
        tokenMint: `${a.symbol}mint1111111111111111111111111`,
        custodian: 'custodian11111111111111111111111111',
        status: 'ACTIVE',
      },
    });
    console.log(`  RWA: ${asset.symbol} - ${asset.name} (¥${(a.valuation / 1_000_000).toLocaleString()}M)`);
  }

  // Create daily stats entry
  console.log('\n>>> Creating initial daily stats...');
  await prisma.dailyStats.create({
    data: {
      date: new Date(),
      totalSupply: 0,
      totalCollateral: 0,
      totalVolume: 0,
      totalTransactions: 0,
      uniqueUsers: 0,
      totalMinted: 0,
      totalBurned: 0,
    },
  });
  console.log('  Initial daily stats created.');

  console.log('\n=== Seeding Complete ===');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
