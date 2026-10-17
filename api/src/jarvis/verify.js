// Proves a request really came from Alexa, as Amazon requires of any skill
// hosted outside Lambda. The skill endpoint is the one thing on the Mini that
// faces the internet, so nothing reaches Jarvis without passing all of this:
//
//  1. SignatureCertChainUrl is Amazon's S3 bucket (https, /echo.api/, :443).
//  2. The certificate chain from it is in date, names echo-api.amazon.com and
//     chains up to a root CA Node already trusts.
//  3. Signature-256 is that certificate's signature over the raw body.
//  4. The request timestamp is within 150 seconds (stops replays).
//  5. The applicationId is our skill (ALEXA_SKILL_ID).
import crypto from 'node:crypto';
import tls from 'node:tls';

const MAX_SKEW_MS = 150_000;
const certCache = new Map(); // url -> { leaf, expires }

const roots = tls.rootCertificates.map((pem) => new crypto.X509Certificate(pem));

function validCertUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return (
    u.protocol === 'https:' &&
    u.hostname.toLowerCase() === 's3.amazonaws.com' &&
    (u.port === '' || u.port === '443') &&
    // Normalise ../ tricks before checking the path.
    new URL(u.pathname, 'https://x').pathname.startsWith('/echo.api/')
  );
}

function splitPem(chain) {
  return chain.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
}

async function signingCert(url) {
  const hit = certCache.get(url);
  if (hit && hit.expires > Date.now()) return hit.leaf;

  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`cert fetch ${res.status}`);
  const certs = splitPem(await res.text()).map((pem) => new crypto.X509Certificate(pem));
  if (!certs.length) throw new Error('empty cert chain');

  const now = Date.now();
  for (const c of certs) {
    if (Date.parse(c.validFrom) > now || Date.parse(c.validTo) < now) {
      throw new Error('cert out of date');
    }
  }
  const leaf = certs[0];
  if (!/(^|,\s*)DNS:echo-api\.amazon\.com(,|$)/.test(leaf.subjectAltName || '')) {
    throw new Error('cert is not for echo-api.amazon.com');
  }
  // Each certificate must be signed by the next one in the bundle.
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].checkIssued(certs[i + 1]) || !certs[i].verify(certs[i + 1].publicKey)) {
      throw new Error('broken cert chain');
    }
  }
  // Amazon's bundle ends in a cross-signed root, so trust the chain as soon as
  // any link in it is (or is signed by) a root CA Node ships with.
  const trusted = certs.some((c) =>
    roots.some((r) => c.fingerprint256 === r.fingerprint256 || (c.checkIssued(r) && c.verify(r.publicKey)))
  );
  if (!trusted) throw new Error('cert chain not trusted');

  certCache.set(url, { leaf, expires: Math.min(Date.parse(leaf.validTo), now + 6 * 3600_000) });
  return leaf;
}

/**
 * Throws with a reason if the request is not a genuine Alexa request for this
 * skill. `raw` is the exact body bytes; `body` is the parsed JSON.
 */
export async function verifyAlexa(headers, raw, body) {
  const url = headers.signaturecertchainurl;
  const sig = headers['signature-256'];
  if (!url || !sig) throw new Error('missing signature headers');
  if (!validCertUrl(url)) throw new Error('bad cert url');

  const leaf = await signingCert(url);
  const ok = crypto.verify('sha256', raw, leaf.publicKey, Buffer.from(sig, 'base64'));
  if (!ok) throw new Error('bad signature');

  const ts = Date.parse(body?.request?.timestamp || '');
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    throw new Error('stale request');
  }

  const appId = body?.context?.System?.application?.applicationId || body?.session?.application?.applicationId;
  if (!process.env.ALEXA_SKILL_ID || appId !== process.env.ALEXA_SKILL_ID) {
    throw new Error('wrong skill id');
  }
}
