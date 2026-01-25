/**
 * Prefetch Status Worker
 *
 * Collects system status data at intervals without using any AI model.
 * Data is written to a cache file and injected into agent context via bootstrap hook.
 */

import { exec as execCallback } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { saveJsonFile } from "../infra/json-file.js";
import {
  DEFAULT_PREFETCH_CONFIG,
  type EndpointStatus,
  type GitStatus,
  type PrefetchConfig,
  type ServiceStatus,
  type StatusCache,
} from "./types.js";

const exec = promisify(execCallback);

const SERVICE_ENDPOINTS: Record<string, string> = {
  n8n: "http://localhost:5678/healthz",
  openai: "https://api.openai.com/v1/models",
  anthropic: "https://api.anthropic.com/v1/messages",
  supabase: "", // Requires project-specific URL
};

/**
 * Collect git repository status
 */
async function collectGitStatus(repoPath: string): Promise<GitStatus | undefined> {
  try {
    const cwd = path.resolve(repoPath);

    // Get current branch
    const { stdout: branch } = await exec("git branch --show-current", { cwd });

    // Get uncommitted file count
    const { stdout: statusOut } = await exec("git status --porcelain", { cwd });
    const uncommitted = statusOut.trim() ? statusOut.trim().split("\n").length : 0;

    // Get ahead/behind counts
    let ahead = 0;
    let behind = 0;
    try {
      const { stdout: revList } = await exec(
        "git rev-list --left-right --count HEAD...@{upstream}",
        {
          cwd,
        },
      );
      const [a, b] = revList.trim().split(/\s+/);
      ahead = parseInt(a ?? "0", 10) || 0;
      behind = parseInt(b ?? "0", 10) || 0;
    } catch {
      // No upstream set, ignore
    }

    // Get last commit info
    let lastCommit: GitStatus["lastCommit"];
    try {
      const { stdout: logOut } = await exec('git log -1 --format="%H|%s|%ai"', { cwd });
      const [sha, message, date] = logOut.trim().split("|");
      if (sha && message && date) {
        lastCommit = {
          sha: sha.slice(0, 7),
          message: message.slice(0, 72),
          date,
        };
      }
    } catch {
      // No commits yet
    }

    return {
      branch: branch.trim(),
      uncommitted,
      behind,
      ahead,
      lastCommit,
    };
  } catch {
    return undefined;
  }
}

/**
 * Check an HTTP endpoint
 */
async function checkEndpoint(url: string, timeoutMs = 5000): Promise<EndpointStatus> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    return {
      url,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      url,
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check a known service
 */
async function checkService(name: string): Promise<ServiceStatus> {
  const endpoint = SERVICE_ENDPOINTS[name];
  if (!endpoint) {
    return { name, reachable: false, error: "No endpoint configured" };
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    // For API services, just check if we can connect (don't need auth)
    const response = await fetch(endpoint, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // 401/403 means the service is reachable but needs auth (which is fine)
    const reachable = response.ok || response.status === 401 || response.status === 403;

    return {
      name,
      reachable,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name,
      reachable: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Collect all status data
 */
export async function collectStatus(config: PrefetchConfig): Promise<StatusCache> {
  const cache: StatusCache = {
    version: 1,
    collectedAt: new Date().toISOString(),
  };

  // Collect git status
  const gitConfig = config.git ?? DEFAULT_PREFETCH_CONFIG.git;
  if (gitConfig.enabled !== false && gitConfig.repoPath) {
    cache.git = await collectGitStatus(gitConfig.repoPath);
  }

  // Check endpoints
  if (config.endpoints?.length) {
    cache.endpoints = await Promise.all(config.endpoints.map((url) => checkEndpoint(url)));
  }

  // Check services
  if (config.services?.length) {
    cache.services = await Promise.all(config.services.map((name) => checkService(name)));
  }

  return cache;
}

/**
 * Write status cache to workspace
 */
export function writeStatusCache(workspaceDir: string, cache: StatusCache): void {
  const cachePath = path.join(workspaceDir, ".status-cache.json");
  saveJsonFile(cachePath, cache);
}

/**
 * Read status cache from workspace
 */
export function readStatusCache(workspaceDir: string): StatusCache | undefined {
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
 * Check if cache is stale
 */
export function isCacheStale(cache: StatusCache, staleTtlMs: number): boolean {
  const age = Date.now() - new Date(cache.collectedAt).getTime();
  return age > staleTtlMs;
}

/**
 * Start the prefetch worker (runs on interval)
 */
export function startPrefetchWorker(params: {
  config: PrefetchConfig;
  workspaceDir: string;
  log?: { info: (msg: string) => void; error: (msg: string) => void };
}): { stop: () => void } {
  const { config, workspaceDir, log } = params;

  if (!config.enabled) {
    return { stop: () => {} };
  }

  const intervalMs = config.intervalMs ?? DEFAULT_PREFETCH_CONFIG.intervalMs;

  const runCollection = async () => {
    try {
      const cache = await collectStatus(config);
      writeStatusCache(workspaceDir, cache);
      log?.info?.("prefetch: status collected");
    } catch (err) {
      log?.error?.(`prefetch: collection failed: ${String(err)}`);
    }
  };

  // Run immediately
  void runCollection();

  // Then run on interval
  const interval = setInterval(runCollection, intervalMs);

  return {
    stop: () => clearInterval(interval),
  };
}
