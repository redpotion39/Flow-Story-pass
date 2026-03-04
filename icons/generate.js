const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const sourceImage = path.join(__dirname, '..', 'flow-x-4.jpg');
const sizes = [16, 32, 48, 128];

// ใช้ sips (macOS built-in) เพื่อ resize
sizes.forEach(size => {
  const outputFile = path.join(__dirname, `icon${size}.png`);
  const tempFile = path.join(__dirname, `_temp_${size}.png`);

  // Copy source to temp as PNG
  execSync(`sips -s format png "${sourceImage}" --out "${tempFile}" --resampleWidth ${size} --resampleHeight ${size}`, { stdio: 'ignore' });

  // Move to final
  fs.renameSync(tempFile, outputFile);
  console.log(`Created icon${size}.png`);
});
