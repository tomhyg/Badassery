/**
 * Runner script for podcast categorization check
 *
 * This compiles and runs the categorization analysis script
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('Starting podcast categorization analysis...\n');

try {
  // Run the TypeScript file directly with ts-node
  execSync(
    'npx ts-node scripts/checkPodcastCategorization.ts',
    {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' }
    }
  );
} catch (error) {
  console.error('Analysis failed:', error.message);
  process.exit(1);
}
