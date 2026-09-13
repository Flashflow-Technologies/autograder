#!/usr/bin/env node
/**
 * VENDOR-ONLY licence generator. DO NOT ship this, the private key, or this
 * folder to customers. Keep the private key offline and secret.
 *
 * One-time setup — generate your vendor key pair:
 *   node tools/license/generate.js keygen
 *   -> writes vendor_private.pem (KEEP SECRET) and vendor_public.pem
 *   Put the contents of vendor_public.pem into the server's LICENSE_PUBLIC_KEY
 *   env var (that's the only key the deployed app needs).
 *
 * Issue a licence:
 *   node tools/license/generate.js issue \
 *     --institution "Canara Engineering College" \
 *     --plan university \
 *     --months 12 \
 *     --key ./vendor_private.pem
 *   -> prints the licence string. Give that to the customer; they paste it into
 *      the admin Licence screen (or set LICENSE_KEY in their env).
 */
import crypto from 'crypto';
import fs from 'fs';

const args = process.argv.slice(2);
const cmd = args[0];

function flag(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

if (cmd === 'keygen') {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.writeFileSync('vendor_private.pem', privateKey);
  fs.writeFileSync('vendor_public.pem', publicKey);
  console.log('Wrote vendor_private.pem (KEEP SECRET) and vendor_public.pem');
  console.log('Set LICENSE_PUBLIC_KEY on the server to the contents of vendor_public.pem');
  process.exit(0);
}

if (cmd === 'issue') {
  const institution = flag('institution');
  const plan = (flag('plan', 'institution') || '').toLowerCase();
  const months = Number(flag('months', '12'));
  const keyPath = flag('key', './vendor_private.pem');
  if (!institution) { console.error('Missing --institution'); process.exit(1); }
  if (!['essentials', 'institution', 'university', 'enterprise'].includes(plan)) {
    console.error('--plan must be one of: essentials, institution, university, enterprise'); process.exit(1);
  }
  if (!fs.existsSync(keyPath)) { console.error(`Private key not found: ${keyPath}`); process.exit(1); }

  const now = new Date();
  const expires = new Date(now.getTime());
  expires.setMonth(expires.getMonth() + months);

  const payload = {
    institution,
    plan,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    v: 1,
  };
  const payloadJson = JSON.stringify(payload);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(payloadJson);
  signer.end();
  const sig = signer.sign(fs.readFileSync(keyPath));
  const token = `${Buffer.from(payloadJson).toString('base64url')}.${sig.toString('base64url')}`;

  console.log('\nLicence issued:');
  console.log('  Institution:', institution);
  console.log('  Plan:       ', plan);
  console.log('  Expires:    ', expires.toISOString().slice(0, 10));
  console.log('\nLicence key (give to customer):\n');
  console.log(token);
  console.log('');
  process.exit(0);
}

console.log('Usage:');
console.log('  node tools/license/generate.js keygen');
console.log('  node tools/license/generate.js issue --institution "Name" --plan university --months 12 --key ./vendor_private.pem');
