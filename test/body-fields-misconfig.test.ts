import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphClient } from '../src/graph-client.js';
import { registerGraphTools } from '../src/graph-tools.js';

vi.mock('../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../src/generated/client-beta.js', () => ({ api: { endpoints: [] } }));
vi.mock('../src/generated/client.js', async () => {
  const { z } = await import('zod');
  return {
    api: {
      endpoints: [
        {
          alias: 'create-todo-task',
          method: 'post',
          path: '/me/todo/lists/:todoTaskListId/tasks',
          description: 'Create a task.',
          parameters: [
            {
              name: 'body',
              type: 'Body',
              // The real schema has a `title` field; omitting it here simulates an
              // upstream schema rename that the bodyFields allowlist no longer matches
              schema: z.object({ id: z.string().optional() }).passthrough(),
            },
          ],
        },
        {
          alias: 'list-todo-task-lists',
          method: 'get',
          path: '/me/todo/lists',
          description: 'List task lists.',
          parameters: [],
        },
      ],
    },
  };
});

describe('bodyFields misconfiguration recovery', () => {
  let mockServer: { tool: ReturnType<typeof vi.fn>; registerTool: ReturnType<typeof vi.fn> };
  let mockGraphClient: GraphClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = { tool: vi.fn(), registerTool: vi.fn() };
    mockGraphClient = {} as GraphClient;
  });

  it('skips only the misconfigured tool and registers the rest', () => {
    expect(() => registerGraphTools(mockServer, mockGraphClient)).not.toThrow();
    const registered = mockServer.registerTool.mock.calls.map((c: unknown[]) => c[0]);
    expect(registered).toContain('list-todo-task-lists');
    expect(registered).not.toContain('create-todo-task');
  });
});
