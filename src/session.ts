import { randomBytes } from "node:crypto";

export interface SessionState {
  token: string;
  connected: boolean;
  visible: true;
  startedAt: string;
  disconnectedAt?: string;
  disconnectReason?: string;
}

export type HeaderMap = Record<string, string | string[] | undefined>;

export function generateSessionToken(): string {
  return randomBytes(24).toString("base64url");
}

export function createSession(token = generateSessionToken()): SessionState {
  return {
    token,
    connected: true,
    visible: true,
    startedAt: new Date().toISOString(),
  };
}

export function getHeader(headers: HeaderMap, name: string): string | undefined {
  const value = headers[name.toLowerCase()] ?? headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function isRequestAuthorized(headers: HeaderMap, session: SessionState): boolean {
  if (!session.connected) {
    return false;
  }

  const bearer = getHeader(headers, "authorization");
  const tokenHeader = getHeader(headers, "x-diagbridge-session-token");

  if (bearer?.startsWith("Bearer ") && bearer.slice("Bearer ".length) === session.token) {
    return true;
  }

  return tokenHeader === session.token;
}

export function disconnectSession(session: SessionState, reason = "user-requested-disconnect"): SessionState {
  session.connected = false;
  session.disconnectedAt = new Date().toISOString();
  session.disconnectReason = reason;
  return session;
}
