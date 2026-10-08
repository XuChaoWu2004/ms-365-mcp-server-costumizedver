import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type AuthManager from '../src/auth.js';
import { registerAuthTools } from '../src/auth-tools.js';

type RegisterAuthTools = (
  server: McpServer,
  authManager: AuthManager,
  isToolEnabled?: (toolName: string) => boolean
) => void;

const AUTH_TOOL_NAMES = [
  'login',
  'logout',
  'verify-login',
  'list-accounts',
  'select-account',
  'remove-account',
];

function registerWith(predicate?: (toolName: string) => boolean) {
  const server = { tool: vi.fn() };
  (registerAuthTools as unknown as RegisterAuthTools)(
    server as unknown as McpServer,
    {} as AuthManager,
    predicate
  );
  return server;
}

describe('registerAuthTools filtering', () => {
  it('registers all six auth tools when no predicate is given', () => {
    const server = registerWith();
    expect(server.tool.mock.calls.map((c: unknown[]) => c[0])).toEqual(AUTH_TOOL_NAMES);
  });

  it('skips auth tools the predicate rejects', () => {
    const server = registerWith((name) => /^(list-todo-task-lists|create-todo-task)$/i.test(name));
    expect(server.tool).not.toHaveBeenCalled();
  });

  it('keeps only matching auth tools', () => {
    const server = registerWith((name) => /^(verify-login|create-todo-task)$/i.test(name));
    expect(server.tool.mock.calls.map((c: unknown[]) => c[0])).toEqual(['verify-login']);
  });

  it('forwards all arguments unchanged', () => {
    const server = registerWith();
    const loginCall = server.tool.mock.calls.find((c: unknown[]) => c[0] === 'login');
    expect(loginCall).toBeDefined();
    expect(loginCall![1]).toBe('Authenticate with Microsoft account');
    expect(typeof loginCall![3]).toBe('function');
  });
});
