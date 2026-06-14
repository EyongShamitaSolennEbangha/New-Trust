const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  let mongoURI;
  if (process.env.NODE_ENV === 'production') {
    // Use Atlas URI in production
    mongoURI = process.env.MONGO_URI_PROD;
  } else {
    // Use local URI in development
    mongoURI = process.env.MONGO_URI;
  }

  if (!mongoURI) {
    logger.error('MongoDB URI is not defined');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoURI);
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
