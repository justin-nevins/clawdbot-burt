/**
 * Quota Tracker - Rolling Window Token Usage
 *
 * Tracks Claude Pro token usage in a rolling window (default 5 hours)
 * and provides proactive model switching when approaching the threshold.
 *
 * Design:
 * - Timer-based checks (every 5 min) to minimize per-request overhead
 * - Simple flag check at request time (no calculation)
 * - Append-only usage log for fast writes
 * - Automatic cleanup of expired entries
 */

import path from "node:path";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";

// ============================================================================
// Types
// ============================================================================

export type QuotaEntry = {
  ts: number; // timestamp ms
  input: number; // input tokens
  output: number; // output tokens
  provider?: string; // optional provider identifier
};

export type QuotaStore = {
  version: 1;
  entries: QuotaEntry[];
  useFallback: boolean; // flag checked at request time
  fallbackUntil?: number; // ms timestamp when fallback expires
  lastCheckAt?: number; // last time we checked the window
};

export type QuotaConfig = {
  enabled?: boolean;
  windowHours?: number; // default: 5
  thresholdTokens?: number; // default: 150000
  switchRatio?: number; // default: 0.8 (switch at 80%)
  cooldownMinutes?: number; // default: 60 (stay on fallback for 1 hour minimum)
  checkIntervalMs?: number; // default: 300000 (5 minutes)
  provider?: string; // provider to track (default: "anthropic")
};

export const DEFAULT_QUOTA_CONFIG: Required<QuotaConfig> = {
  enabled: false,
  windowHours: 5,
  thresholdTokens: 150_000,
  switchRatio: 0.8,
  cooldownMinutes: 60,
  checkIntervalMs: 300_000, // 5 minutes
  provider: "anthropic",
};

const QUOTA_STORE_FILENAME = "quota-tracker.json";

// ============================================================================
// Store Management
// ============================================================================

function getStorePath(clawdbotDir: string): string {
  return path.join(clawdbotDir, QUOTA_STORE_FILENAME);
}

function loadStore(clawdbotDir: string): QuotaStore {
  const storePath = getStorePath(clawdbotDir);
  const raw = loadJsonFile(storePath) as QuotaStore | undefined;

  if (!raw || raw.version !== 1) {
    return {
      version: 1,
      entries: [],
      useFallback: false,
    };
  }

  return raw;
}

