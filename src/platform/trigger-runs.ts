export interface TriggerRunSummary {
  total: number;
  byStatus: Record<string, number>;
  latest: Array<{
    id: string;
    status: string;
    taskIdentifier: string | null;
    createdAt: string | null;
    finishedAt: string | null;
  }>;
}

function getTriggerApiUrl(): string {
  return process.env.TRIGGER_API_URL ?? "http://localhost:3040";
}

function getTriggerSecretKey(): string {
  const secretKey = process.env.TRIGGER_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("TRIGGER_SECRET_KEY not set");
  }
  return secretKey;
}

export async function retrieveTriggerRun(runId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${getTriggerApiUrl()}/api/v3/runs/${runId}`, {
    headers: { Authorization: `Bearer ${getTriggerSecretKey()}` },
  });

  if (!res.ok) {
    throw new Error(`Trigger API returned ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

export async function fetchTriggerRunSummary(limit: number): Promise<TriggerRunSummary> {
  const secretKey = process.env.TRIGGER_SECRET_KEY?.trim();
  if (!secretKey) {
    return {
      total: 0,
      byStatus: {},
      latest: [],
    };
  }

  const query = new URLSearchParams();
  query.set("page[size]", String(limit));

  const response = await fetch(`${getTriggerApiUrl()}/api/v1/runs?${query.toString()}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });

  if (!response.ok) {
    throw new Error(`Trigger run summary fetch failed: ${response.status}`);
  }

  const body = (await response.json()) as Record<string, unknown>;
  const runs = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.runs)
      ? body.runs
      : [];

  const byStatus: Record<string, number> = {};
  for (const run of runs) {
    const item = run as Record<string, unknown>;
    const status =
      typeof item.status === "string" && item.status.length > 0
        ? item.status
        : "unknown";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return {
    total: runs.length,
    byStatus,
    latest: runs.slice(0, limit).map((run) => {
      const item = run as Record<string, unknown>;
      return {
        id: String(item.id ?? ""),
        status: String(item.status ?? "unknown"),
        taskIdentifier:
          typeof item.taskIdentifier === "string"
            ? item.taskIdentifier
            : typeof item.taskSlug === "string"
              ? item.taskSlug
              : null,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
        finishedAt: typeof item.finishedAt === "string" ? item.finishedAt : null,
      };
    }),
  };
}
