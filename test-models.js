const fs = require('fs');
const path = require('path');

const modelDir = path.join(__dirname, 'models');
console.log('Models directory:', modelDir);

// Check if directory exists
if (!fs.existsSync(modelDir)) {
  console.error('❌ Models directory does NOT exist!');
  process.exit(1);
}

// List all files in models directory
const files = fs.readdirSync(modelDir);
console.log('Files found in models directory:');
files.forEach((file, i) => {
  const filePath = path.join(modelDir, file);
  const stats = fs.statSync(filePath);
  console.log(`${i + 1}. ${file} (${stats.size} bytes)`);
});

// Check for the specific missing file
const missingFile = 'ssd_mobilenetv1_model-shard2';
const fullPath = path.join(modelDir, missingFile);
if (fs.existsSync(fullPath)) {
  console.log(`✅ ${missingFile} exists!`);
} else {
  console.error(`❌ ${missingFile} is MISSING!`);
}