function saveStore(clawdbotDir: string, store: QuotaStore): void {
  const storePath = getStorePath(clawdbotDir);
  saveJsonFile(storePath, store);
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Record token usage after a successful API call
 */
export function recordUsage(params: {
  clawdbotDir: string;
  input: number;
  output: number;
  provider?: string;
}): void {
  const store = loadStore(params.clawdbotDir);

  store.entries.push({
    ts: Date.now(),
    input: params.input,
    output: params.output,
    provider: params.provider,
  });

  saveStore(params.clawdbotDir, store);
}

/**
 * Get total tokens in the rolling window
 */
export function getWindowUsage(params: {
  clawdbotDir: string;
  windowMs: number;
  provider?: string;
}): number {
  const store = loadStore(params.clawdbotDir);
  const cutoff = Date.now() - params.windowMs;

  let total = 0;
  for (const entry of store.entries) {
    if (entry.ts >= cutoff) {
      // Optionally filter by provider
      if (!params.provider || entry.provider === params.provider) {
        total += (entry.input ?? 0) + (entry.output ?? 0);
      }
    }
  }

  return total;
}

/**
 * Check if we should use the fallback model (fast flag check)
 */
export function shouldUseFallback(clawdbotDir: string): boolean {
  const store = loadStore(clawdbotDir);

  // Check if fallback has expired
  if (store.fallbackUntil && Date.now() >= store.fallbackUntil) {
    // Fallback period has expired, clear it
    store.useFallback = false;
    store.fallbackUntil = undefined;
    saveStore(clawdbotDir, store);
    return false;
  }

  return store.useFallback;
}

/**
 * Set the fallback flag (called when threshold is exceeded)
 */
export function setFallbackFlag(params: {
  clawdbotDir: string;
  useFallback: boolean;
  cooldownMs?: number;
}): void {
  const store = loadStore(params.clawdbotDir);

  store.useFallback = params.useFallback;

  if (params.useFallback && params.cooldownMs) {
    store.fallbackUntil = Date.now() + params.cooldownMs;
  } else if (!params.useFallback) {
    store.fallbackUntil = undefined;
  }

  saveStore(params.clawdbotDir, store);
}

/**
 * Cleanup expired entries from the store
 */
export function cleanupExpiredEntries(params: { clawdbotDir: string; windowMs: number }): number {
  const store = loadStore(params.clawdbotDir);
  const cutoff = Date.now() - params.windowMs;

  const before = store.entries.length;
  store.entries = store.entries.filter((e) => e.ts >= cutoff);
  const removed = before - store.entries.length;

  if (removed > 0) {
    saveStore(params.clawdbotDir, store);
  }

  return removed;
}

/**
 * Perform a quota check (called on timer)
 *
 * This is the main check that runs every 5 minutes.
 * It calculates window usage and sets/clears the fallback flag.
 */
export function performQuotaCheck(params: {
  clawdbotDir: string;
  config: QuotaConfig;
  log?: { info: (msg: string) => void };
}): { useFallback: boolean; usage: number; threshold: number } {
  const config = { ...DEFAULT_QUOTA_CONFIG, ...params.config };
  const windowMs = config.windowHours * 60 * 60 * 1000;
  const threshold = config.thresholdTokens * config.switchRatio;
  const cooldownMs = config.cooldownMinutes * 60 * 1000;

  // Cleanup old entries first
  cleanupExpiredEntries({
    clawdbotDir: params.clawdbotDir,
    windowMs,
  });

  // Calculate current usage
  const usage = getWindowUsage({
    clawdbotDir: params.clawdbotDir,
    windowMs,
    provider: config.provider,
  });

  const store = loadStore(params.clawdbotDir);
  const wasUsingFallback = store.useFallback;

  // Decide if we should switch
  if (usage >= threshold && !wasUsingFallback) {
    // Over threshold - switch to fallback
    setFallbackFlag({
      clawdbotDir: params.clawdbotDir,
      useFallback: true,
      cooldownMs,
    });
    params.log?.info(
      `quota: switching to fallback (${usage.toLocaleString()}/${threshold.toLocaleString()} tokens)`,
    );
    return { useFallback: true, usage, threshold };
  }

  if (usage < threshold * 0.5 && wasUsingFallback) {
    // Usage dropped below 50% - safe to switch back (unless cooldown active)
    const currentStore = loadStore(params.clawdbotDir);
    if (!currentStore.fallbackUntil || Date.now() >= currentStore.fallbackUntil) {
      setFallbackFlag({
        clawdbotDir: params.clawdbotDir,
        useFallback: false,
      });
      params.log?.info(
        `quota: returning to primary (${usage.toLocaleString()}/${threshold.toLocaleString()} tokens)`,
      );
      return { useFallback: false, usage, threshold };
    }
  }

  // Update lastCheckAt
  store.lastCheckAt = Date.now();
  saveStore(params.clawdbotDir, store);

  return { useFallback: store.useFallback, usage, threshold };
}

// ============================================================================
// Timer-Based Worker
// ============================================================================

/**
 * Start the quota check worker (runs on interval)
 */
export function startQuotaWorker(params: {
  clawdbotDir: string;
  config: QuotaConfig;
  log?: { info: (msg: string) => void; error: (msg: string) => void };
}): { stop: () => void } {
  const config = { ...DEFAULT_QUOTA_CONFIG, ...params.config };

  if (!config.enabled) {
    return { stop: () => {} };
  }

  const runCheck = () => {
    try {
      performQuotaCheck({
        clawdbotDir: params.clawdbotDir,
        config,
        log: params.log,
      });
    } catch (err) {
      params.log?.error?.(`quota: check failed: ${String(err)}`);
    }
  };

  // Run immediately
  runCheck();

  // Then run on interval
  const interval = setInterval(runCheck, config.checkIntervalMs);

  return {
    stop: () => clearInterval(interval),
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the current quota status for display
 */
export function getQuotaStatus(params: { clawdbotDir: string; config: QuotaConfig }): {
  enabled: boolean;
  useFallback: boolean;
  usage: number;
  threshold: number;
  windowHours: number;
  fallbackUntil?: Date;
} {
  const config = { ...DEFAULT_QUOTA_CONFIG, ...params.config };
  const windowMs = config.windowHours * 60 * 60 * 1000;
  const threshold = config.thresholdTokens * config.switchRatio;

  const store = loadStore(params.clawdbotDir);
  const usage = getWindowUsage({
    clawdbotDir: params.clawdbotDir,
    windowMs,
    provider: config.provider,
  });

  return {
    enabled: config.enabled,
    useFallback: store.useFallback,
    usage,
    threshold,
    windowHours: config.windowHours,
    fallbackUntil: store.fallbackUntil ? new Date(store.fallbackUntil) : undefined,
  };
}
