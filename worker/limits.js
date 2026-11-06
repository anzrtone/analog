// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * Every number that bounds what the relay can cost. These live apart from index.js because the Workers runtime treats
 * each named export of the entry module as an entrypoint and refuses to start if one is a plain value.
 *
 * The budgets are sized to stay inside R2's free allowance (10 GB-month, 1 million Class A and 10 million Class B
 * operations a month): 31,000 writes a day × 31 days plus the nightly scan is under a million, and 300,000 reads a day
 * × 31 days is under ten million. Override any of them without a code change with the LIMITS variable in wrangler.toml.
 */

export const MAX_BYTES = 20 * 1024 * 1024;
export const MIN_BYTES = 14;
export const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
export const MAX_JSON = 4096;

const GIB = 1024 * 1024 * 1024;
const MIB = 1024 * 1024;

export const DEFAULT_LIMITS = {
  /** Everything stored, at once. A hard ceiling on the storage bill; expired pairs free it up again. */
  maxStoredBytes: 9 * GIB,
  /** New bytes (first writes and growth) per UTC day, so one day of abuse cannot fill the ceiling. */
  maxNewBytesPerDay: 2 * GIB,
  /** New pairing codes per UTC day. */
  maxNewPairsPerDay: 1000,
  /** Writes to existing pairs per UTC day. Separate from new pairs, so a flood of new pairs cannot stop existing users. */
  maxSyncWritesPerDay: 25_000,
  /** Survey and install writes per UTC day. Separate again, so fake telemetry cannot stop sync. */
  maxRecordWritesPerDay: 5000,
  /** Survey and install records kept in total. */
  maxRecords: 40_000,
  /** R2 reads (GET and HEAD) per UTC day, counted in batches. */
  maxReadsPerDay: 300_000,
  /** One network's share of new bytes and new pairs per UTC day (best effort: held in memory, never stored). */
  maxNetworkNewBytesPerDay: 200 * MIB,
  maxNetworkNewPairsPerDay: 5,
};

/** How many reads an isolate gathers before it tells the ledger. */
export const READ_BATCH = 100;
/**
 * List pages /stats reads per kind of record; beyond this it reports a sample. Workers Free allows 50 subrequests a
 * request and 10 ms of CPU, so two kinds at 10 pages leaves room for the rest of the request.
 */
export const MAX_STATS_PAGES = 10;
