import { randomBytes } from "node:crypto";

export type SessionLifecycleState = "stopped" | "waiting" | "connected";

export interface SessionState {
  token?: string;
  state: SessionLifecycleState;
  connected: boolean;
  visible: true;
  startedAt?: string;
  expiresAt?: string;
  disconnectedAt?: string;
  disconnectReason?: string;
}

export type HeaderMap = Record<string, string | string[] | undefined>;

export function generateSessionToken(): string {
  return randomBytes(24).toString("base64url");
}

export function createStoppedSession(): SessionState {
  return {
    state: "stopped",
    connected: false,
    visible: true,
  };
}

export function createSession(token = generateSessionToken(), state: SessionLifecycleState = "waiting"): SessionState {
  return {
    token,
    state,
    connected: state === "connected",
    visible: true,
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

export function startSession(
  session: SessionState,
  token = generateSessionToken(),
  durationMinutes = 60,
): SessionState {
  session.token = token;
  session.state = "waiting";
  session.connected = false;
  session.startedAt = new Date().toISOString();
  session.expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
  session.disconnectedAt = undefined;
  session.disconnectReason = undefined;
  return session;
}

export function stopSession(
  session: SessionState,
  reason = "user-requested-disconnect",
): SessionState {
  session.token = undefined;
  session.state = "stopped";
  session.connected = false;
  session.disconnectedAt = new Date().toISOString();
  session.disconnectReason = reason;
  return session;
}

export const disconnectSession = stopSession;

export function getHeader(headers: HeaderMap, name: string): string | undefined {
  const value = headers[name.toLowerCase()] ?? headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function isRequestAuthorized(headers: HeaderMap, session: SessionState): boolean {
  if (session.state === "stopped" || !session.token) {
    return false;
  }

  const bearer = getHeader(headers, "authorization");
  const tokenHeader = getHeader(headers, "x-diagbridge-session-token");

  const matchBearer = bearer?.startsWith("Bearer ") && bearer.slice("Bearer ".length) === session.token;
  const matchHeader = tokenHeader === session.token;

  if (matchBearer || matchHeader) {
    if (session.state === "waiting") {
      session.state = "connected";
      session.connected = true;
    }
    return true;
  }

  return false;
}

export function isRemoteMcpRequestAuthorized(
  headers: HeaderMap,
  session: SessionState,
  devNoAuth = false,
): boolean {
  if (session.state === "stopped") {
    return false;
  }

  if (devNoAuth) {
    if (session.state === "waiting") {
      session.state = "connected";
      session.connected = true;
    }
    return true;
  }

  return isRequestAuthorized(headers, session);
}

/** @deprecated Use isRemoteMcpRequestAuthorized */
export const isHttpConnectorRequestAuthorized = isRemoteMcpRequestAuthorized;
