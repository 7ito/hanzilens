import { createHash, createHmac } from 'node:crypto';
import type { Request } from 'express';
import { config } from '../config/index.js';

export const CLIENT_ID_HEADER = 'x-hanzilens-client-id';
export const CLIENT_TYPE_HEADER = 'x-hanzilens-client';
export const CLIENT_VERSION_HEADER = 'x-hanzilens-client-version';
export const CLIENT_FEATURE_HEADER = 'x-hanzilens-feature';

export interface ClientIdentity {
  clientType: string;
  clientVersion?: string;
  feature?: string;
  clientIdHash?: string;
  ipHash?: string;
}

export function sanitizeHeaderIdentifier(value: string | undefined, minLength = 1): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length < minLength || trimmed.length > 128) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) return null;
  return trimmed;
}

export function hashAnalyticsIdentifier(value: string): string {
  const secret = config.analytics.hashSecret;
  const digest = secret
    ? createHmac('sha256', secret).update(value).digest('hex')
    : createHash('sha256').update(value).digest('hex');
  return digest.slice(0, 32);
}

export function getRequestIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function getRawClientIdentifier(req: Request): string | null {
  const clientId = sanitizeHeaderIdentifier(req.get(CLIENT_ID_HEADER), 8);
  if (!clientId) return null;

  const clientType = sanitizeHeaderIdentifier(req.get(CLIENT_TYPE_HEADER), 1) || 'unknown';
  return `${clientType}:${clientId}`;
}

export function parseClientIdentity(req: Request): ClientIdentity {
  const clientType = sanitizeHeaderIdentifier(req.get(CLIENT_TYPE_HEADER), 1) || 'unknown';
  const clientVersion = sanitizeHeaderIdentifier(req.get(CLIENT_VERSION_HEADER), 1) || undefined;
  const feature = sanitizeHeaderIdentifier(req.get(CLIENT_FEATURE_HEADER), 1) || undefined;
  const rawClientId = sanitizeHeaderIdentifier(req.get(CLIENT_ID_HEADER), 8);
  const ip = getRequestIp(req);

  return {
    clientType,
    clientVersion,
    feature,
    clientIdHash: rawClientId ? hashAnalyticsIdentifier(`${clientType}:${rawClientId}`) : undefined,
    ipHash: ip ? hashAnalyticsIdentifier(ip) : undefined,
  };
}
