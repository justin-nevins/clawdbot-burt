/**
 * Prefetch status types
 *
 * Status data collected at intervals and injected into agent context
 * to avoid token-expensive real-time data gathering.
 */

export type GitStatus = {
  branch: string;
  uncommitted: number;
  behind: number;
  ahead: number;
  lastCommit?: {
    sha: string;
    message: string;
    date: string;
  };
};

export type EndpointStatus = {
  url: string;
  ok: boolean;
  status?: number;
  latencyMs: number;
  error?: string;
};

export type ServiceStatus = {
  name: string;
  reachable: boolean;
  latencyMs?: number;
  error?: string;
};

export type StatusCache = {
  version: 1;
  collectedAt: string; // ISO timestamp
  git?: GitStatus;
  endpoints?: EndpointStatus[];
  services?: ServiceStatus[];
};

export type PrefetchConfig = {
  enabled?: boolean;
  intervalMs?: number; // default: 60000 (1 minute)
  staleTtlMs?: number; // default: 120000 (2 minutes)
  git?: {
    enabled?: boolean;
    repoPath?: string;
  };
  endpoints?: string[]; // URLs to health-check
  services?: Array<"n8n" | "openai" | "anthropic" | "supabase">;
};

export const DEFAULT_PREFETCH_CONFIG: Required<
  Omit<PrefetchConfig, "git" | "endpoints" | "services">
> & {
  git: Required<NonNullable<PrefetchConfig["git"]>>;
} = {
  enabled: false,
  intervalMs: 60_000,
  staleTtlMs: 120_000,
  git: {
    enabled: true,
    repoPath: ".",
  },
};
