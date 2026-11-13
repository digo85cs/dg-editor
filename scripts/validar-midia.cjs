#!/usr/bin/env node
/**
 * Validação real do Estúdio de mídia (ferramentas gratuitas).
 * Requer `npm run build:mcp` antes (usa o core compilado).
 *
 *   node scripts/validar-midia.cjs
 */
const { mkdtempSync, rmSync, existsSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')

const corePath = join(__dirname, '..', '.dg-editor', 'bin', 'main', 'midia', 'core.js')
if (!existsSync(corePath)) {
  console.error('Rode `npm run build:mcp` antes.')
  process.exit(1)
}
const midia = require(corePath)

const raiz = mkdtempSync(join(tmpdir(), 'dg-midia-val-'))
const resultados = []
const registrar = (etapa, ok, detalhe) => {
  resultados.push({ etapa, ok, detalhe })
  console.log((ok ? '  [OK] ' : '  [FALHA] ') + etapa + (detalhe ? ' — ' + detalhe : ''))
}
const rodar = async (etapa, fn) => {
  const t = Date.now()
  try {
    const r = await fn()
    registrar(etapa, !!r.ok, (r.ok ? (r.caminhoRel || r.caminho || '') : r.erro || 'erro') + ' (' + Math.round((Date.now() - t) / 1000) + 's)')
    return r
  } catch (e) {
    registrar(etapa, false, String(e && e.message ? e.message : e))
    return { ok: false }
  }
}

const ffprobe = async (arquivo) => {
  const r = await midia.rodar('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', arquivo], 30000)
  try {
    return JSON.parse(r.stdout)
  } catch {
    return null
  }
}

const imagemCor = async (nome, cor) => {
  const p = join(raiz, nome)
  const r = await midia.rodar('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=' + cor + ':s=640x360:d=1', '-frames:v', '1', p], 60000)
  return r.ok && existsSync(p) ? p : null
}

