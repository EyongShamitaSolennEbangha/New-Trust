// scripts/recalculateTrustScores.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User.model');
const trustScoreService = require('../src/services/trustScore.service');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/trustledger';

async function recalculateAllScores() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const users = await User.find({});
    console.log(`Found ${users.length} users`);

    for (const user of users) {
      const result = await trustScoreService.updateUserTrustScore(
        user._id,
        'Migration to 0–100 scale'
      );
      console.log(`Updated ${user.email}: new score = ${result.score}`);
    }

    console.log('All trust scores recalculated.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

recalculateAllScores();