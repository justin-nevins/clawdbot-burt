/**
 * Format Status Cache as Markdown
 *
 * Converts the JSON status cache into a human-readable markdown format
 * suitable for injection into agent context.
 */

import type { StatusCache } from "./types.js";

/**
 * Format a relative time string (e.g., "2 hours ago")
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/**
 * Format the status cache as markdown for injection into agent context
 */
export function formatStatusMarkdown(cache: StatusCache): string {
  const lines: string[] = [];
  const timestamp =
    new Date(cache.collectedAt).toISOString().replace("T", " ").slice(0, 19) + " UTC";

  lines.push(`# System Status (${timestamp})`);
  lines.push("");

  // Git status
  if (cache.git) {
    const { branch, uncommitted, behind, ahead, lastCommit } = cache.git;

    lines.push("## Git Repository");

    // Status line
    const statusParts: string[] = [`Branch: \`${branch}\``];
    if (uncommitted > 0) {
      statusParts.push(`${uncommitted} uncommitted`);
    }
    if (behind > 0) {
      statusParts.push(`${behind} behind origin`);
    }
    if (ahead > 0) {
      statusParts.push(`${ahead} ahead of origin`);
    }
    if (uncommitted === 0 && behind === 0 && ahead === 0) {
      statusParts.push("in sync");
    }

    lines.push(`- ${statusParts.join(" | ")}`);

    // Last commit
    if (lastCommit) {
      const relTime = formatRelativeTime(lastCommit.date);
      lines.push(`- Last: \`${lastCommit.sha}\` "${lastCommit.message}" (${relTime})`);
    }

    lines.push("");
  }

  // Services status
  if (cache.services?.length) {
    lines.push("## Services");
    for (const svc of cache.services) {
      const status = svc.reachable ? "OK" : "DOWN";
      const latency = svc.latencyMs !== undefined ? ` (${svc.latencyMs}ms)` : "";
      const error = !svc.reachable && svc.error ? ` - ${svc.error}` : "";
      lines.push(`- ${svc.name}: ${status}${latency}${error}`);
    }
    lines.push("");
  }

  // Endpoints status
  if (cache.endpoints?.length) {
    lines.push("## Endpoints");
    for (const ep of cache.endpoints) {
      const status = ep.ok ? "OK" : ep.status ? `${ep.status}` : "FAIL";
      const latency = ` (${ep.latencyMs}ms)`;
      const error = !ep.ok && ep.error ? ` - ${ep.error}` : "";
      // Truncate long URLs
      const shortUrl = ep.url.length > 50 ? `${ep.url.slice(0, 47)}...` : ep.url;
      lines.push(`- ${shortUrl}: ${status}${latency}${error}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
