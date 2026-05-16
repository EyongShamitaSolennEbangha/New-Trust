require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User.model');
const Agreement = require('../models/Agreement.model');
const logger = require('../config/logger');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('Connected to DB for seeding...');

    // Clear existing data
    await User.deleteMany({});
    await Agreement.deleteMany({});
    logger.info('Cleared existing seed data');

    // ── Create Users ────────────────────────────────────────────────────────
    const users = await User.create([
      {
        firstName: 'Admin',
        lastName: 'TrustLedger',
        email: 'admin@trustledger.com',
        phone: '+2348000000001',
        password: 'Admin@1234!',
        role: 'admin',
        accountStatus: 'active',
        isEmailVerified: true,
        isPhoneVerified: true,
        isIdentityVerified: true,
        'trustScore.score': 950,
        'trustScore.level': 'platinum',
      },
      {
        firstName: 'Chidi',
        lastName: 'Okeke',
        email: 'chidi@example.com',
        phone: '+2348011111111',
        password: 'Password@123',
        role: 'user',
        accountStatus: 'active',
        isEmailVerified: true,
        isPhoneVerified: true,
        isIdentityVerified: true,
        'trustScore.score': 720,
        'trustScore.level': 'gold',
        'stats.completedAgreements': 5,
        'stats.totalAmountLent': 500000,
      },
      {
        firstName: 'Amaka',
        lastName: 'Nwosu',
        email: 'amaka@example.com',
        phone: '+2348022222222',
        password: 'Password@123',
        role: 'user',
        accountStatus: 'active',
        isEmailVerified: true,
        isPhoneVerified: true,
        isIdentityVerified: true,
        'trustScore.score': 580,
        'trustScore.level': 'silver',
        'stats.completedAgreements': 3,
        'stats.totalAmountBorrowed': 200000,
      },
      {
        firstName: 'Emeka',
        lastName: 'Eze',
        email: 'emeka@example.com',
        phone: '+2348033333333',
        password: 'Password@123',
        role: 'user',
        accountStatus: 'active',
        isEmailVerified: true,
        isPhoneVerified: false,
        isIdentityVerified: false,
        'trustScore.score': 420,
        'trustScore.level': 'bronze',
      },
    ]);

    logger.info(`Created ${users.length} seed users`);

    // ── Create Sample Agreements ────────────────────────────────────────────
    const creditor = users[1]; // Chidi
    const debtor = users[2];   // Amaka

    await Agreement.create([
      {
        creditor: {
          user: creditor._id,
          name: creditor.fullName,
          email: creditor.email,
          phone: creditor.phone,
          signedAt: new Date(),
        },
        debtor: {
          user: debtor._id,
          name: debtor.fullName,
          email: debtor.email,
          phone: debtor.phone,
          signedAt: new Date(),
        },
        principalAmount: 50000,
        currency: 'NGN',
        totalAmountDue: 50000,
        remainingBalance: 30000,
        purpose: 'Business capital for market goods',
        repaymentType: 'installments',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        verificationMode: 'in_person',
        status: 'active',
        activatedAt: new Date(),
        documentHash: 'seed_hash_placeholder',
        statusHistory: [
          { status: 'active', reason: 'Seeded active agreement' },
        ],
      },
      {
        creditor: {
          user: creditor._id,
          name: creditor.fullName,
          email: creditor.email,
          phone: creditor.phone,
        },
        debtor: {
          user: users[3]._id,
          name: users[3].fullName,
          email: users[3].email,
          phone: users[3].phone,
        },
        principalAmount: 20000,
        currency: 'NGN',
        totalAmountDue: 20000,
        remainingBalance: 20000,
        purpose: 'Personal loan',
        repaymentType: 'lump_sum',
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        verificationMode: 'remote',
        status: 'pending_debtor_verification',
        documentHash: 'seed_hash_placeholder_2',
        statusHistory: [
          { status: 'pending_debtor_verification', reason: 'Seeded pending agreement' },
        ],
      },
    ]);

    logger.info('Seed data created successfully!');
    logger.info('─────────────────────────────────────────');
    logger.info('Test Accounts:');
    logger.info('  Admin:   admin@trustledger.com / Admin@1234!');
    logger.info('  Creditor: chidi@example.com / Password@123');
    logger.info('  Debtor:   amaka@example.com / Password@123');
    logger.info('  Unverified: emeka@example.com / Password@123');
    logger.info('─────────────────────────────────────────');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    logger.error(`Seeding failed: ${err.message}`);
    process.exit(1);
  }
};

seed();
