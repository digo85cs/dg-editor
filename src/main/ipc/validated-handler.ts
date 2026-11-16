import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { z, ZodSchema, ZodError } from 'zod';
import { dglog } from '../dglog';

export type IpcHandler<TInput, TOutput> = (
  event: IpcMainInvokeEvent,
  input: TInput
) => Promise<TOutput>;

export interface IpcHandlerDefinition<TInput, TOutput> {
  channel: string;
  schema: ZodSchema<TInput>;
  handler: IpcHandler<TInput, TOutput>;
}

export function createValidatedHandler<TInput, TOutput>(
  definition: IpcHandlerDefinition<TInput, TOutput>
) {
  const { channel, schema, handler } = definition;

  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, rawInput: unknown) => {
    const parseResult = schema.safeParse(rawInput);

    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));

      dglog(`[ipc:validation] ${channel} - validation failed`, { errors });

      return {
        ok: false,
        erro: 'Parâmetros inválidos',
        detalhes: errors,
      } as TOutput & { ok: false; erro: string; detalhes: z.ZodIssue[] };
    }

    try {
      const result = await handler(event, parseResult.data);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dglog(`[ipc:error] ${channel} - ${message}`);
      return {
        ok: false,
        erro: message,
      } as TOutput & { ok: false; erro: string };
    }
  });

  dglog(`[ipc:registered] ${channel}`);
}

export function registerHandlers<TInput, TOutput>(
  definitions: IpcHandlerDefinition<TInput, TOutput>[]
) {
  for (const def of definitions) {
    createValidatedHandler(def);
  }
}

export function validateInput<T>(schema: ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(`Validation failed: ${result.error.message}`);
  }
  return result.data;
}