import { z } from 'zod';

export const ChatSendSchema = z.object({
  root: z.string().min(1),
  content: z.string(),
  opts: z.object({
    anexos: z.array(z.object({
      nome: z.string(),
      tipo: z.string(),
      caminho: z.string().optional(),
      base64: z.string().optional(),
    })).optional(),
    skill: z.string().optional(),
    agente: z.string().optional(),
    modo: z.enum(['chat', 'agent', 'plan']).optional(),
  }).optional(),
});

export const BrainAskSchema = z.object({
  prompt: z.string().min(1),
  context: z.string().optional(),
  options: z.object({
    modelo: z.string().optional(),
    temperatura: z.number().optional(),
    maxTokens: z.number().optional(),
    tarefa: z.enum(['chat', 'chat-rapido', 'codigo', 'analise', 'raciocinio', 'revisao']).optional(),
    stream: z.boolean().optional(),
  }).optional(),
});

export const WorkspaceDefinirRaizSchema = z.object({
  pasta: z.string().min(1),
});

export const GitStatusSchema = z.object({
  raiz: z.string().min(1),
});

export const GitDiffSchema = z.object({
  raiz: z.string().min(1),
  caminho: z.string().optional(),
});

export const ArquivoLerSchema = z.object({
  caminho: z.string().min(1),
  raiz: z.string().optional(),
});

export const ArquivoSalvarSchema = z.object({
  caminho: z.string().min(1),
  conteudo: z.string(),
  raiz: z.string().optional(),
  criarPasta: z.boolean().optional(),
});

export const FerramentaExecutarSchema = z.object({
  nome: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional(),
  raiz: z.string().optional(),
  timeoutMs: z.number().positive().optional(),
});

export const MCPCallSchema = z.object({
  tool: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
  server: z.string().optional(),
});

export const AgentExecutarSchema = z.object({
  tarefa: z.string().min(1),
  raiz: z.string().optional(),
  agente: z.string().optional(),
  modo: z.enum(['auto', 'plan', 'execute']).optional(),
  contexto: z.string().optional(),
});

export const VaultListSchema = z.object({
  subpasta: z.string().optional(),
});

export const VaultReadSchema = z.object({
  caminho: z.string().min(1),
});

export const ProjetosArvoreSchema = z.object({
  raiz: z.string().optional(),
  maxProfundidade: z.number().int().positive().max(10).optional(),
  filtro: z.string().optional(),
});

export const CodigoBuscarSchema = z.object({
  termo: z.string().min(1),
  tipo: z.enum(['funcao', 'classe', 'tipo', 'todos']).optional(),
  raiz: z.string().optional(),
});

export const CodigoLerSchema = z.object({
  nome: z.string().min(1),
  raiz: z.string().optional(),
});

export const QualidadeChecarSchema = z.object({
  raiz: z.string().optional(),
  arquivos: z.array(z.string()).optional(),
});

export const ResultadoAvaliarSchema = z.object({
  pedido: z.string().min(1),
  textoFinal: z.string().min(1),
  passosResumo: z.string().optional(),
});

export const DossieReadSchema = z.object({
  _unused: z.undefined().optional(),
});

export const DossieSnapshotSchema = z.object({
  _unused: z.undefined().optional(),
});

export const ProvedoresTestarSchema = z.object({
  id: z.string().min(1),
  modelo: z.string().optional(),
  prompt: z.string().optional(),
});

export const ModelosCatalogoSchema = z.object({
  raiz: z.string().optional(),
});

export type ChatSendPayload = z.infer<typeof ChatSendSchema>;
export type BrainAskPayload = z.infer<typeof BrainAskSchema>;
export type WorkspaceDefinirRaizPayload = z.infer<typeof WorkspaceDefinirRaizSchema>;
export type GitStatusPayload = z.infer<typeof GitStatusSchema>;
export type GitDiffPayload = z.infer<typeof GitDiffSchema>;
export type ArquivoLerPayload = z.infer<typeof ArquivoLerSchema>;
export type ArquivoSalvarPayload = z.infer<typeof ArquivoSalvarSchema>;
export type FerramentaExecutarPayload = z.infer<typeof FerramentaExecutarSchema>;
export type MCPCallPayload = z.infer<typeof MCPCallSchema>;
export type AgentExecutarPayload = z.infer<typeof AgentExecutarSchema>;
export type VaultListPayload = z.infer<typeof VaultListSchema>;
export type VaultReadPayload = z.infer<typeof VaultReadSchema>;
export type ProjetosArvorePayload = z.infer<typeof ProjetosArvoreSchema>;
export type CodigoBuscarPayload = z.infer<typeof CodigoBuscarSchema>;
export type CodigoLerPayload = z.infer<typeof CodigoLerSchema>;
export type QualidadeChecarPayload = z.infer<typeof QualidadeChecarSchema>;
export type ResultadoAvaliarPayload = z.infer<typeof ResultadoAvaliarSchema>;
export type DossieReadPayload = z.infer<typeof DossieReadSchema>;
export type DossieSnapshotPayload = z.infer<typeof DossieSnapshotSchema>;
export type ProvedoresTestarPayload = z.infer<typeof ProvedoresTestarSchema>;
export type ModelosCatalogoPayload = z.infer<typeof ModelosCatalogoSchema>;