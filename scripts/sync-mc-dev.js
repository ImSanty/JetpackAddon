#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const os = require('os');

// Paths in this repo
const repoRoot = path.resolve(__dirname, '..');
const bpSource = path.join(repoRoot, 'JetpackBP');
const rpSource = path.join(repoRoot, 'JetpackRP');

// Path for Minecraft Bedrock on this machine
// Examples:
//  - C:\Users\\<User>\\AppData\\Roaming\\Minecraft Bedrock\\Users\\Shared\\games\\com.mojang
//  - C:\Users\\<User>\\AppData\\Roaming\\Minecraft Bedrock\\Users\\15363262648799951649\\games\\com.mojang
// Resolution order:
//  1. MCBE_COM_MOJANG_PATH  (full path to ...\\games\\com.mojang)
//  2. MCBE_USER_ID          (numeric folder name under ...\\Users)
//  3. Auto-detect (Shared, then first valid user folder)
// Values can come from real env vars or a .env file.
function resolveMcBase() {
  // Manual override (must point directly to ...\\games\\com.mojang)
  if (process.env.MCBE_COM_MOJANG_PATH) {
    return process.env.MCBE_COM_MOJANG_PATH;
  }

  const appdata =
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const usersRoot = path.join(appdata, 'Minecraft Bedrock', 'Users');

  if (!fs.existsSync(usersRoot)) {
    console.error(`Minecraft Bedrock users folder not found: ${usersRoot}`);
    process.exit(1);
  }

  // If user id is provided, use it directly
  if (process.env.MCBE_USER_ID) {
    const byId = path.join(
      usersRoot,
      process.env.MCBE_USER_ID,
      'games',
      'com.mojang'
    );

    if (!fs.existsSync(byId)) {
      console.error(`MCBE_USER_ID is set, but folder does not exist: ${byId}`);
      process.exit(1);
    }

    console.log(`Using Minecraft Bedrock path (MCBE_USER_ID): ${byId}`);
    return byId;
  }

  // Otherwise, fall back to auto-detection (Shared preferred)
  const entries = fs
    .readdirSync(usersRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory());

  let sharedCandidate = null;
  let firstCandidate = null;

  for (const entry of entries) {
    const candidate = path.join(usersRoot, entry.name, 'games', 'com.mojang');
    if (fs.existsSync(candidate)) {
      if (!firstCandidate) firstCandidate = candidate;
      if (entry.name.toLowerCase() === 'shared') {
        sharedCandidate = candidate;
      }
    }
  }

  const chosen = sharedCandidate || firstCandidate;

  if (!chosen) {
    console.error(
      `Could not find a games/com.mojang folder under: ${usersRoot}`
    );
    process.exit(1);
  }

  console.log(`Using Minecraft Bedrock path: ${chosen}`);
  return chosen;
}

const mcBase = resolveMcBase();

const devBP = path.join(mcBase, 'development_behavior_packs');
const devRP = path.join(mcBase, 'development_resource_packs');

const bpTarget = path.join(devBP, 'JetpackBP');
const rpTarget = path.join(devRP, 'JetpackRP');

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

function removeIfExists(p) {
  if (!fs.existsSync(p)) return;
  const stat = fs.lstatSync(p);
  if (stat.isSymbolicLink() || stat.isDirectory()) {
    fs.rmSync(p, { recursive: true, force: true });
  } else {
    fs.unlinkSync(p);
  }
}

function makeLink(target, source) {
  ensureDir(path.dirname(target));

  if (!fs.existsSync(source)) {
    console.error(`Source does not exist: ${source}`);
    process.exitCode = 1;
    return;
  }

  removeIfExists(target);

  try {
    // On Windows, junction works for folders even without admin
    const type = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(source, target, type);
    console.log(`Linked: ${target} -> ${source}`);
  } catch (err) {
    console.error('Failed to create symlink, copying instead...', err.message);
    copyDir(source, target);
  }
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const real = fs.realpathSync(srcPath);
      fs.copyFileSync(real, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Minecraft dev base:', mcBase);

ensureDir(devBP);
ensureDir(devRP);

makeLink(bpTarget, bpSource);
makeLink(rpTarget, rpSource);

console.log('Sync complete. Restart/reload Minecraft to see changes.');
