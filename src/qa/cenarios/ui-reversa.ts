import type { Page } from 'playwright-core'
import type { ResultadoCenario } from '../tipos'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fecharSobreposicoes } from './limpeza'

/** Engenharia reversa local (REA): análise estática, strings e modal. */
export async function cenariosUiReversa(page: Page): Promise<ResultadoCenario[]> {
  const out: ResultadoCenario[] = []

  {
    const t0 = Date.now()
    let fixture = ''
    let relatorio = ''
    try {
      const raiz = String(
        await page.evaluate(async () => {
          // @ts-expect-error api bridge injetada pelo preload
          const info = await window.api.invoke('app:raiz-projeto')
          return info?.raiz || ''
        })
      )
      fixture = join(raiz, '.qa-tmp-reversa', 'alvo.js')
      mkdirSync(join(raiz, '.qa-tmp-reversa'), { recursive: true })
      writeFileSync(
        fixture,
        "const { ipcMain } = require('electron')\n" +
          "ipcMain.handle('qa:reversa', () => 1)\n" +
          "fetch('https://exemplo.com/qa')\n"
      )
      const r = await page.evaluate(async (alvo) => {
        // @ts-expect-error api bridge injetada pelo preload
        const api = window.api
        const info = await api.invoke('app:raiz-projeto')
        const raizAtual = info?.raiz || ''
        const status = await api.invoke('reversa:status')
        const analise = await api.invoke('reversa:analisar', { raiz: raizAtual, alvo })
        const strings = await api.invoke('reversa:strings', { raiz: raizAtual, arquivo: alvo })
        return { status, analise, strings }
      }, '.qa-tmp-reversa/alvo.js')
      relatorio = String((r as { analise?: { caminho?: string } }).analise?.caminho || '')
      const analise = (r as { analise?: { ok?: boolean; tipo?: string; evidencias?: Array<{ tipo: string; valor: string }> } }).analise || {}
      const status = (r as { status?: { ok?: boolean; ferramentas?: Record<string, unknown> } }).status || {}
      const strings = (r as { strings?: { total?: number } }).strings || {}
      const canais = (analise.evidencias || []).some((e) => e.tipo === 'canal IPC' && e.valor === 'qa:reversa')
      const ok =
        analise.ok === true &&
        analise.tipo === 'javascript' &&
        canais &&
        !!relatorio &&
        existsSync(relatorio) &&
        status.ok === true &&
        (strings.total || 0) > 0
      out.push({
        id: 'ui.reversa.ipc',
        area: 'ui',
        titulo: 'Análise de reversa classifica JS, acha IPC e salva relatório',
        severidade: ok ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe:
          'tipo=' + (analise.tipo || '?') +
          ' · evidências=' + (analise.evidencias || []).length +
          ' · strings=' + (strings.total || 0) +
          ' · relatório=' + (relatorio ? 'sim' : 'não')
      })
    } catch (e) {
      out.push({
        id: 'ui.reversa.ipc',
        area: 'ui',
        titulo: 'análise de reversa (IPC)',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    } finally {
      if (fixture) rmSync(join(fixture, '..'), { recursive: true, force: true })
      if (relatorio) rmSync(join(relatorio, '..'), { recursive: true, force: true })
    }
  }

  {
    const t0 = Date.now()
    try {
      await fecharSobreposicoes(page)
      await page.evaluate(() => {
        const painel = document.getElementById('tool-panel')
        const w = window as unknown as { dgAbrirFerramenta?: (id: string) => void }
        if (painel?.hidden !== false) w.dgAbrirFerramenta?.('midia')
      })
      await page.waitForSelector('#tool-panel:not([hidden])', { timeout: 8000 })
      const btn = page.locator('#tool-corpo button', { hasText: 'Abrir análise de reversa' })
      await btn.waitFor({ timeout: 8000 })
      await btn.click()
      await page.waitForSelector('.reversa-modal', { timeout: 5000 })
      const pronto = await page.evaluate(() => {
        const modal = document.querySelector('.reversa-modal')
        return {
          temAviso: /autorização|autorizacao|inspecionar/i.test(modal?.textContent || ''),
          status: modal?.querySelector('.reversa-status')?.textContent || '',
          ferramentas: modal?.querySelector('.reversa-ferramentas')?.textContent || ''
        }
      })
      await page.locator('.reversa-modal .reversa-head button', { hasText: 'Fechar' }).click()
      await page.waitForFunction(() => !document.querySelector('.reversa-modal'), null, { timeout: 5000 })
      out.push({
        id: 'ui.reversa.ui',
        area: 'ui',
        titulo: 'Modal de engenharia reversa abre pelo Estúdio e fecha',
        severidade: pronto.temAviso ? 'ok' : 'erro',
        duracaoMs: Date.now() - t0,
        detalhe: (pronto.ferramentas || pronto.status || '').slice(0, 120)
      })
    } catch (e) {
      out.push({
        id: 'ui.reversa.ui',
        area: 'ui',
        titulo: 'modal de engenharia reversa',
        severidade: 'erro',
        duracaoMs: Date.now() - t0,
        erro: String(e)
      })
    }
  }

  return out
}
