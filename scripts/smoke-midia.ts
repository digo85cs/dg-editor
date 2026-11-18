/** Smoke real das tools de midia — uso manual: node scripts/smoke-midia.mjs */
import { gerarImagemHF, hfConfigurado } from '../src/main/midia/hf-inferencia'
import { buscarMidia, baixarMidia } from '../src/main/midia/estoque'
import { gerarVideoJson2Video, json2videoConfigurado } from '../src/main/midia/json2video'
import { gerarVideoAuto } from '../src/main/midia/video-auto'
import { transcrever } from '../src/main/midia/core'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// @ts-expect-error shim p/ bundle ESM (core.ts usa __dirname)
;(globalThis as Record<string, unknown>).__dirname = process.cwd()

const RAIZ = join(process.cwd(), '.dg-editor', 'smoke')
mkdirSync(RAIZ, { recursive: true })

function resumo(nome: string, r: { ok: boolean; erro?: string; texto?: string; aviso?: string; detalhes?: unknown }) {
  const t = (r.texto || '').slice(0, 220).replace(/\s+/g, ' ')
  console.log(`[${nome}] ok=${r.ok} ${r.erro ? 'ERRO=' + r.erro.slice(0, 200) : ''} ${t}`)
  return r
}

async function main() {
  const alvo = process.argv[2] || 'todos'

  if (alvo === 'todos' || alvo === 'hf') {
    if (!hfConfigurado()) console.log('[hf] HF_TOKEN ausente — pulando')
    else resumo('hf', await gerarImagemHF(RAIZ, { prompt: 'a red apple on white table, product photo' }))
  }

  if (alvo === 'todos' || alvo === 'pixabay') {
    const busca = resumo('pixabay-busca', await buscarMidia(RAIZ, { tipo: 'imagem', consulta: 'red apple', porPagina: 3 }))
    if (busca.ok) {
      try {
        const itens = JSON.parse(busca.texto || '{}').itens as { downloadURL?: string }[]
        const url = itens?.[0]?.downloadURL
        if (url) resumo('pixabay-download', await baixarMidia(RAIZ, { url, tipo: 'imagem', consulta: 'red apple' }))
      } catch (e) { console.log('[pixabay-download] parse falhou', String(e)) }
    }
  }

  if (alvo === 'todos' || alvo === 'j2v') {
    if (!json2videoConfigurado()) console.log('[j2v] JSON2VIDEO_API_KEY ausente — pulando')
    else {
      resumo('j2v', await gerarVideoJson2Video(RAIZ, {
        resolucao: 'small',
        cenas: [{ duracao: 4, imagemUrl: 'https://picsum.photos/640/360', texto: 'smoke test' }]
      }))
    }
  }

  if (alvo === 'todos' || alvo === 'videoauto') {
    if (!json2videoConfigurado()) console.log('[videoauto] sem JSON2VIDEO_API_KEY — pulando')
    else {
      resumo('videoauto', await gerarVideoAuto(RAIZ, {
        cenas: [{ duracao: 4, imagemUrl: 'https://picsum.photos/640/360', texto: 'smoke auto' }]
      }))
    }
  }

  if (alvo === 'todos' || alvo === 'whisper') {
    // Gera um WAV curto com tom puro para testar o pipeline de transcrição.
    const wav = join(RAIZ, 'tom-teste.wav')
    if (!existsSync(wav)) {
      const n = 16000 * 2
      const buf = Buffer.alloc(44 + n * 2)
      buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8)
      buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20)
      buf.writeUInt16LE(1, 22); buf.writeUInt32LE(16000, 24); buf.writeUInt32LE(32000, 28)
      buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
      buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
      for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / 16000) * 12000), 44 + i * 2)
      writeFileSync(wav, buf)
    }
    resumo('whisper', await transcrever(RAIZ, { entrada: wav, idioma: 'pt' }))
  }
}

main().catch((e) => { console.error('SMOKE_FALHOU', e); process.exit(1) })
