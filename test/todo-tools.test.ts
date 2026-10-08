import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
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
              schema: z
                .object({
                  id: z.string().optional(),
                  createdDateTime: z.string().optional(),
                  title: z.string().nullish(),
                  body: z
                    .object({
                      contentType: z.string().optional(),
                      content: z.string().nullish(),
                    })
                    .nullish(),
                  dueDateTime: z.any().nullish(),
                  reminderDateTime: z.any().nullish(),
                  isReminderOn: z.boolean().nullish(),
                  importance: z.string().nullish(),
                  categories: z.array(z.string()).nullish(),
                  recurrence: z.any().nullish(),
                  attachments: z.array(z.any()).nullish(),
                  extensions: z.array(z.any()).nullish(),
                  checklistItems: z.array(z.any()).nullish(),
                  linkedResources: z.array(z.any()).nullish(),
                })
                .passthrough(),
            },
          ],
        },
        {
          alias: 'create-todo-checklist-item',
          method: 'post',
          path: '/me/todo/lists/:todoTaskListId/tasks/:todoTaskId/checklistItems',
          description: 'Create a checklistItem.',
          parameters: [
            {
              name: 'body',
              type: 'Body',
              schema: z
                .object({
                  id: z.string().optional(),
                  createdDateTime: z.string().optional(),
                  checkedDateTime: z.string().optional(),
                  displayName: z.string().nullish(),
                  isChecked: z.boolean().nullish(),
                })
                .passthrough(),
            },
          ],
        },
        {
          alias: 'create-todo-linked-resource',
          method: 'post',
          path: '/me/todo/lists/:todoTaskListId/tasks/:todoTaskId/linkedResources',
          description: 'Create a linkedResource.',
          parameters: [
            {
              name: 'body',
              type: 'Body',
              schema: z
                .object({
                  id: z.string().optional(),
                  webUrl: z.string().nullish(),
                  displayName: z.string().nullish(),
                })
                .passthrough(),
            },
          ],
        },
      ],
    },
  };
});

const CREATE_TODO_TASK_ALLOWLIST = [
  'title',
  'body',
  'dueDateTime',
  'reminderDateTime',
  'isReminderOn',
  'importance',
  'categories',
  'recurrence',
  'checklistItems',
  'linkedResources',
];

describe('bodyFields allowlist enforcement for To Do create tools', () => {
  let mockServer: { tool: ReturnType<typeof vi.fn>; registerTool: ReturnType<typeof vi.fn> };
  let mockGraphClient: GraphClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = { tool: vi.fn(), registerTool: vi.fn() };
    mockGraphClient = {
      graphRequest: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ id: 'task-1' }) }],
      }),
    } as unknown as GraphClient;
  });

  afterEach(() => {
    delete process.env.MS365_MCP_REQUIRE_CONFIRM;
  });

  function register() {
    registerGraphTools(mockServer, mockGraphClient);
    const calls = mockServer.registerTool.mock.calls;
    return {
      handler(toolName: string) {
        const call = calls.find((c: unknown[]) => c[0] === toolName);
        expect(call).toBeDefined();
        return call![call!.length - 1] as (params: Record<string, unknown>) => Promise<unknown>;
      },
      inputSchema(toolName: string) {
        const call = calls.find((c: unknown[]) => c[0] === toolName);
        expect(call).toBeDefined();
        return (call![1] as { inputSchema: z.ZodTypeAny }).inputSchema;
      },
    };
  }

  it('advertises only bodyFields in the create-todo-task body schema', () => {
    const { inputSchema } = register();
    const bodyJson = zodToJsonSchema(inputSchema('create-todo-task')) as {
      properties: { body: { properties: Record<string, unknown> } };
    };
    expect(Object.keys(bodyJson.properties.body.properties).sort()).toEqual(
      [...CREATE_TODO_TASK_ALLOWLIST].sort()
    );
  });

  it('rejects a nested read-only field without calling Graph', async () => {
    const { handler } = register();
    const result = await handler('create-todo-task')({
      todoTaskListId: 'L',
      body: { title: 'x', id: 'a' },
    });
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(result.isError).toBe(true);
    expect(parsed.error).toBe('body_fields_not_allowed');
    expect(parsed.disallowed).toEqual(['id']);
    expect(mockGraphClient.graphRequest).not.toHaveBeenCalled();
  });

  it('rejects a flattened disallowed field', async () => {
    const { handler } = register();
    const result = await handler('create-todo-task')({
      todoTaskListId: 'L',
      title: 'x',
      attachments: [],
    });
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(result.isError).toBe(true);
    expect(parsed.disallowed).toEqual(['attachments']);
  });

  it('rejects a stringified body with a disallowed field', async () => {
    const { handler } = register();
    const result = await handler('create-todo-task')({
      todoTaskListId: 'L',
      body: JSON.stringify({ title: 'x', extensions: [] }),
    });
    expect(result.isError).toBe(true);
  });

  it('sends an allowed body unchanged', async () => {
    const { handler } = register();
    const body = {
      title: 'x',
      body: { contentType: 'text', content: 'n' },
      checklistItems: [{ displayName: 's1' }],
    };
    await handler('create-todo-task')({ todoTaskListId: 'L', body });
    expect(mockGraphClient.graphRequest).toHaveBeenCalledTimes(1);
    const options = (mockGraphClient.graphRequest as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
      body: string;
    };
    expect(JSON.parse(options.body)).toEqual(body);
  });

  it('checklist item tool rejects createdDateTime', async () => {
    const { handler } = register();
    const result = await handler('create-todo-checklist-item')({
      todoTaskListId: 'L',
      todoTaskId: 'T',
      body: { displayName: 's', createdDateTime: '2026-01-01T00:00:00Z' },
    });
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(result.isError).toBe(true);
    expect(parsed.disallowed).toEqual(['createdDateTime']);
  });

  it('tools without bodyFields are unaffected', async () => {
    const { handler } = register();
    await handler('create-todo-linked-resource')({
      todoTaskListId: 'L',
      todoTaskId: 'T',
      body: { webUrl: 'https://a', id: 'x' },
    });
    expect(mockGraphClient.graphRequest).toHaveBeenCalled();
  });

  it('confirm gate still runs first', async () => {
    process.env.MS365_MCP_REQUIRE_CONFIRM = 'true';
    const { handler } = register();
    const result = await handler('create-todo-task')({
      todoTaskListId: 'L',
      body: { title: 'x', id: 'a' },
    });
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.error).toBe('confirmation_required');
  });
});
