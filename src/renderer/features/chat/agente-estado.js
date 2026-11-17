/** Estado compartilhado entre o painel OpenClaw (app.js) e os cards do agente. */
export const agenteEstado = {
  /** @type {{ id: string, path: string, unifiedDiff: string, absPath: string, origem?: string }[]} */
  ocPendentes: [],
  /** @type {string | null} */
  ocPendenteAtivoId: null,
  /** @type {{ id: string, path: string, absPath?: string, unifiedDiff: string, origem?: string }[]} */
  propostas: [],
  /** @type {null | (() => void)} */
  progressUnsub: null
}
