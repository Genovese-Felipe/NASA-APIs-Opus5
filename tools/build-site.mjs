#!/usr/bin/env node
/**
 * Assemble the deployable site.
 *
 * There is no bundling, transpiling or minifying: `src/` is served verbatim as
 * native ES modules. All this does is copy the files that belong on the web and
 * leave behind the ones that do not, then stamp a version into the page so a
 * deployed build can be identified.
 *
 * The reason for a step at all — rather than pointing Pages at the repository
 * root — is that the repository contains a test suite, a tool directory and a
 * lockfile that have no business being downloadable, and because a deployment
 * that silently omits `.nojekyll` breaks every path beginning with an
 * underscore.
 *
 * Usage:  node tools/build-site.mjs [--out _site]
 */

import { cp, mkdir, rm, writeFile, readFile, stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const OUT = resolve(ROOT, outIdx > -1 && argv[outIdx + 1] ? argv[outIdx + 1] : '_site');

/** Everything the site needs, and nothing else. */
const INCLUDE = [
  'index.html',
  '404.html',
  '.nojekyll',
  'site.webmanifest',
  'assets',
  'src',
  'docs',
  'README.md',
  'LICENSE',
  'DATA-AND-CREDITS.md',
];

/** Paths inside those trees that must not ship. */
const EXCLUDE = [/\.test\.js$/, /\/tests\//, /\.map$/, /\.DS_Store$/];

/** @param {string} path */
function excluded(path) {
  return EXCLUDE.some((re) => re.test(path.replace(/\\/g, '/')));
}

/** Current commit, if we are in a checkout. @returns {string} */
function version() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    return sha;
  } catch {
    return 'dev';
  }
}

/** Total size of a tree. @param {string} dir @returns {Promise<number>} */
async function treeSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += await treeSize(full);
    else total += (await stat(full)).size;
  }
  return total;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  for (const item of INCLUDE) {
    const from = resolve(ROOT, item);
    if (!existsSync(from)) {
      process.stdout.write(`  skip ${item} (not present)\n`);
      continue;
    }
    await cp(from, resolve(OUT, item), {
      recursive: true,
      filter: (src) => !excluded(relative(ROOT, src)),
    });
    process.stdout.write(`  copy ${item}\n`);
  }

  // `.nojekyll` matters: without it GitHub Pages runs Jekyll, which silently
  // refuses to serve any path with a leading underscore.
  await writeFile(resolve(OUT, '.nojekyll'), '');

  // Stamp the build so a deployed page can say which commit it is.
  const sha = version();
  const html = await readFile(resolve(OUT, 'index.html'), 'utf8');
  await writeFile(
    resolve(OUT, 'index.html'),
    html.replace('</head>', `<meta name="build" content="${sha}">\n</head>`)
  );
  await writeFile(
    resolve(OUT, 'build.json'),
    JSON.stringify({ commit: sha, builtAt: new Date().toISOString() }, null, 2)
  );

  const bytes = await treeSize(OUT);
  process.stdout.write(
    `Site assembled at ${relative(ROOT, OUT)} — ${(bytes / 1048576).toFixed(1)} MB, build ${sha}\n`
  );

  // GitHub Pages allows a 1 GB site; anything approaching that here would mean
  // something has gone badly wrong.
  if (bytes > 200 * 1048576) {
    process.stderr.write('Site exceeds 200 MB; something is being copied that should not be.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`build-site failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
