import type { Page } from 'playwright-core'

/** Fecha diálogos/modais que possam ter sobrado de um cenário anterior. */
export async function fecharSobreposicoes(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    let agiu = false
    const overlay = page.locator('.dg-dialog-overlay')
    if ((await overlay.count()) > 0) {
      await overlay
        .first()
        .locator('.dg-dialog-foot button')
        .last()
        .click({ timeout: 2000 })
        .catch(() => {})
      await page.waitForTimeout(120)
      agiu = true
    }
    const modais: [string, string][] = [
      ['#modal-contas', '#btn-contas-close'],
      ['#modal-config', '#btn-config-close']
    ]
    for (const [modal, fechar] of modais) {
      const m = page.locator(modal)
      if ((await m.count()) === 0 || !(await m.isVisible().catch(() => false))) continue
      await page.locator(fechar).click({ timeout: 1500 }).catch(() => {})
      await page.waitForTimeout(120)
      if (await m.isVisible().catch(() => false)) await page.keyboard.press('Escape').catch(() => {})
      agiu = true
    }
    if (!agiu) return
  }
}
