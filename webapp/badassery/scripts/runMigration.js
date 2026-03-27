/**
 * Runner script for TypeScript migrations
 *
 * This compiles and runs the migration script
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Starting migration script...\n');

try {
  // Run the TypeScript file directly with ts-node
  execSync(
    'npx ts-node scripts/migrateOutreachEmailThreads.ts',
    {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' }
    }
  );
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}
