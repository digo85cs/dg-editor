export type ArquivoAbertoCtx = {
  path: string
  conteudo?: string
  selecao?: string
}

export type ContextoOpenClaw = {
  prompt: string
  arquivosAbertos: ArquivoAbertoCtx[]
  estruturaDir?: string
  raiz?: string
}

/** Monta mensagem de usuário truncada ao limite de bytes. */
export function montarContextoTexto(ctx: ContextoOpenClaw, maxBytes: number): string {
  const partes: string[] = []
  partes.push('## Pedido do usuario\n' + String(ctx.prompt || '').trim())
  if (ctx.raiz) partes.push('\n## Raiz do projeto\n' + ctx.raiz)
  if (ctx.estruturaDir) {
    partes.push('\n## Estrutura (rasa)\n```\n' + truncar(ctx.estruturaDir, Math.floor(maxBytes * 0.2)) + '\n```')
  }
  for (const a of ctx.arquivosAbertos || []) {
    let bloco = '\n## Arquivo: ' + a.path
    if (a.selecao) bloco += '\n### Selecao\n```\n' + a.selecao + '\n```'
    if (a.conteudo != null) bloco += '\n### Conteudo\n```\n' + a.conteudo + '\n```'
    partes.push(bloco)
  }
  let out = partes.join('\n')
  const bytes = Buffer.byteLength(out, 'utf8')
  if (bytes <= maxBytes) return out
  // corta pelo fim
  while (Buffer.byteLength(out, 'utf8') > maxBytes && out.length > 64) {
    out = out.slice(0, Math.floor(out.length * 0.9))
  }
  return out + '\n\n[contexto truncado pelo DG Editor]'
}

function truncar(s: string, max: number): string {
  if (Buffer.byteLength(s, 'utf8') <= max) return s
  let t = s
  while (Buffer.byteLength(t, 'utf8') > max && t.length > 32) t = t.slice(0, Math.floor(t.length * 0.9))
  return t + '\n…'
}
