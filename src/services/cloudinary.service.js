const cloudinary = require('cloudinary').v2;
const logger = require('../config/logger');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a buffer to Cloudinary.
 * @param {Buffer} buffer - Image buffer from multer memoryStorage
 * @param {string} folder - Cloudinary folder
 * @param {string} publicId - Optional public ID
 */
const uploadBuffer = (buffer, folder, publicId = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      folder: `trustledger/${folder}`,
      resource_type: 'image',
      format: 'jpg',
      quality: 'auto:good',
      ...(publicId && { public_id: publicId }),
    };

    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        logger.error(`Cloudinary upload error: ${error.message}`);
        return reject(error);
      }
      resolve(result);
    });

    stream.end(buffer);
  });
};

exports.uploadAvatar = async (buffer, userId) => {
  const result = await uploadBuffer(buffer, 'avatars', `avatar_${userId}`);
  return result.secure_url;
};

exports.uploadIdFront = async (buffer, userId) => {
  const result = await uploadBuffer(buffer, 'id_documents', `id_front_${userId}_${Date.now()}`);
  return result.secure_url;
};

exports.uploadIdBack = async (buffer, userId) => {
  const result = await uploadBuffer(buffer, 'id_documents', `id_back_${userId}_${Date.now()}`);
  return result.secure_url;
};

exports.uploadSelfie = async (buffer, userId) => {
  const result = await uploadBuffer(buffer, 'selfies', `selfie_${userId}_${Date.now()}`);
  return result.secure_url;
};

exports.uploadPaymentReceipt = async (buffer, paymentRef) => {
  const result = await uploadBuffer(buffer, 'receipts', `receipt_${paymentRef}`);
  return result.secure_url;
};

exports.uploadDisputeEvidence = async (buffer, disputeId, index) => {
  const result = await uploadBuffer(buffer, 'disputes', `dispute_${disputeId}_evidence_${index}`);
  return result.secure_url;
};

exports.deleteImage = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    logger.error(`Cloudinary delete error: ${err.message}`);
  }
};
