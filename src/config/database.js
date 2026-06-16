const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  // Determine which URI to try first
  const isProduction = process.env.NODE_ENV === 'production';
  const primaryURI = isProduction ? process.env.MONGO_URI_PROD : process.env.MONGO_URI;
  const fallbackURI = isProduction ? null : process.env.MONGO_URI_PROD; // fallback to Atlas in dev if local fails

  if (!primaryURI) {
    logger.error('No MongoDB URI provided. Set MONGO_URI (dev) or MONGO_URI_PROD (prod).');
    process.exit(1);
  }

  try {
    await mongoose.connect(primaryURI);
    logger.info(`MongoDB connected (${isProduction ? 'production' : 'development'})`);
  } catch (err) {
    logger.warn(`Primary connection failed: ${err.message}`);

    if (fallbackURI && !isProduction) {
      logger.info('Attempting to connect to Atlas fallback...');
      try {
        await mongoose.connect(fallbackURI);
        logger.info('MongoDB connected to Atlas fallback');
      } catch (fallbackErr) {
        logger.error(`Fallback connection failed: ${fallbackErr.message}`);
        process.exit(1);
      }
    } else {
      logger.error('MongoDB connection failed. Please ensure MongoDB is running locally or check your Atlas URI.');
      process.exit(1);
    }
  }
};

module.exports = connectDB;