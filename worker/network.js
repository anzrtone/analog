// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors

/** IPv6 written out in full, as eight lowercase groups. Null for anything else. */
function expandIpv6(ip) {
  if (!ip.includes(':')) return null;
  const [head = '', tail] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const missing = tail === undefined ? 0 : 8 - left.length - right.length;
  const groups = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right];
  return groups.length === 8 ? groups.map((g) => g.padStart(4, '0')) : null;
}

/**
 * One rate-limit identity per network, not per address: a single host commonly holds a whole /64 of IPv6, and a free
 * tunnel gives anyone a /48. `narrow` is the /64 (or the IPv4 address), `wide` the /48 and null for IPv4.
 */
export function networkOf(ip) {
  if (!ip) return { narrow: 'unknown', wide: null };
  const v6 = expandIpv6(ip);
  if (!v6) return { narrow: ip, wide: null };
  return { narrow: v6.slice(0, 4).join(':'), wide: v6.slice(0, 3).join(':') };
}
