require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User.model');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/trustledger';

const seedAdmin = async () => {
  try {
    console.log('1. Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('2. Connected.');

    console.log('3. Deleting existing admin...');
    const deleteResult = await User.deleteOne({ email: 'admin@trustledger.com' });
    console.log('   Deleted count:', deleteResult.deletedCount);

    console.log('4. Creating new admin...');
    const admin = await User.create({
      firstName: 'Super',
      lastName: 'Admin',
      email: 'admin@trustledger.com',
      phone: '+237600000001',
      password: 'Admin@123456',
      role: 'admin',
      isEmailVerified: true,
      isPhoneVerified: true,
      isIdentityVerified: true,
      accountStatus: 'active',
    });

    console.log('5. Admin created successfully!');
    console.log('   ID:', admin._id);
    console.log('   Email:', admin.email);
    console.log('   Role:', admin.role);

    // Verify by finding it again
    const found = await User.findOne({ email: 'admin@trustledger.com' }).select('+password');
    if (found) {
      console.log('6. Verification: user exists in DB');
      const bcrypt = require('bcryptjs');
      const match = await bcrypt.compare('Admin@123456', found.password);
      console.log('   Password match test:', match);
    } else {
      console.log('6. Verification: user NOT found after creation');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ SEED FAILED:');
    console.error('Message:', err.message);
    if (err.errors) {
      console.error('Validation errors:');
      for (let field in err.errors) {
        console.error(`  - ${field}: ${err.errors[field].message}`);
      }
    }
    console.error('Full error:', err);
    process.exit(1);
  }
};

seedAdmin();