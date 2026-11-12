import { autoDiagnosticar } from '../../auto-improvement/self-diagnosis'
import { dglog } from '../../dglog'

export type ValidacaoResultado = {
  ok: boolean
  tipo: 'typecheck' | 'testes' | 'build' | 'geral'
  detalhe: string
  erros: string[]
}

export async function devinValidador(raiz: string, tipo: 'typecheck' | 'testes' | 'build' | 'geral' = 'geral'): Promise<ValidacaoResultado> {
  const diag = autoDiagnosticar()

  const erros: string[] = []
  let ok = true
  let detalhe = ''

  if (tipo === 'typecheck' || tipo === 'geral') {
    if (!diag.typecheck.ok) {
      ok = false
      erros.push('typecheck falhou: ' + (diag.typecheck.erro || 'erro desconhecido'))
      detalhe += 'typecheck: FALHOU; '
    } else {
      detalhe += 'typecheck: OK; '
    }
  }

  if (tipo === 'testes' || tipo === 'geral') {
    if (!diag.testes.ok) {
      ok = false
      erros.push('testes falharam: ' + (diag.testes.erro || '') + ' (falhas=' + diag.testes.falhas + ')')
      detalhe += 'testes: FALHOU (' + diag.testes.falhas + '); '
    } else {
      detalhe += 'testes: OK (' + diag.testes.total + '); '
    }
  }

  if (tipo === 'build' || tipo === 'geral') {
    if (!diag.build.ok) {
      ok = false
      erros.push('build falhou: ' + (diag.build.erro || 'erro desconhecido'))
      detalhe += 'build: FALHOU; '
    } else {
      detalhe += 'build: OK; '
    }
  }

  dglog('[devin-validator] tipo=' + tipo + ' ok=' + ok + ' erros=' + erros.length)

  return { ok, tipo, detalhe: detalhe.trim(), erros }
}

export async function devinValidarAposMudanca(raiz: string): Promise<ValidacaoResultado> {
  return devinValidador(raiz, 'geral')
}
