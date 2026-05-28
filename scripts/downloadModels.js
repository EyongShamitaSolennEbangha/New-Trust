const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL_FILES = [
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1'
];

const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

(async () => {
  const modelsDir = path.join(__dirname, '../models');
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  for (const file of MODEL_FILES) {
    const url = `${MODEL_URL}/${file}`;
    const dest = path.join(modelsDir, file);
    console.log(`Downloading ${file}...`);
    await downloadFile(url, dest);
  }
  console.log('✅ All models downloaded successfully');
})();