/**
 * Prefetch Module
 *
 * Collects system status data at intervals and injects it into agent context.
 * Zero token cost - data is collected via shell commands and HTTP, not AI.
 */

export * from "./types.js";
export * from "./status-worker.js";
export * from "./format-status.js";
