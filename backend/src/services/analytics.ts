import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { config } from '../config/index.js';
import { hasChinese } from '../utils/chinese.js';
import { hashAnalyticsIdentifier, parseClientIdentity, type ClientIdentity } from './clientIdentity.js';

interface AnalyticsContext extends ClientIdentity {
  requestId: string;
  route: string;
  method: string;
}

type AnalyticsProperties = Record<string, unknown>;

const requestContext = new AsyncLocalStorage<AnalyticsContext>();
let loggedProviderFailure = false;

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function imageSummary(imageDataUrl: string): AnalyticsProperties {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(imageDataUrl);
  if (!match) return { input_type: 'image' };

  return {
    input_type: 'image',
    image_mime: match[1],
    image_size_bytes: Math.floor((match[2].length * 3) / 4),
  };
}

function endpointSummary(req: Request, statusCode: number): AnalyticsProperties {
  const body = req.body as Record<string, unknown> | undefined;

  if (req.path === '/parse') {
    const image = safeString(body?.image);
    if (image) return imageSummary(image);

    const sentence = safeString(body?.sentence) ?? '';
    const context = safeString(body?.context) ?? '';
    return {
      input_type: 'text',
      text_length: sentence.length,
      context_length: context.length,
      has_chinese: hasChinese(sentence),
    };
  }

  if (req.path === '/ocr') {
    const image = safeString(body?.image);
    return image ? imageSummary(image) : { input_type: 'image' };
  }

  if (req.path === '/definitionLookup') {
    const token = safeString(body?.token) ?? '';
    return {
      token_length: token.trim().length,
      token_hash: token.trim() ? hashAnalyticsIdentifier(token.trim()) : undefined,
      found: statusCode >= 200 && statusCode < 300,
    };
  }

  return {};
}

function eventNameForPath(path: string): string | null {
  if (path === '/parse') return 'api_parse_completed';
  if (path === '/ocr') return 'api_ocr_completed';
  if (path === '/definitionLookup') return 'api_lookup_completed';
  return null;
}

export function getAnalyticsContext(): AnalyticsContext | undefined {
  return requestContext.getStore();
}

export function captureAnalytics(event: string, properties: AnalyticsProperties = {}): void {
  if (!config.analytics.enabled || !config.analytics.posthogKey) return;

  const context = getAnalyticsContext();
  const contextProperties = context ? {
    request_id: context.requestId,
    route: context.route,
    method: context.method,
    client_type: context.clientType,
    client_version: context.clientVersion,
    feature: context.feature,
    client_id_hash: context.clientIdHash,
    ip_hash: context.ipHash,
  } : {};

  const distinctId = context?.clientIdHash ?? context?.ipHash ?? 'anonymous';

  void fetch(`${config.analytics.posthogHost.replace(/\/$/, '')}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.analytics.posthogKey,
      event,
      distinct_id: distinctId,
      properties: {
        ...contextProperties,
        ...properties,
      },
    }),
  }).catch((error) => {
    if (!loggedProviderFailure) {
      console.error('Analytics capture failed. Continuing without analytics:', error);
      loggedProviderFailure = true;
    }
  });
}

export const requestAnalyticsMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (!['/parse', '/ocr', '/definitionLookup'].includes(req.path)) {
    next();
    return;
  }

  const startedAt = performance.now();
  const identity = parseClientIdentity(req);
  const context: AnalyticsContext = {
    ...identity,
    requestId: randomUUID(),
    route: req.path,
    method: req.method,
  };

  requestContext.run(context, () => {
    res.on('finish', () => {
      requestContext.run(context, () => {
        const durationMs = Math.round(performance.now() - startedAt);
        const eventName = eventNameForPath(req.path);
        const common = {
          route: req.path,
          method: req.method,
          status_code: res.statusCode,
          duration_ms: durationMs,
          user_agent_family: req.get('user-agent')?.split(/[ /]/)[0]?.slice(0, 80),
          ...endpointSummary(req, res.statusCode),
        };

        if (eventName) captureAnalytics(eventName, common);
        if (res.statusCode >= 500) captureAnalytics('api_request_failed', common);
      });
    });

    next();
  });
};
