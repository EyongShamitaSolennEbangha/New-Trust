const multer = require('multer');
const path = require('path');
const AppError = require('../utils/AppError');

// Memory storage (we upload to Cloudinary, not disk)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only JPEG, PNG, and WebP images are allowed.', 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

exports.uploadSinglePhoto = (fieldName) => upload.single(fieldName);

exports.uploadMultiplePhotos = (fields) => upload.fields(fields);

// For ID verification: front, back, selfie
exports.uploadIdPhotos = upload.fields([
  { name: 'idFront', maxCount: 1 },
  { name: 'idBack', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
]);

// For payment receipt
exports.uploadPaymentReceipt = upload.single('receipt');

// For dispute evidence
exports.uploadDisputeEvidence = upload.array('evidence', 5);
