const { execSync, spawn } = require('child_process');
const path = require('path');

// Install dependencies and build if needed
const dotNextPath = path.join(__dirname, '.next');
const fs = require('fs');

if (!fs.existsSync(dotNextPath)) {
  console.log('Building Next.js app...');
  execSync('npm install', { stdio: 'inherit', cwd: __dirname });
  execSync('npm run build', { stdio: 'inherit', cwd: __dirname });
}

// Start Next.js production server
const port = process.env.PORT || 3000;
const child = spawn('npx', ['next', 'start', '-p', port.toString()], {
  stdio: 'inherit',
  cwd: __dirname,
  env: { ...process.env },
});

child.on('error', (err) => {
  console.error('Failed to start Next.js:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
