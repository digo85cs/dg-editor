/** Teste do ciclo do job DG Inovador: cria job dry-run e dispara tick forçado. */
process.env.DG_USERDATA = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'dg-agend-'))
// tick roda a cada 60s; acelera para 50ms só neste processo de teste
const _si = globalThis.setInterval
globalThis.setInterval = ((fn: TimerHandler, ms?: number, ...a: unknown[]) =>
  _si(fn as () => void, 50, ...(a as []))) as typeof setInterval

async function main() {
  const ag = await import('../src/main/agendador')
  const job = ag.garantirJobInovacao()
  console.log('job:', job?.id, '| dryRun:', job?.prompt.includes('DRY-RUN'), '| raiz:', job?.raiz)

  // Forca vencimento e registra emissor
  const { readFileSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const f = join(process.env.DG_USERDATA!, 'agendador.json')
  const doc = JSON.parse(readFileSync(f, 'utf8')) as { jobs: { id: string; proximoEm: string }[] }
  for (const j of doc.jobs) j.proximoEm = new Date(Date.now() - 1000).toISOString()
  writeFileSync(f, JSON.stringify(doc, null, 2))

  let disparou: { prompt: string; raiz: string; jobId: string } | null = null
  ag.registrarEmissorAgendador((p) => { disparou = p })
  ag.iniciarAgendador()
  await new Promise((r) => setTimeout(r, 300))
  ag.pararAgendador()
  console.log('disparo:', disparou ? `OK jobId=${disparou.jobId} raiz=${disparou.raiz}` : 'FALHOU')
  console.log('prompt tem dry-run:', disparou?.prompt.includes('DRY-RUN'))
  process.exit(disparou && disparou.prompt.includes('DRY-RUN') ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
