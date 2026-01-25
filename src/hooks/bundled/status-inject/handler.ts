/**
 * Status Inject Hook
 *
 * Injects pre-fetched status data into agent context at bootstrap time.
 * This allows the agent to have system status information without
 * spending tokens to gather it during conversation.
 *
 * The status cache is written by the prefetch worker running on a timer.
 */

import fs from "node:fs";
import path from "node:path";
import type { ClawdbotConfig } from "../../../config/config.js";
import { formatStatusMarkdown } from "../../../prefetch/format-status.js";
import { DEFAULT_PREFETCH_CONFIG } from "../../../prefetch/types.js";
import type { StatusCache } from "../../../prefetch/types.js";
import { resolveHookConfig } from "../../config.js";
import { isAgentBootstrapEvent, type HookHandler } from "../../hooks.js";

const HOOK_KEY = "status-inject";
const STATUS_FILENAME = "STATUS.md";

/**
 * Read and parse the status cache file
 */
function readStatusCache(workspaceDir: string): StatusCache | undefined {
  const cachePath = path.join(workspaceDir, ".status-cache.json");
  try {
    if (!fs.existsSync(cachePath)) return undefined;
    const raw = fs.readFileSync(cachePath, "utf8");
    return JSON.parse(raw) as StatusCache;
  } catch {
    return undefined;
  }
}

/**
 * Check if the cache is stale
 */
function isCacheStale(cache: StatusCache, staleTtlMs: number): boolean {
  const age = Date.now() - new Date(cache.collectedAt).getTime();
  return age > staleTtlMs;
}

const statusInjectHook: HookHandler = async (event) => {
  if (!isAgentBootstrapEvent(event)) return;

  const context = event.context;
  const cfg = context.cfg as ClawdbotConfig | undefined;
  const hookConfig = resolveHookConfig(cfg, HOOK_KEY);

  // Check if hook is enabled
  if (!hookConfig || hookConfig.enabled === false) return;

  const workspaceDir = context.workspaceDir;
  if (!workspaceDir || !Array.isArray(context.bootstrapFiles)) return;

  // Read the status cache
  const cache = readStatusCache(workspaceDir);
  if (!cache) return;

  // Check staleness
  const staleTtlMs =
    (hookConfig as Record<string, unknown>).staleTtlMs ?? DEFAULT_PREFETCH_CONFIG.staleTtlMs;
  if (isCacheStale(cache, staleTtlMs as number)) {
    // Cache is too old, don't inject stale data
    return;
  }

  // Format as markdown
  const content = formatStatusMarkdown(cache);

  // Add to bootstrap files
  // Note: We use a unique name that won't conflict with user files
  // Type assertion needed because STATUS.md is not in the standard bootstrap file names
  context.bootstrapFiles.push({
    name: STATUS_FILENAME as unknown as (typeof context.bootstrapFiles)[number]["name"],
    path: path.join(workspaceDir, ".status-cache.json"),
    content,
    missing: false,
  });
};

export default statusInjectHook;
