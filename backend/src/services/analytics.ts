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
const ANALYTICS_CAPTURE_TIMEOUT_MS = 2_000;
let loggedProviderFailure = false;

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function imageSummary(imageDataUrl: string): AnalyticsProperties {
  const match = /^data:([^;,]{1,64});base64,/.exec(imageDataUrl);
  if (!match) return { input_type: 'image', image_mime: 'invalid' };

  const mimeType = match[1];
  const allowedTypes = config.image.allowedMimeTypes as readonly string[];
  const imageMime = allowedTypes.includes(mimeType) ? mimeType : 'invalid';
  const base64Length = Math.max(0, imageDataUrl.length - match[0].length);

  return {
    input_type: 'image',
    image_mime: imageMime,
    image_size_bytes: Math.floor((base64Length * 3) / 4),
  };
}

function endpointSummary(req: Request, res: Response): AnalyticsProperties {
  const body = req.body as Record<string, unknown> | undefined;
  const statusCode = res.statusCode;

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
    const requestSummary = image ? imageSummary(image) : { input_type: 'image' };
    return {
      ...requestSummary,
      ...(res.locals.analytics as AnalyticsProperties | undefined),
    };
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ANALYTICS_CAPTURE_TIMEOUT_MS);

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
    signal: controller.signal,
  }).catch((error) => {
    if (!loggedProviderFailure) {
      const message = error instanceof Error && error.name === 'AbortError'
        ? `Analytics capture timed out after ${ANALYTICS_CAPTURE_TIMEOUT_MS}ms. Continuing without analytics.`
        : 'Analytics capture failed. Continuing without analytics:';
      console.error(message, error);
      loggedProviderFailure = true;
    }
  }).finally(() => {
    clearTimeout(timeoutId);
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

  let analyticsEmitted = false;

  function emitRequestAnalytics(trigger: 'finish' | 'close') {
    if (analyticsEmitted) return;
    analyticsEmitted = true;

    requestContext.run(context, () => {
      const completed = trigger === 'finish' || res.writableEnded;
      const durationMs = Math.round(performance.now() - startedAt);
      const eventName = eventNameForPath(req.path);
      const common = {
        route: req.path,
        method: req.method,
        status_code: res.statusCode,
        duration_ms: durationMs,
        completed,
        aborted: !completed,
        user_agent_family: req.get('user-agent')?.split(/[ /]/)[0]?.slice(0, 80),
        ...endpointSummary(req, res),
      };

      if (eventName) captureAnalytics(eventName, common);
      if (res.statusCode >= 400 || !completed) captureAnalytics('api_request_failed', common);
    });
  }

  requestContext.run(context, () => {
    res.on('finish', () => emitRequestAnalytics('finish'));
    res.on('close', () => emitRequestAnalytics('close'));

    next();
  });
};
