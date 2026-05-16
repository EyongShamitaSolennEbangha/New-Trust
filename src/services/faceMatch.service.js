const AWS = require('aws-sdk');
const axios = require('axios');
const logger = require('../config/logger');
const AppError = require('../utils/AppError');

// AWS Rekognition configuration
const rekognition = new AWS.Rekognition({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Compare a selfie against an ID document photo.
 * Both inputs are Cloudinary URLs; we fetch them as buffers for Rekognition.
 *
 * @param {string} idPhotoUrl - URL of the ID document photo
 * @param {string} selfieUrl  - URL of the live selfie
 * @returns {{ matched: boolean, confidence: number, score: number }}
 */
exports.compareFaces = async (idPhotoUrl, selfieUrl) => {
  try {
    // Fetch images as buffers from Cloudinary
    const [idResponse, selfieResponse] = await Promise.all([
      axios.get(idPhotoUrl, { responseType: 'arraybuffer' }),
      axios.get(selfieUrl, { responseType: 'arraybuffer' }),
    ]);

    const params = {
      SourceImage: { Bytes: Buffer.from(idResponse.data) }, // ID document
      TargetImage: { Bytes: Buffer.from(selfieResponse.data) }, // Live selfie
      SimilarityThreshold: 60, // minimum similarity to return a match
    };

    const result = await rekognition.compareFaces(params).promise();

    if (!result.FaceMatches || result.FaceMatches.length === 0) {
      logger.info('Face matching: No match found');
      return { matched: false, confidence: 0, score: 0 };
    }

    // Use highest-confidence match
    const bestMatch = result.FaceMatches.reduce(
      (best, match) => (match.Similarity > best.Similarity ? match : best),
      result.FaceMatches[0]
    );

    const confidence = bestMatch.Similarity;
    const score = confidence / 100; // normalise to 0–1

    logger.info(`Face matching result: ${confidence.toFixed(2)}% confidence`);

    return {
      matched: confidence >= 80, // require 80%+ for approval
      confidence: parseFloat(confidence.toFixed(2)),
      score: parseFloat(score.toFixed(4)),
    };
  } catch (err) {
    logger.error(`Face matching error: ${err.message}`);

    // If AWS is not configured, use fallback mock (dev only)
    if (process.env.NODE_ENV === 'development' && err.code === 'CredentialsError') {
      logger.warn('AWS not configured — using mock face match for development');
      return { matched: true, confidence: 92.5, score: 0.925, mock: true };
    }

    throw new AppError('Face verification service is unavailable. Please try again.', 503);
  }
};

/**
 * Detect if a face is present in an image (liveness-adjacent check).
 * Returns face count and basic quality metrics.
 */
exports.detectFace = async (imageUrl) => {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });

    const params = {
      Image: { Bytes: Buffer.from(response.data) },
      Attributes: ['ALL'],
    };

    const result = await rekognition.detectFaces(params).promise();
    const faces = result.FaceDetails || [];

    return {
      facesDetected: faces.length,
      hasExactlyOneFace: faces.length === 1,
      faceDetails: faces.map((f) => ({
        confidence: f.Confidence,
        eyesOpen: f.EyesOpen?.Value,
        sunglasses: f.Sunglasses?.Value,
        quality: f.Quality,
      })),
    };
  } catch (err) {
    logger.error(`Face detection error: ${err.message}`);
    if (process.env.NODE_ENV === 'development') {
      return { facesDetected: 1, hasExactlyOneFace: true, mock: true };
    }
    throw new AppError('Face detection service unavailable.', 503);
  }
};