async function main() {
  console.log('Raiz de teste: ' + raiz + '\n')

  console.log('[1] Status das ferramentas')
  const st = await rodar('status', () => midia.statusMidia(raiz))
  if (st && st.ferramentas) {
    for (const [k, v] of Object.entries(st.ferramentas)) {
      console.log('    ' + (v.ok ? '✓ ' : '✗ ') + k + (v.versao ? ' — ' + v.versao : v.erro ? ' — ' + v.erro : ''))
    }
  }

  console.log('\n[2] Diagrama Mermaid (mermaid.ink)')
  const diag = await rodar('diagrama', () => midia.gerarDiagrama(raiz, { codigo: 'flowchart LR\n  A-->B', formato: 'png', tema: 'dark' }))

  console.log('\n[3] Imagem Pollinations (grátis, limite 1/45s)')
  const img = await rodar('imagem', () => midia.gerarImagem(raiz, { prompt: 'test pattern, geometric shapes, high contrast', largura: 512, altura: 512 }))
  if (!img.ok && img.codigo === 'FREE_LIMIT') {
    console.log('    (limite gratuito atingido; aguarde ' + (img.retrySegundos || 45) + 's e rode de novo)')
  }

  console.log('\n[4] Melhorar imagem (ffmpeg 2x + nitidez)')
  const base = await imagemCor('entrada.png', 'navy')
  const melhor = base ? await rodar('upscale', () => midia.melhorarImagem(raiz, { entrada: base, fator: 2, nitidez: 0.8, formato: 'png' })) : { ok: false }
  if (melhor.ok) {
    const info = await ffprobe(melhor.caminho)
    const w = info && info.streams && info.streams[0] ? info.streams[0].width : 0
    registrar('upscale dimensões 1280x720', w === 1280, 'largura=' + w)
  }

  console.log('\n[5] Narração natural — matriz de vozes locais')
  let nar = { ok: false }
  const vozesTeste = [
    ['st:f1', 'Supertonic Ana Clara'],
    ['st:m2', 'Supertonic Bruno'],
    ['kokoro:dora', 'Kokoro Dora'],
    ['piper:cadu', 'Piper Cadu'],
    ['infantil:bia', 'infantil Bia'],
    ['infantil:theo', 'infantil Theo']
  ]
  for (const [voz, nome] of vozesTeste) {
    const r = await rodar('voz ' + nome, () =>
      midia.narrar(raiz, { texto: 'Teste de narração natural do Estúdio de mídia do DG Editor.', voz })
    )
    if (r.ok && !nar.ok) nar = r
  }
  const narEdge = await rodar('voz Francisca (nuvem, opcional)', () =>
    midia.narrar(raiz, { texto: 'Teste de narração em nuvem do DG Editor.', voz: 'edge:francisca' })
  )
  if (!nar.ok && narEdge.ok) nar = narEdge

  console.log('\n[6] Fotos → vídeo (slideshow + narração)')
  const a = await imagemCor('a.png', 'darkgreen')
  const b = await imagemCor('b.png', 'maroon')
  const c = await imagemCor('c.png', 'darkorange')
  const fotos = [a, b, c].filter(Boolean)
  const video = fotos.length
    ? await rodar('fotos-video', () =>
        midia.fotosParaVideo(raiz, {
          imagens: fotos,
          segundosPorFoto: 1,
          largura: 640,
          altura: 360,
          fps: 24,
          narracao: 'Slideshow de teste com voz natural.',
          voz: 'st:f1'
        })
      )
    : { ok: false }

  if (video.ok) {
    const info = await ffprobe(video.caminho)
    const dur = info && info.format ? Number(info.format.duration) : 0
    registrar('duração do slideshow ~3s', dur >= 2.5 && dur <= 4.5, dur.toFixed(2) + 's')

    console.log('\n[7] Cortar vídeo')
    const corte = await rodar('corte', () => midia.cortarVideo(raiz, { entrada: video.caminho, inicio: 0, fim: 1.5 }))
    if (corte.ok) {
      const ci = await ffprobe(corte.caminho)
      const cd = ci && ci.format ? Number(ci.format.duration) : 0
      registrar('duração do corte ~1.5s', cd >= 1 && cd <= 2.3, cd.toFixed(2) + 's')
    }

    console.log('\n[8] Capa do vídeo')
    const capa = await rodar('capa', () => midia.extrairCapa(raiz, { entrada: video.caminho, tempo: 1, largura: 320 }))
    if (capa.ok) {
      const ci = await ffprobe(capa.caminho)
      const w = ci && ci.streams && ci.streams[0] ? ci.streams[0].width : 0
      registrar('largura da capa 320', w === 320, 'largura=' + w)
    }

    console.log('\n[9] Juntar vídeos')
    const seg1 = await midia.cortarVideo(raiz, { entrada: video.caminho, inicio: 0, fim: 1 })
    const seg2 = await midia.cortarVideo(raiz, { entrada: video.caminho, inicio: 1, fim: 2 })
    if (seg1.ok && seg2.ok) {
      await rodar('juntar', () => midia.juntarVideos(raiz, { videos: [seg1.caminho, seg2.caminho] }))
    } else {
      registrar('juntar', false, 'pré-corte falhou')
    }
  } else {
    console.log('    (pulando corte/junção: slideshow falhou)')
  }

  console.log('\n[10] Transcrição faster-whisper (modelo tiny)')
  if (nar.ok) {
    const transc = await rodar('transcrição', () => midia.transcrever(raiz, { entrada: nar.caminho, idioma: 'pt', modelo: 'tiny' }))
    if (transc.ok) {
      console.log('    texto: ' + String(transc.texto || '').slice(0, 160))
      if (video.ok) {
        console.log('\n[11] Gravar legendas')
        await rodar('legendas', () => midia.queimarLegendas(raiz, { video: video.caminho, srt: transc.caminho }))
      }
    }
  } else {
    console.log('    (pulando transcrição: narração falhou)')
  }

  console.log('\n[12] ComfyUI local (opcional; DG_TEST_COMFY=1 gera uma imagem)')
  const comfyPath = join(__dirname, '..', '.dg-editor', 'bin', 'main', 'midia', 'comfyui.js')
  if (!existsSync(comfyPath)) {
    console.log('    (compilado ausente; rode npm run build:mcp)')
  } else {
    const comfy = require(comfyPath)
    const st = await rodar('comfyui-status', async () => {
      const r = await comfy.statusComfy()
      return { ...r, ok: !!(r.online || r.instalado) }
    })
    if (st && st.ok) {
      console.log('    ' + (st.online ? 'online' : 'parado') + ' · checkpoints: ' + (st.modelos.checkpoints.join(', ') || 'nenhum') +
        ' · lcm=' + (st.modelos.lcm ? 'sim' : 'não') + ' · animatediff=' + (st.modelos.animateDiff ? 'sim' : 'não'))
      if (process.env.DG_TEST_COMFY === '1' && st.instalado) {
        await rodar('comfyui-imagem', () =>
          comfy.gerarImagemComfy(raiz, { prompt: 'a simple red apple on a white table, studio light', largura: 256, altura: 256, passos: 4, seed: 1 })
        )
      }
    }
  }

  console.log('\n[13] Hardware, banco de memes e atualizações')
  const hwPath = join(__dirname, '..', '.dg-editor', 'bin', 'main', 'midia', 'hardware.js')
  const memesPath = join(__dirname, '..', '.dg-editor', 'bin', 'main', 'midia', 'memes.js')
  const atPath = join(__dirname, '..', '.dg-editor', 'bin', 'main', 'midia', 'atualizacoes.js')
  if (existsSync(hwPath)) {
    const hardware = require(hwPath)
    const h = await rodar('hardware', async () => {
      const r = await hardware.detectarHardware(true)
      return { ok: true, caminho: r.perfil + ' · ' + r.cpu + ' · ' + r.ramGb + ' GB' }
    })
    if (h && h.ok) console.log('    ajustes: ' + JSON.stringify(hardware.ajustesComfy((await hardware.detectarHardware()).perfil)))
  }
  if (existsSync(memesPath)) {
    const memes = require(memesPath)
    await rodar('memes-sincronizar', () => memes.sincronizarMemes({ forcar: false }))
    const lista = memes.listarMemes()
    if (lista.ok && lista.templates.length) {
      await rodar('meme-gerar', () =>
        memes.gerarMeme(raiz, { template: lista.templates[0].id, topo: 'DG Editor', baixo: 'teste local' })
      )
    } else {
      registrar('meme-gerar', false, lista.erro || 'sem templates')
    }
  }
  if (existsSync(atPath)) {
    const at = require(atPath)
    const r = await at.verificarAtualizacoes({ rede: false })
    registrar(
      'atualizações (offline)',
      r.ok && Array.isArray(r.componentes) && r.componentes.length >= 4,
      r.componentes.map((c) => c.id + '=' + (c.instalado ? 'ok' : 'ausente')).join(' ')
    )
  }
  const fotoPath = await imagemCor('foto.png', 'teal')
  if (existsSync(comfyPath) && fotoPath) {
    const comfy = require(comfyPath)
    const recusa = await comfy.gerarFotoVideoComfy(raiz, { entrada: fotoPath })
    registrar(
      'foto-video exige consentimento',
      recusa.ok === false && /consentimento|direito|autorizada/i.test(String(recusa.erro || '')),
      String(recusa.erro || '').slice(0, 120)
    )
    if (process.env.DG_TEST_FOTO === '1') {
      await rodar('foto-video', () =>
        comfy.gerarFotoVideoComfy(raiz, {
          entrada: fotoPath,
          largura: 256,
          altura: 256,
          quadros: 8,
          passos: 4,
          consentimento: true
        })
      )
    }
  }
  const falhas = resultados.filter((r) => !r.ok)
  console.log('\n' + '='.repeat(50))
  console.log('Resumo: ' + (resultados.length - falhas.length) + '/' + resultados.length + ' etapas OK')
  if (falhas.length) {
    for (const f of falhas) console.log('  - ' + f.etapa + ': ' + f.detalhe)
  }
  console.log('Saída em: ' + join(raiz, '.dg-editor', 'midia'))
  return falhas.length ? 1 : 0
}

main()
  .then((codigo) => {
    if (process.env.DG_KEEP_MIDIA !== '1') {
      try {
        rmSync(raiz, { recursive: true, force: true })
      } catch {
        /* */
      }
    } else {
      console.log('(mantido por DG_KEEP_MIDIA=1)')
    }
    process.exit(codigo)
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
