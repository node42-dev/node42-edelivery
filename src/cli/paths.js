/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import fs   from 'fs';
import path from 'path';
import os   from 'os';

import { N42Context } from '../model/context.js';
import { Spinner }    from '../cli/spinner.js';
import { c, C }       from './color.js';

import { fileURLToPath } from 'url';
const __dirname = path.dirname(import.meta.url.startsWith('file:') 
  ? fileURLToPath(import.meta.url) 
  : import.meta.url);

export const getN42Home = () => path.join(os.homedir(), '.node42');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function destExists(p) {
  return fs.existsSync(p) ? p : null;
}

export function getAssetsDir() {
  return path.resolve(__dirname, 'assets');
}

export function getUserHomeDir()         { return ensureDir(getN42Home()); }
export function getUserCertsDir()        { return ensureDir(path.join(getN42Home(), 'certs')); }
export function getUserSchematronDir()   { return ensureDir(path.join(getN42Home(), 'schematrons')); }
export function getUserTemplatesDir()    { return ensureDir(path.join(getN42Home(), 'templates')); }
export function getUserReportsDir()      { return ensureDir(path.join(getN42Home(), 'reports')); }

export function getUserArtefactsDir()    { return ensureDir(path.join(getN42Home(), 'artefacts')); }
export function getUserTransactionsDir() { return ensureDir(path.join(getN42Home(), 'artefacts', 'transactions')); }
export function getUserValidationsDir()  { return ensureDir(path.join(getN42Home(), 'artefacts', 'validations')); }

export function getDbFile()              { return path.join(getN42Home(), 'db.json'); }
export function getTokensFile()          { return path.join(getN42Home(), 'tokens.json'); }
export function getConfigFile()          { return path.join(getN42Home(), 'config.json'); }


export function initWorkspace(force = false) {
  const spinner = new Spinner();
  const context = new N42Context({
      spinner 
  });

  initDotEnv(force);
  initUserCerts(context, force);
  initUserSchematrons(context, force);
  initUserTemplates(context, force);
}

export function initShellCompletion() {
  const src = path.join(__dirname, 'completion/bash.sh');
  const dest = path.join(getUserHomeDir(), 'completion.bash');
  fs.copyFileSync(src, dest);

  console.log(`Completion script saved to ${dest}`);
  console.log(`Run: ${c(C.BOLD, 'source ' + dest)}\n`);
}

export function initDotEnv(force=false) {
  const src = path.join(getAssetsDir(), 'env.example');
  const dest = path.join(getUserHomeDir(), '.env.local');
  if (force || !fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
  }
}

// TODO: Remove once new fs.cpSync version confirmed working. <a1exnd3r 2026-03-07 d:2026-04-07 p:1>
/*
export function initUserSchematrons(context, force = false) {
  if (force) context.spinner.start('Loading Schematrons');
  const dir    = getUserSchematronDir();
  const srcDir = path.join(getAssetsDir(), 'schematrons');
  const xsls   = fs.readdirSync(dir).filter(f => f.endsWith('.xsl'));
  let count = 0

  if (force || xsls.length === 0) {
    if (fs.existsSync(srcDir)) {
      for (const file of fs.readdirSync(srcDir).filter(f => f.endsWith('.xsl'))) {
        const dst = path.join(dir, file);
        if (!fs.existsSync(dst) || force) {
          fs.copyFileSync(path.join(srcDir, file), dst);
          count++;
        }
      }
    }
  }
  if (force) context.spinner.done(`Loaded Schematrons (${count})`);
}
*/

export function initUserSchematrons(context, force = false) {
  if (force) context.spinner.start('Loading Schematrons');
  const dir    = getUserSchematronDir();
  const srcDir = path.join(getAssetsDir(), 'schematrons');
  let count = 0

  if (force || fs.readdirSync(dir).length === 0) {
    if (fs.existsSync(srcDir)) {
      fs.cpSync(srcDir, dir, { recursive: true, force: force });
      count++;
    }
  }

  if (force) context.spinner.done(`Loaded Schematrons (${count})`);
}

export function initUserTemplates(context, force = false) {
  if (force) context.spinner.start('Loading Templates');
  const dir    = getUserTemplatesDir();
  const srcDir = path.join(getAssetsDir(), 'templates');
  const jsons  = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  
  let count = 0;
  if (force || jsons.length === 0) {
    if (fs.existsSync(srcDir)) {
      for (const file of fs.readdirSync(srcDir).filter(f => f.endsWith('.json'))) {
        const dst = path.join(dir, file);
        if (!fs.existsSync(dst) || force) {
          fs.copyFileSync(path.join(srcDir, file), dst);
          count++;
        }
      }
    }
  }
  if (force) context.spinner.done(`Loaded Templates (${count})`);
}

export function initUserCerts(context, force = false) {
  if (force) context.spinner.start('Loading Certificates');
  const dir     = getUserCertsDir();
  const srcDir = path.join(getAssetsDir(), 'certs');
  const pems   = fs.readdirSync(dir).filter(f => f.endsWith('.pem'));

  let count = 0;
  if (force || pems.length === 0) {
    if (fs.existsSync(srcDir)) {
      for (const file of fs.readdirSync(srcDir).filter(f => f.endsWith('.pem'))) {
        const dst = path.join(dir, file);
        if (!fs.existsSync(dst) || force) {
          fs.copyFileSync(path.join(srcDir, file), dst);
          count++;
        }
      }
    }
  }

  const readme  = path.join(dir, 'README.md');
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme,
    '## Certificates Directory\n' +
    'This directory contains certificate material used for AS4 message signing and encryption.\n' +
    'Files are loaded at runtime. Nothing here should be committed.\n\n' +
    '---\n\n' +
    '## Expected Files\n' +
    '- `cert.pem`   → Public certificate (PEM)\n' +
    '- `key.pem`    → Private key (PEM, chmod 600)\n' +
    '- `chain.pem`  → Intermediate / root chain (optional but recommended)\n\n' +
    '## OpenSSL Inspection\n' +
    '### View certificate details\n' +
    '```bash\n' +
    'openssl x509 -in cert.pem -text -noout\n' +
    '```\n' +
    '### Check expiration date\n' +
    '```bash\n' +
    'openssl x509 -in cert.pem -noout -enddate\n' +
    '```\n' +
    '### Print SHA256 fingerprint\n' +
    '```bash\n' +
    'openssl x509 -in cert.pem -noout -fingerprint -sha256\n' +
    '```\n' +
    '### Verify private key matches certificate\n' +
    '```bash\n' +
    'openssl x509 -noout -modulus -in cert.pem | openssl md5\n' +
    'openssl rsa  -noout -modulus -in key.pem  | openssl md5\n' +
    '```\n' +
    'Hashes must match.\n' +
    '### Validate certificate against chain\n' +
    '```bash\n' +
    'openssl verify -CAfile chain.pem cert.pem\n' +
    '```\n\n' +
    '## Security Notes\n' +
    '- Never commit private keys to git\n' +
    '- Add this directory to `.gitignore`\n' +
    '- Use a secret manager in production\n' +
    '- Restrict permissions: `chmod 600 key.pem`'
    );
  }
  if (force) context.spinner.done(`Loaded Certificates (${count})`);
}
