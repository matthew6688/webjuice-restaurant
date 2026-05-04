#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i += 1) {
    if (!args[i].startsWith('--')) continue;
    parsed[args[i].slice(2)] = args[i + 1]?.startsWith('--') ? true : (args[i + 1] || true);
  }
  return parsed;
}

const args = parseArgs();

if (!args.content || !args.design) {
  console.error('Usage: node scripts/apply-client-artifacts.js --content path/content.restaurant.json --design path/design.restaurant.json [--assets-dir path/public/images]');
  process.exit(1);
}

copyRequired(args.content, 'src/data/content.restaurant.json');
copyRequired(args.design, 'src/data/design.restaurant.json');
if (args['assets-dir'] || args.assetsDir) {
  copyDir(args['assets-dir'] || args.assetsDir, 'public/images');
}

console.log('Restaurant artifacts applied');
console.log('- src/data/content.restaurant.json');
console.log('- src/data/design.restaurant.json');
if (args['assets-dir'] || args.assetsDir) console.log('- public/images');

function copyRequired(source, destination) {
  const sourcePath = path.resolve(process.cwd(), source);
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing artifact: ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(sourcePath, destination);
}

function copyDir(source, destination) {
  const sourcePath = path.resolve(process.cwd(), source);
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing assets directory: ${source}`);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
    const from = path.join(sourcePath, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}
