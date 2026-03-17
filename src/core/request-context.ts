import type {
  CapabilityAudience,
  RequestAudience,
  RequestContext,
  RequestScope,
  RequestSource,
} from "./types.js";

export function normalizeBrandId(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function createMarketerRequestContext(
  brandId: string,
  source: RequestSource = "api"
): RequestContext {
  return {
    audience: "marketer",
    brandId: normalizeBrandId(brandId),
    scope: "brand",
    source,
    runId: null,
    pipelineRunId: null,
  };
}

export function createAdminRequestContext(options: {
  brandId?: string | null;
  source?: RequestSource;
} = {}): RequestContext {
  const brandId = normalizeBrandId(options.brandId);

  return {
    audience: "admin",
    brandId,
    scope: brandId ? "brand" : "global",
    source: options.source ?? "admin-ui",
    runId: null,
    pipelineRunId: null,
  };
}

export function withRunId(
  requestContext: RequestContext,
  runId: string | null | undefined
): RequestContext {
  return {
    ...requestContext,
    runId: normalizeBrandId(runId),
  };
}

export function withPipelineRunId(
  requestContext: RequestContext,
  pipelineRunId: string | null | undefined
): RequestContext {
  return {
    ...requestContext,
    pipelineRunId: normalizeBrandId(pipelineRunId),
  };
}

export function isRequestContextBrandScoped(requestContext: RequestContext): boolean {
  return requestContext.scope === "brand" && Boolean(requestContext.brandId);
}

export function allowsAudience(
  audience: CapabilityAudience,
  requestAudience: RequestAudience
): boolean {
  return audience === "all" || audience === requestAudience;
}

export function normalizeScope(
  scope: RequestScope,
  brandId: string | null | undefined
): RequestScope {
  return normalizeBrandId(brandId) ? "brand" : scope === "brand" ? "global" : scope;
}
