import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env');
const outPath = path.join(root, 'js', 'config.local.js');
const allowedKeys = [
  'BINANCE_API',
  'COINSTATS_API',
  'COINSTATS_API_KEY',
  'ETH_API',
  'ETH_KEY'
];

function parseEnv(source) {
  return source
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .reduce((acc, line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) return acc;

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
      if (allowedKeys.includes(key)) acc[key] = value;
      return acc;
    }, {});
}

if (!fs.existsSync(envPath)) {
  console.error('Missing .env. Copy .env.example to .env and fill your keys.');
  process.exit(1);
}

const config = parseEnv(fs.readFileSync(envPath, 'utf8'));
const output = `window.DEFI_TRACKER_CONFIG = ${JSON.stringify(config, null, 2)};\n`;

fs.writeFileSync(outPath, output, 'utf8');
console.log(`Generated ${path.relative(root, outPath)}`);
