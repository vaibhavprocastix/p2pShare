/**
 * turn.js
 * ------------------------------------------------------------------
 * Builds the ICE server list handed to clients via GET /api/v1/ice-servers.
 *
 * STUN alone only helps two peers discover each other's public address —
 * it cannot relay traffic. When both peers are behind NAT types that don't
 * allow direct hole-punching (symmetric NAT is the common culprit, and it's
 * exactly what most mobile carrier networks and phone WiFi hotspots use),
 * a direct connection is physically impossible without a TURN relay in the
 * middle. This module is what makes that relay available to clients.
 *
 * Two TURN credential modes are supported:
 *   1. Time-limited HMAC credentials (recommended) — set TURN_URLS +
 *      TURN_SECRET. Credentials expire after TURN_CREDENTIAL_TTL_SECONDS,
 *      following the widely-used coturn "REST API" convention, so a
 *      credential leaked from a client can't be reused indefinitely.
 *   2. Static credentials — set TURN_URLS + TURN_STATIC_USERNAME +
 *      TURN_STATIC_CREDENTIAL. Useful for a fixed-credential TURN server
 *      (e.g. a free/test relay) where HMAC isn't an option.
 * If TURN_URLS is empty, only STUN servers are returned (current default,
 * zero-infrastructure behavior — see README_DEPLOYMENT.md for how to add
 * a TURN server, including free options).
 * ------------------------------------------------------------------
 */
'use strict';

const crypto = require('crypto');

function buildIceServers(CONFIG) {
  const servers = CONFIG.STUN_URLS.map((url) => ({ urls: url }));

  if (CONFIG.TURN_URLS.length === 0) {
    return { iceServers: servers, ttlSeconds: null, turnEnabled: false };
  }

  if (CONFIG.TURN_SECRET) {
    const ttl = CONFIG.TURN_CREDENTIAL_TTL_SECONDS;
    const expiryUnixSeconds = Math.floor(Date.now() / 1000) + ttl;
    // username format `${expiry}:${label}` is the standard coturn REST API convention —
    // the TURN server itself parses the expiry back out of the username.
    const username = `${expiryUnixSeconds}:p2pshare`;
    const credential = crypto.createHmac('sha1', CONFIG.TURN_SECRET).update(username).digest('base64');
    servers.push({ urls: CONFIG.TURN_URLS, username, credential });
    return { iceServers: servers, ttlSeconds: ttl, turnEnabled: true };
  }

  if (CONFIG.TURN_STATIC_USERNAME && CONFIG.TURN_STATIC_CREDENTIAL) {
    servers.push({
      urls: CONFIG.TURN_URLS,
      username: CONFIG.TURN_STATIC_USERNAME,
      credential: CONFIG.TURN_STATIC_CREDENTIAL,
    });
    return { iceServers: servers, ttlSeconds: null, turnEnabled: true };
  }

  // TURN_URLS configured but no usable credentials — misconfiguration. Fail safe to
  // STUN-only rather than sending a broken TURN entry that would just error silently.
  return { iceServers: servers, ttlSeconds: null, turnEnabled: false };
}

module.exports = { buildIceServers };
