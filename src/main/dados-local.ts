import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

export function registrarDadosLocalIpc() {
  ipcMain.handle('dg:dados:consultar', async (_e, arquivo: string, pergunta: string) => {
    try {
      const raiz = process.cwd()
      const alvo = join(raiz, arquivo)
      if (!existsSync(alvo)) return { ok: false, erro: 'arquivo nao encontrado' }
      // Sem dependencia externa - instrucoes para usar DuckDB localmente
      return { ok: true, instrucoes: 'Use DuckDB local (duckdb-wasm/node) para consultar CSV/JSON/Parquet/XLSX. Sugestao: "SELECT * FROM read_csv_auto(\'' + arquivo.replace(/\\/g,'/') + '\') LIMIT 50"', arquivo: alvo }
    } catch (e:any) {
      return { ok: false, erro: String(e?.message||e) }
    }
  })
}
