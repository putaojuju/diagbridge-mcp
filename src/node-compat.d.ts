declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exitCode?: number;
  cwd(): string;
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
};

declare class Buffer {
  static from(input: string, encoding?: string): Buffer;
  toString(encoding?: string): string;
  readonly length: number;
}

declare module "node:assert/strict" {
  const assert: any;
  export default assert;
}

declare module "node:test" {
  const test: any;
  export default test;
}

declare module "node:http" {
  export type IncomingMessage = any;
  export type ServerResponse = any;
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>): any;
}

declare module "node:fs/promises" {
  export function appendFile(path: string, data: string, encoding?: string): Promise<void>;
  export function mkdir(path: string, options?: any): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(path: string, encoding?: any): Promise<any>;
  export function readdir(path: string, options?: any): Promise<any[]>;
  export function rm(path: string, options?: any): Promise<void>;
  export function stat(path: string): Promise<any>;
  export function writeFile(path: string, data: string, encoding?: string): Promise<void>;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function join(...parts: string[]): string;
  export function normalize(path: string): string;
  export function relative(from: string, to: string): string;
  export function resolve(...parts: string[]): string;
  export const sep: string;
}

declare module "node:os" {
  export function arch(): string;
  export function freemem(): number;
  export function hostname(): string;
  export function platform(): string;
  export function release(): string;
  export function tmpdir(): string;
  export function totalmem(): number;
  export function type(): string;
  export function uptime(): number;
  export function userInfo(): { username?: string };
}

declare module "node:crypto" {
  export function randomBytes(size: number): { toString(encoding: string): string };
}

declare module "node:child_process" {
  export function spawn(command: string, args?: string[], options?: any): any;
}
