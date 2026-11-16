import { parseLlmsEvidence } from '../../src/js/resume-search.mjs';
import { createWebMcpTools, WEBMCP_TOOL_NAMES } from '../../src/js/webmcp-tools.mjs';
import { buildCommandMenuConfig } from './site-config.mjs';

export const EXPECTED_WEBMCP_TOOLS = [...WEBMCP_TOOL_NAMES];
export const MAX_WEBMCP_JS_BYTES = 12 * 1024;

const READ_ONLY_TOOLS = new Set(['search_resume', 'get_resume_section', 'get_quality_telemetry']);
const TOOL_NAME_RE = /^[A-Za-z0-9_.-]{1,30}$/;

function validateToolSchema(schema) {
  const issues = [];
  if (!schema || typeof schema !== 'object' || schema.type !== 'object') {
    issues.push('inputSchema.type must be "object"');
    return issues;
  }
  if (schema.additionalProperties !== false) {
    issues.push('inputSchema.additionalProperties must be false');
  }
  const props = schema.properties;
  if (!props || typeof props !== 'object') {
    issues.push('inputSchema.properties must be an object');
    return issues;
  }
  for (const [key, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== 'object' || !prop.type) {
      issues.push(`property "${key}" invalid or missing type`);
      continue;
    }
    if (
      typeof prop.description !== 'string' ||
      !prop.description.trim() ||
      prop.description.length > 150
    ) {
      issues.push(`property "${key}" description must be 1..150 chars`);
    }
    if (prop.enum !== undefined && (!Array.isArray(prop.enum) || prop.enum.length === 0)) {
      issues.push(`property "${key}" enum must be a non-empty array`);
    }
  }
  if (Array.isArray(schema.required)) {
    for (const reqKey of schema.required) {
      if (!(reqKey in props)) {
        issues.push(`required property "${reqKey}" missing from properties`);
      }
    }
  }
  return issues;
}

export function toCompactSiteConfig(resume) {
  const cfg = buildCommandMenuConfig(resume || {});
  const ep = cfg.endpoints;
  return {
    email: cfg.email,
    host: cfg.host,
    siteUrl: cfg.siteUrl,
    toggleEvent: cfg.toggleEvent,
    profiles: cfg.profiles.map((p) => [p.network, p.display, p.url]),
    sections: cfg.sections.map((s) => [s.id, s.title, s.extras]),
    ep: [
      ep.resumePdf,
      ep.resumeJson,
      ep.contactVcf,
      ep.contactVcfFilename,
      ep.architecture,
      ep.quality,
      ep.qualityJson,
      ep.llmsTxt,
      ep.blog,
      ep.feed,
    ],
  };
}

export function evaluateWebmcpReadiness({
  resume,
  llmsTxt = '',
  webmcpJsBytes = null,
  maxWebmcpBytes = MAX_WEBMCP_JS_BYTES,
  toolsOverride = null,
} = {}) {
  const siteConfig = toCompactSiteConfig(resume);
  const tools =
    toolsOverride ??
    createWebMcpTools({
      siteConfig,
      env: {},
    });

  const llmsEvidence = llmsTxt ? parseLlmsEvidence(String(llmsTxt)) : [];
  const hasLlmsEvidence = llmsEvidence.length > 0;
  const hasSections = siteConfig.sections.length > 0;

  let readOnlyToolCount = 0;
  let interactiveToolCount = 0;
  let maxDescriptionLength = 0;

  const toolResults = tools.map((tool) => {
    const issues = [];
    const name = String(tool?.name || '');
    if (!TOOL_NAME_RE.test(name) || !EXPECTED_WEBMCP_TOOLS.includes(name)) {
      issues.push('invalid or unexpected tool name');
    }
    if (typeof tool?.title !== 'string' || !tool.title.trim()) {
      issues.push('missing title');
    }
    const descLen = typeof tool?.description === 'string' ? tool.description.trim().length : 0;
    if (descLen === 0 || descLen > 500) {
      issues.push('description must be 1..500 chars');
    }
    if (descLen > maxDescriptionLength) {
      maxDescriptionLength = descLen;
    }

    const ann = tool?.annotations;
    const expectedReadOnly = READ_ONLY_TOOLS.has(name);
    if (
      ann?.readOnlyHint !== expectedReadOnly ||
      ann?.consequentialHint !== false ||
      ann?.untrustedContentHint !== false
    ) {
      issues.push('invalid tool annotations');
    }
    if (typeof tool?.execute !== 'function') {
      issues.push('execute must be a function');
    }

    const schemaIssues = validateToolSchema(tool?.inputSchema);
    issues.push(...schemaIssues);

    if (expectedReadOnly) readOnlyToolCount += 1;
    else interactiveToolCount += 1;

    return {
      name,
      readOnly: Boolean(ann?.readOnlyHint),
      descriptionLength: descLen,
      schemaValid: schemaIssues.length === 0,
      passed: issues.length === 0,
      issues,
    };
  });

  const exactToolSetMatch =
    tools.length === EXPECTED_WEBMCP_TOOLS.length &&
    EXPECTED_WEBMCP_TOOLS.every((name) => toolResults.some((t) => t.name === name && t.passed));

  const withinByteBudget =
    webmcpJsBytes == null ||
    (typeof webmcpJsBytes === 'number' && webmcpJsBytes > 0 && webmcpJsBytes <= maxWebmcpBytes);

  const contractPassCount = toolResults.filter((t) => t.passed).length;
  const passed =
    Boolean(resume && typeof resume === 'object') &&
    hasSections &&
    hasLlmsEvidence &&
    exactToolSetMatch &&
    contractPassCount === EXPECTED_WEBMCP_TOOLS.length &&
    withinByteBudget;

  return {
    passed,
    toolCount: tools.length,
    expectedToolCount: EXPECTED_WEBMCP_TOOLS.length,
    contractPassCount,
    readOnlyToolCount,
    interactiveToolCount,
    maxDescriptionLength,
    hasLlmsEvidence,
    evidenceCount: llmsEvidence.length,
    webmcpJsBytes,
    maxWebmcpBytes,
    withinByteBudget,
    tools: toolResults,
  };
}
