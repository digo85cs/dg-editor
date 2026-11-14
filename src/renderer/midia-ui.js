/** Estúdio de mídia: geração/edição de imagem, diagramas, vídeo e áudio — tudo grátis. */
import { abrirGravador } from './gravador.js'
import { abrirCompartilhamento } from './compartilhar.js'
import { abrirReversa } from './reversa.js'

let cancelarProgressoUsb = null

function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue
    if (k === 'className') n.className = v
    else if (k === 'text') n.textContent = v
    else if (k === 'style') n.style.cssText = v
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v)
    else if (k in n) n[k] = v
    else n.setAttribute(k, String(v))
  }
  for (const f of filhos.flat()) if (f != null) n.appendChild(typeof f === 'string' ? document.createTextNode(f) : f)
  return n
}

function campo(rotulo, input) {
  const lab = el('label', { style: 'display:flex;flex-direction:column;gap:4px;font-size:11px', className: 'muted' }, rotulo, input)
  return lab
}

function caixa(titulo, ...conteudo) {
  return el('section', { className: 'tool-bloco', style: 'margin:8px 0' }, el('h4', { text: titulo }), ...conteudo)
}

function select(opcoes, valor) {
  const s = el('select', { style: 'font-size:12px;padding:5px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text)' })
  for (const [v, t] of opcoes) s.appendChild(el('option', { value: v, text: t, selected: String(v) === String(valor) }))
  return s
}

function entrada(attrs = {}) {
  return el('input', { type: 'text', style: 'font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text);width:100%;box-sizing:border-box', ...attrs })
}

function botao(texto, onclick, primario = false) {
  const b = el('button', { type: 'button', className: 'btn-small' + (primario ? ' btn-primary' : ''), text: texto, onclick })
  return b
}

export async function pintarMidia(corpo, raiz) {
  corpo.textContent = ''
  if (!raiz) {
    corpo.appendChild(el('p', { className: 'tool-vazio', text: 'Abra um repositório no Explorer para usar o Estúdio de mídia.' }))
    return
  }

  const seguro = async (canal, ...args) => {
    try {
      return await window.api.invoke(canal, ...args)
    } catch (e) {
      return { ok: false, erro: String(e && e.message ? e.message : e) }
    }
  }
  const toast = (msg, tipo = 'aviso') => window.dgToast?.(msg, tipo)

  function mostrarResultado(alvo, r, opts = {}) {
    alvo.textContent = ''
    if (!r) return
    if (!r.ok) {
      alvo.appendChild(el('p', { style: 'margin:0;color:#ff8a8a;font-size:12px', text: 'Erro: ' + (r.erro || 'falha') + (r.retrySegundos ? ' (aguarde ' + r.retrySegundos + 's)' : '') }))
      return
    }
    const partes = []
    if (r.caminhoRel || r.caminho) partes.push('Salvo em ' + (r.caminhoRel || r.caminho))
    if (typeof r.bytes === 'number') partes.push(Math.max(1, Math.round(r.bytes / 1024)) + ' KB')
    if (r.duracaoSeg) partes.push(r.duracaoSeg + 's')
    if (r.aviso) partes.push(r.aviso)
    alvo.appendChild(el('p', { style: 'margin:0;font-size:12px', text: partes.join(' · ') }))
    if (r.texto) alvo.appendChild(el('p', { style: 'margin:6px 0 0;font-size:11px;white-space:pre-wrap;max-height:120px;overflow:auto', text: r.texto }))
    if (r.previewBase64 && !opts.semPreview) {
      const ehVideo = String(r.mime || '').startsWith('video/')
      alvo.appendChild(
        ehVideo
          ? el('video', { src: r.previewBase64, controls: true, style: 'max-width:100%;border-radius:6px;margin-top:6px' })
          : el('img', { src: r.previewBase64, alt: 'Prévia do arquivo gerado', style: 'max-width:100%;border-radius:6px;margin-top:6px' })
      )
    }
    alvo.appendChild(botao('Abrir pasta', () => void seguro('midia:abrir-pasta', raiz)))
    void atualizarGaleria()
  }

  async function escolher(tipo, multiplo = false) {
    const r = await seguro('midia:escolher-arquivos', { tipo, multiplo })
    return r && r.ok && Array.isArray(r.caminhos) ? r.caminhos : []
  }

  const nomeCurto = (p) => String(p || '').split(/[\\/]/).pop()

  // ------------------------------------------------------------ status
  const statusAlvo = el('div', { style: 'font-size:12px' })
  const blocoStatus = caixa(
    'Ferramentas disponíveis',
    el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Pollinations (imagem), mermaid.ink (diagramas), ffmpeg (vídeo), faster-whisper (transcrição) e vozes naturais locais (Supertonic/Kokoro/Piper) com edge-tts como alternativa em nuvem. Nenhuma chave paga.' }),
    botao('Verificar status', async () => {
      statusAlvo.textContent = 'Verificando…'
      const r = await seguro('midia:status', raiz)
      statusAlvo.textContent = ''
      if (!r) return
      const f = r.ferramentas || {}
      for (const [k, v] of Object.entries(f)) {
        statusAlvo.appendChild(el('p', { style: 'margin:2px 0;font-size:11px', text: (v.ok ? '✓ ' : '✗ ') + k + (v.versao ? ' — ' + v.versao : v.erro ? ' — ' + v.erro : '') }))
      }
      const pasta = r.pasta ? 'Saída: ' + r.pasta : ''
      if (pasta) statusAlvo.appendChild(el('p', { className: 'muted', style: 'margin:4px 0 0;font-size:11px', text: pasta }))
    }),
    statusAlvo
  )
  corpo.appendChild(blocoStatus)

  // ------------------------------------------------------------ vozes
  const VOZ_STORAGE = 'dg-voz-escolhida'
  const estadoVoz = { lista: [], padrao: 'st:f1' }
  const rVoz = await seguro('midia:vozes', { rapido: true })
  if (rVoz?.ok) {
    estadoVoz.lista = Array.isArray(rVoz.vozes) ? rVoz.vozes : []
    estadoVoz.padrao = rVoz.preferencias?.vozPadrao || 'st:f1'
  }
  const ROTULO_CAT = { mulher: 'Mulheres', homem: 'Homens', menina: 'Meninas (infantil)', menino: 'Meninos (infantil)', parodia: 'Paródias (arquétipos)' }
  const CATS_SELETOR = ['mulher', 'homem', 'menina', 'menino', 'parodia']

  function preencherCategorias(s) {
    for (const cat of CATS_SELETOR) {
      const itens = estadoVoz.lista.filter((x) => x.categoria === cat)
      if (!itens.length) continue
      const grupo = el('optgroup', { label: ROTULO_CAT[cat] || cat })
      for (const v of itens) {
        const extra = v.derivada ? ' · infantil' : v.categoria === 'parodia' ? ' · paródia' : ''
        grupo.appendChild(el('option', { value: v.id, text: v.rotulo + extra }))
      }
      s.appendChild(grupo)
    }
  }

  const seletoresVoz = []
  const infoVoz = el('p', { className: 'muted', style: 'font-size:11px;margin:6px 0 0' })
  const statusPrevia = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0 0' })
  const audioPrevia = el('audio', { style: 'display:none' })

  const vozEscolhida = () => localStorage.getItem(VOZ_STORAGE) || estadoVoz.padrao

  function atualizarInfoVoz() {
    const v = estadoVoz.lista.find((x) => x.id === vozEscolhida())
    if (!v) {
      infoVoz.textContent = 'Biblioteca de vozes indisponível — clique em "Verificar motores".'
      return
    }
    const tags = []
    tags.push(ROTULO_CAT[v.categoria] || v.categoria)
    tags.push(v.motor === 'edge' ? 'nuvem (internet)' : 'local (offline)')
    if (v.derivada) tags.push('infantil derivada de voz natural')
    if (v.categoria === 'parodia') tags.push('arquétipo, não imita pessoa real')
    if (v.disponivel === false) tags.push('indisponível: ' + (v.motivo || 'verifique o motor'))
    infoVoz.textContent = v.rotulo + ' · ' + tags.join(' · ') + ' — ' + v.descricao
  }

  function aplicarVoz(id) {
    if (!id) return
    localStorage.setItem(VOZ_STORAGE, id)
    for (const s of seletoresVoz) if (s.value !== id) s.value = id
    atualizarInfoVoz()
  }

  function criarSeletorVoz() {
    const s = el('select', { style: 'font-size:12px;padding:5px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text);min-width:200px' })
    preencherCategorias(s)
    s.value = vozEscolhida()
    s.addEventListener('change', () => aplicarVoz(s.value))
    seletoresVoz.push(s)
    return s
  }

  const selecaoVozPrincipal = criarSeletorVoz()
  const motoresVoz = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px' })
  const blocoVoz = caixa(
    'Vozes naturais (pt-BR)',
    el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Escolha a voz para narrações e vídeos: mulheres, homens, meninas, meninos e paródias (arquétipos). Vozes locais rodam sem internet; a infantil é derivada de voz natural. Paródias são timbres genéricos e não imitam pessoas reais.' }),
    el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap' },
      campo('Voz', selecaoVozPrincipal),
      botao('Ouvir prévia', async () => {
        const id = vozEscolhida()
        statusPrevia.textContent = 'Gerando prévia…'
        const r = await seguro('midia:voz-previa', { voz: id })
        if (r?.ok && r.previewBase64) {
          audioPrevia.src = r.previewBase64
          statusPrevia.textContent = 'Prévia: ' + (r.duracaoSeg ? r.duracaoSeg + 's · ' : '') + (r.aviso || '')
          audioPrevia.play().catch(() => toast('Clique em play no player', 'aviso'))
        } else {
          statusPrevia.textContent = 'Falha na prévia: ' + (r?.erro || 'erro')
        }
      }),
      botao('Definir como padrão', async () => {
        const r = await seguro('midia:voz-padrao', { voz: vozEscolhida() })
        toast(r?.ok ? 'Voz padrão salva' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
      })
    ),
    infoVoz,
    statusPrevia,
    audioPrevia,
    el('p', { className: 'muted', style: 'font-size:11px;margin:8px 0 0', text: 'Motores locais (baixam uma vez, ficam em %LOCALAPPDATA%\\dg-editor\\tts):' }),
    motoresVoz
  )
  corpo.appendChild(blocoVoz)
  atualizarInfoVoz()

  const motoresInfo = [
    ['supertonic', 'Supertonic (~385 MB, 10 vozes)'],
    ['kokoro', 'Kokoro (~115 MB, 3 vozes)'],
    ['piper', 'Piper (~250 MB, 4 vozes)']
  ]
  const motorStatus = el('div', { style: 'font-size:11px;margin-top:4px' })
  for (const [id, titulo] of motoresInfo) {
    motoresVoz.appendChild(
      botao('Baixar ' + titulo, async (ev) => {
        const b = ev.currentTarget
        b.disabled = true
        b.textContent = 'Baixando…'
        const r = await seguro('midia:vozes-baixar', { motor: id })
        b.disabled = false
        b.textContent = 'Baixar ' + titulo
        toast(r?.ok ? 'Modelos baixados' : r?.erro || 'Falha ao baixar', r?.ok ? 'ok' : 'erro')
        await recarregarVozes()
      })
    )
  }
  motoresVoz.appendChild(
    botao('Verificar motores', async () => {
      motorStatus.textContent = 'Verificando…'
      const r = await seguro('midia:status', raiz)
      motorStatus.textContent = ''
      const d = (r && r.vozes) || {}
      for (const [m, v] of Object.entries(d)) {
        motorStatus.appendChild(el('p', { style: 'margin:2px 0;font-size:11px', text: (v.ok ? '✓ ' : '✗ ') + m + (v.ok ? ' pronto' : ' — ' + (v.motivo || 'indisponível')) }))
      }
      await recarregarVozes()
    })
  )
  motoresVoz.appendChild(motorStatus)

  async function recarregarVozes() {
    const r = await seguro('midia:vozes')
    if (r?.ok) {
      estadoVoz.lista = Array.isArray(r.vozes) ? r.vozes : estadoVoz.lista
      estadoVoz.padrao = r.preferencias?.vozPadrao || estadoVoz.padrao
      for (const s of seletoresVoz) {
        const atual = s.value
        s.textContent = ''
        preencherCategorias(s)
        s.value = atual
      }
      atualizarInfoVoz()
    }
  }

  // ------------------------------------------------------------ imagem
  const promptImg = el('textarea', { rows: 3, placeholder: 'Ex.: ilustração minimalista de um editor de código, fundo escuro', style: 'font:inherit;font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text)' })
  const larguraImg = entrada({ type: 'number', value: '1024', min: '64', max: '1536', style: 'width:90px' })
  const alturaImg = entrada({ type: 'number', value: '1024', min: '64', max: '1536', style: 'width:90px' })
  const seedImg = entrada({ type: 'number', placeholder: 'aleatório', style: 'width:110px' })
  const resImg = el('div', { style: 'font-size:12px' })
  corpo.appendChild(
    caixa(
      'Gerar imagem (grátis)',
      promptImg,
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Largura', larguraImg),
        campo('Altura', alturaImg),
        campo('Seed', seedImg),
        botao('Gerar imagem', async () => {
          const prompt = promptImg.value.trim()
          if (!prompt) return toast('Digite o prompt', 'aviso')
          resImg.textContent = 'Gerando… (Pollinations pode levar até 1 min)'
          const r = await seguro('midia:imagem', {
            raiz,
            prompt,
            largura: Number(larguraImg.value) || 1024,
            altura: Number(alturaImg.value) || 1024,
            seed: seedImg.value === '' ? undefined : Number(seedImg.value)
          })
          mostrarResultado(resImg, r)
          toast(r?.ok ? 'Imagem gerada' : r?.erro || 'Falha ao gerar', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      el('p', { className: 'muted', style: 'font-size:11px;margin:6px 0 0', text: 'Pollinations é grátis, sem chave: 1 imagem a cada ~45s por IP. Para geração ilimitada, use o ComfyUI local abaixo.' }),
      resImg
    )
  )

  // ---------------------------------------------------------- ComfyUI local
  const comfyStatus = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0 0', text: 'Verificando ComfyUI…' })
  const comfyModo = select([['imagem', 'Imagem (SD 1.5 + LCM)'], ['video', 'Vídeo (AnimateDiff)']], 'imagem')
  const comfyPrompt = el('textarea', { rows: 2, placeholder: 'Ex.: cidade futurista ao amanhecer, luz suave, detalhes nítidos', style: 'font:inherit;font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text)' })
  const comfyLargura = entrada({ type: 'number', value: '512', min: '256', max: '1024', step: '64', style: 'width:90px' })
  const comfyAltura = entrada({ type: 'number', value: '512', min: '256', max: '768', step: '64', style: 'width:90px' })
  const comfyQuadros = entrada({ type: 'number', value: '8', min: '8', max: '32', style: 'width:90px' })
  const comfyFps = entrada({ type: 'number', value: '8', min: '4', max: '16', style: 'width:90px' })
  const comfyPassos = entrada({ type: 'number', placeholder: 'auto', min: '2', max: '40', style: 'width:90px' })
  const comfySeed = entrada({ type: 'number', placeholder: 'aleatório', style: 'width:110px' })
  const comfyRes = el('div', { style: 'font-size:12px' })
  const comfyDica = el('p', { className: 'muted', style: 'font-size:11px;margin:6px 0 0', text: 'Geração ilimitada, gratuita e 100% local (CPU, sem CUDA). Medido nesta máquina: imagem 512×512 em ~2,5 min; vídeo de 8 quadros em 384×384 leva ~15 min. Reduza quadros/resolução para acelerar.' })
  let comfyOnline = false

  async function checarComfy() {
    const r = await seguro('dg:comfyui:status')
    comfyOnline = !!r?.online
    if (!r?.instalado) {
      comfyStatus.textContent = 'ComfyUI não instalado — rode a instalação automática para liberar geração ilimitada.'
    } else if (comfyOnline) {
      const ck = (r.modelos?.checkpoints || []).join(', ') || 'nenhum modelo'
      comfyStatus.textContent =
        'Online · ' + (r.versao || 'ComfyUI') + ' · ' + ck + (r.modelos?.lcm ? ' · LCM ativo' : '') +
        (r.fila ? ' · fila ' + r.fila.executando + '/' + r.fila.pendentes : '')
    } else {
      comfyStatus.textContent = r?.erro || 'Instalado, servidor parado.'
    }
    return r
  }
  void checarComfy()

  const botoesComfy = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px' },
    botao('Iniciar ComfyUI', async (ev) => {
      const b = ev.currentTarget
      b.disabled = true
      comfyStatus.textContent = 'Subindo ComfyUI em CPU (pode levar até 4 minutos)…'
      const r = await seguro('dg:comfyui:iniciar')
      b.disabled = false
      await checarComfy()
      toast(r?.ok ? 'ComfyUI online' : r?.erro || 'Falha ao iniciar', r?.ok ? 'ok' : 'erro')
    }),
    botao('Parar', async () => {
      const r = await seguro('dg:comfyui:parar')
      await checarComfy()
      toast(r?.ok ? 'ComfyUI parado' : r?.erro || 'Falha ao parar', r?.ok ? 'ok' : 'erro')
    }),
    botao('Verificar', () => void checarComfy())
  )

  corpo.appendChild(
    caixa(
      'ComfyUI local (imagem/vídeo ilimitados)',
      comfyPrompt,
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Modo', comfyModo),
        campo('Largura', comfyLargura),
        campo('Altura', comfyAltura),
        campo('Quadros (vídeo)', comfyQuadros),
        campo('FPS (vídeo)', comfyFps),
        campo('Passos', comfyPassos),
        campo('Seed', comfySeed),
        botao('Gerar no ComfyUI', async (ev) => {
          const b = ev.currentTarget
          const prompt = comfyPrompt.value.trim()
          if (!prompt) return toast('Digite o prompt', 'aviso')
          if (!comfyOnline) {
            comfyRes.textContent = 'Iniciando o ComfyUI…'
            const st = await seguro('dg:comfyui:iniciar')
            if (!st?.ok) {
              mostrarResultado(comfyRes, { ok: false, erro: st?.erro || 'não foi possível iniciar o ComfyUI' })
              return
            }
            comfyOnline = true
            await checarComfy()
          }
          b.disabled = true
          comfyRes.textContent = comfyModo.value === 'video'
            ? 'Gerando vídeo no ComfyUI (CPU)… isso pode levar vários minutos.'
            : 'Gerando imagem no ComfyUI…'
          const r = await seguro('dg:comfyui:gerar', {
            raiz,
            modo: comfyModo.value,
            prompt,
            largura: Number(comfyLargura.value) || 512,
            altura: Number(comfyAltura.value) || 512,
            quadros: Number(comfyQuadros.value) || 16,
            fps: Number(comfyFps.value) || 8,
            passos: comfyPassos.value === '' ? undefined : Number(comfyPassos.value),
            seed: comfySeed.value === '' ? undefined : Number(comfySeed.value)
          })
          b.disabled = false
          mostrarResultado(comfyRes, r)
          toast(r?.ok ? 'Gerado no ComfyUI' : r?.erro || 'Falha na geração', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      comfyDica,
      comfyStatus,
      botoesComfy,
      comfyRes
    )
  )

  // ------------------------------------------------------------ memes
  const memeFiltro = entrada({ type: 'search', placeholder: 'Filtrar templates…', style: 'width:180px' })
  const memeLista = el('select', { style: 'font-size:12px;padding:5px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text);max-width:100%' })
  const memeTopo = entrada({ placeholder: 'Texto de cima', maxlength: '120' })
  const memeBaixo = entrada({ placeholder: 'Texto de baixo', maxlength: '120' })
  const memeInfo = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0 0', text: 'Banco ainda não sincronizado.' })
  const memeRes = el('div', { style: 'font-size:12px' })

  async function carregarMemes(sincronizar = false) {
    if (sincronizar) memeInfo.textContent = 'Sincronizando templates do Imgflip…'
    const r = sincronizar
      ? await seguro('midia:memes-sincronizar', { forcar: true })
      : await seguro('midia:memes', { filtro: memeFiltro.value.trim() })
    if (sincronizar) {
      toast(r?.ok ? 'Banco de memes atualizado (' + r.total + ' templates)' : r?.erro || 'Falha ao sincronizar', r?.ok ? 'ok' : 'erro')
      return carregarMemes(false)
    }
    memeLista.textContent = ''
    if (!r?.ok) {
      memeInfo.textContent = r?.erro || 'Banco indisponível.'
      return
    }
    for (const t of r.templates || []) {
      memeLista.appendChild(el('option', { value: t.id, text: t.nome + (t.baixado ? '' : ' (baixa ao gerar)') }))
    }
    const st = r.status || {}
    memeInfo.textContent =
      (r.total || 0) + ' templates' +
      (st.atualizadoEm ? ' · atualizado em ' + new Date(st.atualizadoEm).toLocaleDateString('pt-BR') : '') +
      (st.desatualizado ? ' · vale sincronizar' : '') +
      ' · templates baixados: ' + (st.baixados ?? 0)
  }
  void carregarMemes(false)
  memeFiltro.addEventListener('input', () => void carregarMemes(false))

  corpo.appendChild(
    caixa(
      'Memes (banco local + legendas)',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Templates gratuitos do Imgflip, baixados sob demanda. A legenda usa Impact no estilo clássico. Nada sai do PC depois do download.' }),
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap' },
        campo('Buscar', memeFiltro),
        botao('Sincronizar banco', () => void carregarMemes(true)),
        botao('Abrir pasta do banco', () => void seguro('midia:memes-pasta'))
      ),
      el('div', { style: 'margin-top:6px' }, campo('Template', memeLista)),
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Texto de cima', memeTopo),
        campo('Texto de baixo', memeBaixo),
        botao('Gerar meme', async (ev) => {
          const b = ev.currentTarget
          if (!memeLista.value) return toast('Sincronize o banco antes', 'aviso')
          if (!memeTopo.value.trim() && !memeBaixo.value.trim()) return toast('Escreva o texto de cima ou de baixo', 'aviso')
          b.disabled = true
          memeRes.textContent = 'Gerando meme…'
          const r = await seguro('midia:meme', {
            raiz,
            template: memeLista.value,
            topo: memeTopo.value.trim(),
            baixo: memeBaixo.value.trim()
          })
          b.disabled = false
          mostrarResultado(memeRes, r)
          toast(r?.ok ? 'Meme gerado' : r?.erro || 'Falha ao gerar meme', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      memeInfo,
      memeRes
    )
  )

  // -------------------------------------------------------- foto → vídeo
  const fotoEscolhida = { caminho: '' }
  const fotoInfo = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0 0', text: 'Nenhuma foto escolhida.' })
  const fotoPrompt = el('textarea', { rows: 2, placeholder: 'Ex.: movimento suave de câmera, vento leve, estilo cinematográfico', style: 'font:inherit;font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text)' })
  const fotoMovimento = entrada({ type: 'number', value: '0.55', min: '0.3', max: '0.8', step: '0.05', style: 'width:80px' })
  const fotoQuadros = entrada({ type: 'number', value: '8', min: '8', max: '32', step: '1', style: 'width:80px' })
  const fotoConsent = el('input', { type: 'checkbox' })
  const fotoRes = el('div', { style: 'font-size:12px' })

  corpo.appendChild(
    caixa(
      'Foto → vídeo sintético (estilizado)',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Gera um vídeo curto a partir de UMA foto (AnimateDiff local, CPU). O resultado é estilizado — não é deepfake fotorrealista — e sai com a marca visível "gerado por IA". Use apenas fotos suas ou de quem autorizou.' }),
      el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' },
        botao('Escolher foto', async () => {
          const lista = await escolher('imagem')
          if (!lista.length) return
          fotoEscolhida.caminho = lista[0]
          fotoInfo.textContent = 'Foto: ' + nomeCurto(lista[0])
        }),
        campo('Movimento (0,3–0,8)', fotoMovimento),
        campo('Quadros', fotoQuadros)
      ),
      fotoInfo,
      el('div', { style: 'margin-top:6px' }, fotoPrompt),
      el('label', { style: 'display:flex;gap:6px;align-items:flex-start;font-size:11px;margin-top:6px' },
        fotoConsent,
        el('span', { text: 'Confirmo que tenho direito de usar esta imagem (foto própria ou pessoa autorizada).' })
      ),
      botao('Gerar vídeo da foto', async (ev) => {
        const b = ev.currentTarget
        if (!fotoEscolhida.caminho) return toast('Escolha uma foto primeiro', 'aviso')
        if (!fotoConsent.checked) return toast('Marque o consentimento de uso da imagem', 'aviso')
        b.disabled = true
        fotoRes.textContent = 'Gerando vídeo sintético no ComfyUI (CPU)… isso pode levar vários minutos.'
        const r = await seguro('midia:foto-video', {
          raiz,
          entrada: fotoEscolhida.caminho,
          prompt: fotoPrompt.value.trim() || undefined,
          movimento: Number(fotoMovimento.value) || undefined,
          quadros: Number(fotoQuadros.value) || undefined,
          consentimento: fotoConsent.checked
        })
        b.disabled = false
        mostrarResultado(fotoRes, r)
        toast(r?.ok ? 'Vídeo sintético gerado' : r?.erro || 'Falha na geração', r?.ok ? 'ok' : 'erro')
      }, true),
      fotoRes
    )
  )

  // ------------------------------------------------- hardware/instalação
  const hwInfo = el('div', { style: 'font-size:11px' })
  const instLog = el('pre', { className: 'muted', style: 'font-size:10px;max-height:120px;overflow:auto;white-space:pre-wrap;margin:6px 0 0', text: '' })
  const instModelos = select([['nenhum', 'Só código (sem modelos)'], ['imagem', 'Imagem (DreamShaper + LCM)'], ['completo', 'Completo (imagem + vídeo)']], 'nenhum')
  const instVideo = el('input', { type: 'checkbox' })
  const instHardware = { perfil: '', gpu: '' }

  async function carregarHardware() {
    const r = await seguro('midia:hardware')
    hwInfo.textContent = ''
    if (!r?.ok) return void (hwInfo.textContent = r?.erro || 'Falha ao detectar hardware.')
    const hw = r.hardware || {}
    instHardware.perfil = hw.perfil || ''
    instHardware.gpu = hw.gpu ? hw.gpu.nome + (hw.gpu.compativel ? ' (CUDA ok)' : ' (CUDA antiga → CPU)') : 'sem GPU NVIDIA'
    hwInfo.appendChild(el('p', { style: 'margin:2px 0', text: 'Perfil: ' + (hw.perfil || '?') + ' · ' + (hw.cpu || 'CPU') + ' · ' + hw.threads + ' threads · ' + hw.ramGb + ' GB RAM' }))
    hwInfo.appendChild(el('p', { style: 'margin:2px 0', text: 'GPU: ' + instHardware.gpu }))
    if (hw.comfy) hwInfo.appendChild(el('p', { style: 'margin:2px 0', text: 'Padrões automáticos: ' + hw.comfy.largura + '×' + hw.comfy.altura + ', ' + hw.comfy.passos + ' passos, ' + hw.comfy.quadros + ' quadros a ' + hw.comfy.fps + ' fps' }))
    if (r.comfy) {
      hwInfo.appendChild(el('p', { style: 'margin:2px 0', text: 'ComfyUI: ' + (r.comfy.instalado ? 'instalado em ' + r.comfy.pasta : 'não instalado') + ' · checkpoints ' + r.comfy.modelos.checkpoints + ' · LoRAs ' + r.comfy.modelos.loras + ' · motion ' + r.comfy.modelos.animatediff }))
      if (r.comfy.log) instLog.textContent = r.comfy.log
    }
    if (typeof r.espacoLivreGb === 'number' && r.espacoLivreGb >= 0) {
      hwInfo.appendChild(el('p', { style: 'margin:2px 0', text: 'Espaço livre no disco: ' + r.espacoLivreGb + ' GB' }))
    }
    // Ajusta os campos do ComfyUI ao hardware atual.
    if (hw.comfy) {
      comfyLargura.value = String(hw.comfy.largura)
      comfyAltura.value = String(hw.comfy.altura)
      comfyQuadros.value = String(hw.comfy.quadros)
      comfyFps.value = String(hw.comfy.fps)
      comfyPassos.placeholder = 'auto (' + hw.comfy.passos + ')'
      fotoQuadros.value = String(hw.comfy.quadros)
      fotoMovimento.value = String(hw.comfy.denoise)
    }
  }
  void carregarHardware()

  corpo.appendChild(
    caixa(
      'Hardware e instalação portátil',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Em outro PC o DG Editor detecta CPU/GPU e baixa só o necessário. Cada etapa é idempotente e o progresso fica no log abaixo.' }),
      hwInfo,
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Conteúdo', instModelos),
        el('label', { style: 'display:flex;gap:6px;align-items:center;font-size:11px' }, instVideo, el('span', { text: 'incluir AnimateDiff (vídeo)' })),
        botao('Verificar Python/git', async () => {
          const r = await seguro('midia:comfy-pre')
          toast(r?.ok ? 'Pronto: ' + (r.python?.versao || 'Python') + ' · ' + (r.git || 'git') : (r?.erros || []).join(' '), r?.ok ? 'ok' : 'erro')
        }),
        botao('Instalar/atualizar ComfyUI', async (ev) => {
          const b = ev.currentTarget
          b.disabled = true
          instLog.textContent = 'Instalando… acompanhe o log ao final.'
          const r = await seguro('midia:comfy-instalar', { modelos: instModelos.value, video: instVideo.checked })
          b.disabled = false
          if (r) {
            instLog.textContent = (r.etapas || []).map((e) => (e.ok ? '✓ ' : '✗ ') + e.nome + ': ' + e.detalhe).join('\n') + (r.log ? '\n\n' + r.log : '')
          }
          await carregarHardware()
          toast(r?.ok ? 'Instalação concluída' : r?.erro || 'Falha na instalação', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      instLog
    )
  )

  // --------------------------------------------------------- atualizações
  const atInfo = el('div', { style: 'font-size:11px' })
  const atAuto = el('input', { type: 'checkbox' })
  const atAplicarAuto = el('input', { type: 'checkbox' })
  let atPreferencias = {}

  async function carregarAtualizacoes() {
    atInfo.textContent = 'Verificando…'
    const r = await seguro('midia:atualizacoes', { rede: true })
    atInfo.textContent = ''
    if (!r?.ok) return void (atInfo.textContent = r?.erro || 'Falha ao verificar.')
    atPreferencias = r.preferencias || {}
    atAuto.checked = atPreferencias.automatico !== false
    atAplicarAuto.checked = atPreferencias.aplicarAutomatico === true
    atInfo.appendChild(el('p', { className: 'muted', style: 'margin:2px 0', text: 'Verificado em ' + new Date(r.verificadoEm).toLocaleString('pt-BR') + ' · novidades: ' + r.novidades }))
    for (const c of r.componentes || []) {
      const marca = c.disponivel ? '⬆ ' : c.instalado ? '✓ ' : '· '
      const linha = el('div', { style: 'display:flex;gap:8px;align-items:center;margin:2px 0;flex-wrap:wrap' },
        el('span', { text: marca + c.nome + ' — ' + c.detalhe }),
        c.disponivel
          ? botao('Atualizar', async (ev) => {
              const b = ev.currentTarget
              b.disabled = true
              const rr = await seguro('midia:atualizacoes-aplicar', { componentes: [c.id] })
              const txt = (rr?.resultados || []).map((x) => (x.ok ? '✓ ' : '✗ ') + x.detalhe).join(' · ') || rr?.erro || 'sem resposta'
              toast(txt, rr?.ok ? 'ok' : 'erro')
              await carregarAtualizacoes()
            })
          : null
      )
      atInfo.appendChild(linha)
    }
  }
  void carregarAtualizacoes()

  async function salvarPrefsAtualizacao() {
    const r = await seguro('midia:atualizacoes-prefs', { automatico: atAuto.checked, aplicarAutomatico: atAplicarAuto.checked })
    if (r?.ok) toast('Preferência de atualização salva', 'ok')
  }

  corpo.appendChild(
    caixa(
      'Atualizações (ComfyUI, nós, memes, vozes)',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Verificação diária opcional. O pull de código só é aplicado com o ComfyUI parado; memes sincronizam sempre que houver internet.' }),
      atInfo,
      el('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:6px' },
        botao('Verificar agora', () => void carregarAtualizacoes()),
        botao('Aplicar tudo (seguro)', async () => {
          const r = await seguro('midia:atualizacoes-aplicar', {})
          const txt = (r?.resultados || []).map((x) => (x.ok ? '✓ ' : '✗ ') + x.detalhe).join(' · ') || r?.erro || 'sem resposta'
          toast(txt, r?.ok ? 'ok' : 'erro')
          await carregarAtualizacoes()
        })
      ),
      el('div', { style: 'display:flex;gap:16px;flex-wrap:wrap;margin-top:6px;font-size:11px' },
        el('label', { style: 'display:flex;gap:6px;align-items:center' }, atAuto, el('span', { text: 'verificar automaticamente 1×/dia' })),
        el('label', { style: 'display:flex;gap:6px;align-items:center' }, atAplicarAuto, el('span', { text: 'aplicar atualizações seguras sozinho' })),
        botao('Salvar preferências', () => void salvarPrefsAtualizacao())
      )
    )
  )

  // ------------------------------------------------------------ diagrama
  const codMermaid = el('textarea', { rows: 5, style: 'font:12px/1.5 ui-monospace,monospace;padding:6px 8px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text)', value: 'flowchart LR\n  A[Ideia] --> B[Plano]\n  B --> C[Código]\n  C --> D[Teste]' })
  codMermaid.value = 'flowchart LR\n  A[Ideia] --> B[Plano]\n  B --> C[Código]\n  C --> D[Teste]'
  const formatoMermaid = select([['png', 'PNG'], ['svg', 'SVG']], 'png')
  const temaMermaid = select([['light', 'Claro'], ['dark', 'Escuro']], 'dark')
  const resMermaid = el('div', { style: 'font-size:12px' })
  corpo.appendChild(
    caixa(
      'Diagrama Mermaid',
      codMermaid,
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Formato', formatoMermaid),
        campo('Tema', temaMermaid),
        botao('Gerar diagrama', async () => {
          const codigo = codMermaid.value.trim()
          if (!codigo) return toast('Escreva o diagrama', 'aviso')
          resMermaid.textContent = 'Gerando…'
          const r = await seguro('midia:diagrama', { raiz, codigo, formato: formatoMermaid.value, tema: temaMermaid.value })
          mostrarResultado(resMermaid, r)
          toast(r?.ok ? 'Diagrama gerado' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      resMermaid
    )
  )

  // ------------------------------------------------------------ html → imagem
  const htmlTexto = el('textarea', { rows: 6, style: 'font:12px/1.5 ui-monospace,monospace;padding:6px 8px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text)' })
  htmlTexto.value =
    '<div style="font-family:sans-serif;padding:48px;background:#0f1115;color:#fff;height:100%;box-sizing:border-box">\n' +
    '  <h1 style="margin:0 0 8px">DG Editor</h1>\n  <p style="color:#9aa4b2">Card gerado localmente, sem serviços externos.</p>\n</div>'
  const larguraHtml = entrada({ type: 'number', value: '1200', min: '64', max: '1920', style: 'width:90px' })
  const alturaHtml = entrada({ type: 'number', value: '630', min: '64', max: '1920', style: 'width:90px' })
  const resHtml = el('div', { style: 'font-size:12px' })
  corpo.appendChild(
    caixa(
      'HTML → imagem',
      htmlTexto,
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Largura', larguraHtml),
        campo('Altura', alturaHtml),
        botao('Capturar PNG', async () => {
          const html = htmlTexto.value
          if (!html.trim()) return toast('Escreva o HTML', 'aviso')
          resHtml.textContent = 'Renderizando…'
          const r = await seguro('midia:html-imagem', { raiz, html, largura: Number(larguraHtml.value) || 1200, altura: Number(alturaHtml.value) || 630 })
          mostrarResultado(resHtml, r)
          toast(r?.ok ? 'Imagem capturada' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      el('p', { className: 'muted', style: 'font-size:11px;margin:6px 0 0', text: 'Renderização local no Electron (sandbox, sem internet obrigatória).' }),
      resHtml
    )
  )

  // ------------------------------------------------------------ melhorar imagem
  let imgMelhorar = null
  const lblMelhorar = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Nenhuma imagem escolhida.' })
  const fatorMelhorar = select([['2', '2×'], ['3', '3×'], ['4', '4×']], '2')
  const nitidezMelhorar = el('input', { type: 'range', min: '0', max: '2', step: '0.1', value: '0.8', style: 'width:120px' })
  const formatoMelhorar = select([['png', 'PNG'], ['jpg', 'JPG']], 'png')
  const resMelhorar = el('div', { style: 'font-size:12px' })
  corpo.appendChild(
    caixa(
      'Melhorar imagem (upscale + nitidez)',
      botao('Escolher imagem', async () => {
        const [p] = await escolher('imagem')
        if (!p) return
        imgMelhorar = p
        lblMelhorar.textContent = nomeCurto(p)
      }),
      lblMelhorar,
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Fator', fatorMelhorar),
        campo('Nitidez', nitidezMelhorar),
        campo('Formato', formatoMelhorar),
        botao('Melhorar', async () => {
          if (!imgMelhorar) return toast('Escolha uma imagem primeiro', 'aviso')
          resMelhorar.textContent = 'Processando…'
          const r = await seguro('midia:imagem-melhorar', { raiz, entrada: imgMelhorar, fator: Number(fatorMelhorar.value), nitidez: Number(nitidezMelhorar.value), formato: formatoMelhorar.value })
          mostrarResultado(resMelhorar, r)
          toast(r?.ok ? 'Imagem melhorada' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      resMelhorar
    )
  )

  // ------------------------------------------------------------ imagem: qualidade
  let imgQualidade = null
  const lblQualidadeImg = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Nenhuma imagem escolhida.' })
  const numDenoiseImg = el('input', { type: 'number', value: '0', min: '0', max: '1', step: '0.1', style: 'width:64px' })
  const numNitidezImg = el('input', { type: 'number', value: '0.8', min: '0', max: '2', step: '0.1', style: 'width:64px' })
  const numBrilhoImg = el('input', { type: 'number', value: '0', min: '-100', max: '100', step: '1', style: 'width:64px' })
  const numContrasteImg = el('input', { type: 'number', value: '0', min: '-100', max: '100', step: '1', style: 'width:64px' })
  const numSaturacaoImg = el('input', { type: 'number', value: '100', min: '0', max: '200', step: '5', style: 'width:64px' })
  const numGammaImg = el('input', { type: 'number', value: '1', min: '0.1', max: '10', step: '0.1', style: 'width:64px' })
  const escalaImg = select([['1', 'Original'], ['1.5', '1,5×'], ['2', '2×'], ['3', '3×'], ['4', '4×']], '1')
  const formatoImg = select([['png', 'PNG'], ['jpg', 'JPG']], 'png')
  const resQualidadeImg = el('div', { style: 'font-size:12px' })
  corpo.appendChild(
    caixa(
      'Imagem: nitidez, cor e reescala',
      botao('Escolher imagem', async () => {
        const [p] = await escolher('imagem')
        if (!p) return
        imgQualidade = p
        lblQualidadeImg.textContent = nomeCurto(p)
      }),
      lblQualidadeImg,
      el('div', { style: 'display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Denoise', numDenoiseImg),
        campo('Nitidez', numNitidezImg),
        campo('Brilho %', numBrilhoImg),
        campo('Contraste %', numContrasteImg),
        campo('Saturação %', numSaturacaoImg),
        campo('Gamma', numGammaImg),
        campo('Escala', escalaImg),
        campo('Formato', formatoImg)
      ),
      botao('Aplicar ajustes', async () => {
        if (!imgQualidade) return toast('Escolha uma imagem primeiro', 'aviso')
        resQualidadeImg.textContent = 'Processando…'
        const r = await seguro('midia:imagem-qualidade', {
          raiz,
          entrada: imgQualidade,
          denoise: Number(numDenoiseImg.value),
          nitidez: Number(numNitidezImg.value),
          brilho: Number(numBrilhoImg.value),
          contraste: Number(numContrasteImg.value),
          saturacao: Number(numSaturacaoImg.value),
          gamma: Number(numGammaImg.value),
          escala: Number(escalaImg.value),
          formato: formatoImg.value
        })
        mostrarResultado(resQualidadeImg, r)
        toast(r?.ok ? 'Imagem ajustada' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
      }, true),
      resQualidadeImg
    )
  )

  // ------------------------------------------------------------ fotos → vídeo
  let fotos = []
  const listaFotos = el('div', { className: 'muted', style: 'font-size:11px;margin:4px 0;white-space:pre-wrap', text: 'Nenhuma foto escolhida.' })
  const segFoto = entrada({ type: 'number', value: '3', min: '0.5', max: '15', step: '0.5', style: 'width:80px' })
  const resolucao = select([['1920x1080', '1920×1080'], ['1280x720', '1280×720'], ['1080x1080', '1080×1080']], '1920x1080')
  const narracao = el('textarea', { rows: 3, placeholder: 'Narração (opcional) — usa a voz escolhida na biblioteca', style: 'font:inherit;font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text)' })
  const vozFotos = criarSeletorVoz()
  const resFotos = el('div', { style: 'font-size:12px' })
  corpo.appendChild(
    caixa(
      'Fotos → vídeo',
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        botao('Escolher fotos', async () => {
          const ps = await escolher('imagem', true)
          if (ps.length) {
            fotos = ps
            listaFotos.textContent = ps.map(nomeCurto).join('\n')
          }
        }),
        botao('Limpar', () => {
          fotos = []
          listaFotos.textContent = 'Nenhuma foto escolhida.'
        })
      ),
      listaFotos,
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Segundos por foto', segFoto),
        campo('Resolução', resolucao),
        botao('Gerar vídeo', async () => {
          if (!fotos.length) return toast('Escolha as fotos', 'aviso')
          const [w, h] = resolucao.value.split('x').map(Number)
          resFotos.textContent = 'Montando vídeo…'
          const r = await seguro('midia:fotos-video', {
            raiz,
            imagens: fotos,
            segundosPorFoto: Number(segFoto.value) || 3,
            largura: w,
            altura: h,
            narracao: narracao.value.trim() || undefined,
            voz: narracao.value.trim() ? vozFotos.value : undefined
          })
          mostrarResultado(resFotos, r)
          toast(r?.ok ? 'Vídeo gerado' : r?.erro || 'Falha ao montar', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      campo('Narração (opcional)', narracao),
      campo('Voz da narração', vozFotos),
      el('p', { className: 'muted', style: 'font-size:11px;margin:6px 0 0', text: 'ffmpeg monta o slideshow; a narração usa a voz natural escolhida acima (local, sem internet).' }),
      resFotos
    )
  )

  // ------------------------------------------------------------ vídeo: cortar / juntar / capa
  let videoCorte = null
  let videosJuntar = []
  let videoCapa = null
  const lblCorte = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Nenhum vídeo escolhido.' })
  const inicioCorte = entrada({ placeholder: '00:00:05', style: 'width:100px' })
  const fimCorte = entrada({ placeholder: '00:00:20', style: 'width:100px' })
  const resCorte = el('div', { style: 'font-size:12px' })
  const lblJuntar = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0;white-space:pre-wrap', text: 'Nenhum vídeo escolhido.' })
  const resJuntar = el('div', { style: 'font-size:12px' })
  const lblCapa = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Nenhum vídeo escolhido.' })
  const tempoCapa = entrada({ placeholder: '00:00:03', style: 'width:100px' })
  const resCapa = el('div', { style: 'font-size:12px' })

  corpo.appendChild(
    caixa(
      'Cortar vídeo',
      botao('Escolher vídeo', async () => {
        const [p] = await escolher('video')
        if (!p) return
        videoCorte = p
        lblCorte.textContent = nomeCurto(p)
      }),
      lblCorte,
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Início', inicioCorte),
        campo('Fim', fimCorte),
        botao('Cortar', async () => {
          if (!videoCorte) return toast('Escolha um vídeo', 'aviso')
          resCorte.textContent = 'Cortando…'
          const r = await seguro('midia:video-cortar', { raiz, entrada: videoCorte, inicio: inicioCorte.value.trim(), fim: fimCorte.value.trim() })
          mostrarResultado(resCorte, r, { semPreview: true })
          toast(r?.ok ? 'Corte concluído' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      resCorte
    )
  )

  corpo.appendChild(
    caixa(
      'Juntar vídeos',
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        botao('Escolher vídeos', async () => {
          const ps = await escolher('video', true)
          if (ps.length) {
            videosJuntar = ps
            lblJuntar.textContent = ps.map(nomeCurto).join('\n')
          }
        }),
        botao('Limpar', () => {
          videosJuntar = []
          lblJuntar.textContent = 'Nenhum vídeo escolhido.'
        })
      ),
      lblJuntar,
      botao('Juntar', async () => {
        if (videosJuntar.length < 2) return toast('Escolha ao menos dois vídeos', 'aviso')
        resJuntar.textContent = 'Juntando…'
        const r = await seguro('midia:video-juntar', { raiz, videos: videosJuntar })
        mostrarResultado(resJuntar, r, { semPreview: true })
        toast(r?.ok ? 'Vídeos juntados' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
      }, true),
      el('p', { className: 'muted', style: 'font-size:11px;margin:6px 0 0', text: 'Os vídeos precisam ter a mesma resolução/codec.' }),
      resJuntar
    )
  )

  corpo.appendChild(
    caixa(
      'Capa do vídeo',
      botao('Escolher vídeo', async () => {
        const [p] = await escolher('video')
        if (!p) return
        videoCapa = p
        lblCapa.textContent = nomeCurto(p)
      }),
      lblCapa,
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Tempo', tempoCapa),
        botao('Extrair capa', async () => {
          if (!videoCapa) return toast('Escolha um vídeo', 'aviso')
          resCapa.textContent = 'Extraindo…'
          const r = await seguro('midia:video-capa', { raiz, entrada: videoCapa, tempo: tempoCapa.value.trim() || 1 })
          mostrarResultado(resCapa, r)
          toast(r?.ok ? 'Capa extraída' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      resCapa
    )
  )

  // ------------------------------------------------------------ qualidade de vídeo
  let videoQualidade = null
  const lblQualidade = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Nenhum vídeo escolhido.' })
  const analiseVideo = el('div', { style: 'font-size:12px;white-space:pre-wrap' })
  const chkEstabilizar = el('input', { type: 'checkbox' })
  const chkNormalizarVideo = el('input', { type: 'checkbox' })
  chkNormalizarVideo.checked = true
  const numDenoise = el('input', { type: 'number', value: '0', min: '0', max: '1', step: '0.1', style: 'width:64px' })
  const numNitidezVideo = el('input', { type: 'number', value: '0.8', min: '0', max: '2', step: '0.1', style: 'width:64px' })
  const numBrilhoVideo = el('input', { type: 'number', value: '0', min: '-100', max: '100', step: '1', style: 'width:64px' })
  const numContrasteVideo = el('input', { type: 'number', value: '0', min: '-100', max: '100', step: '1', style: 'width:64px' })
  const numSaturacaoVideo = el('input', { type: 'number', value: '100', min: '0', max: '200', step: '5', style: 'width:64px' })
  const numGammaVideo = el('input', { type: 'number', value: '1', min: '0.1', max: '10', step: '0.1', style: 'width:64px' })
  const escalaVideo = select([['1', 'Original'], ['1.5', '1,5×'], ['2', '2×']], '1')
  const fpsVideo = select([['0', 'Manter'], ['24', '24 fps'], ['30', '30 fps'], ['60', '60 fps']], '0')
  const crfVideo = select([['18', 'Alta (CRF 18)'], ['20', 'Equilibrada (CRF 20)'], ['23', 'Compacta (CRF 23)'], ['26', 'Leve (CRF 26)']], '20')
  const presetVideo = select([['rapido', 'Rápido'], ['equilibrado', 'Equilibrado'], ['qualidade', 'Qualidade']], 'equilibrado')
  const resQualidade = el('div', { style: 'font-size:12px' })
  corpo.appendChild(
    caixa(
      'Vídeo: filtros, estabilização e re-render',
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        botao('Escolher vídeo', async () => {
          const [p] = await escolher('video')
          if (!p) return
          videoQualidade = p
          lblQualidade.textContent = nomeCurto(p)
          analiseVideo.textContent = ''
        }),
        botao('Analisar vídeo', async () => {
          if (!videoQualidade) return toast('Escolha um vídeo', 'aviso')
          analiseVideo.textContent = 'Analisando…'
          const r = await seguro('midia:video-analisar', { raiz, entrada: videoQualidade })
          if (!r?.ok) {
            analiseVideo.textContent = 'Erro: ' + (r?.erro || 'falha')
            return
          }
          const linhas = [
            (r.largura || '?') + '×' + (r.altura || '?') + ' · ' + (r.fps ?? '?') + ' fps · ' + (r.duracaoSeg ?? '?') + 's',
            (r.codec || '?') + ' · ' + (r.bitrateKbps ?? '?') + ' kbps · áudio: ' + (r.temAudio ? r.codecAudio || 'sim' : 'não')
          ]
          for (const d of r.dicas || []) linhas.push('• ' + d)
          analiseVideo.textContent = linhas.join('\n')
        })
      ),
      lblQualidade,
      analiseVideo,
      el('div', { style: 'display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-top:8px' },
        campo('Estabilizar', chkEstabilizar),
        campo('Denoise', numDenoise),
        campo('Nitidez', numNitidezVideo),
        campo('Brilho %', numBrilhoVideo),
        campo('Contraste %', numContrasteVideo),
        campo('Saturação %', numSaturacaoVideo),
        campo('Gamma', numGammaVideo)
      ),
      el('div', { style: 'display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Escala', escalaVideo),
        campo('FPS', fpsVideo),
        campo('Qualidade', crfVideo),
        campo('Preset', presetVideo),
        campo('Normalizar áudio', chkNormalizarVideo)
      ),
      el('div', { style: 'display:flex;gap:6px;margin-top:8px' },
        botao('Renderizar', async () => {
          if (!videoQualidade) return toast('Escolha um vídeo', 'aviso')
          resQualidade.textContent = 'Renderizando… isso pode levar alguns minutos.'
          const r = await seguro('midia:video-melhorar', {
            raiz,
            entrada: videoQualidade,
            estabilizar: chkEstabilizar.checked,
            denoise: Number(numDenoise.value),
            nitidez: Number(numNitidezVideo.value),
            brilho: Number(numBrilhoVideo.value),
            contraste: Number(numContrasteVideo.value),
            saturacao: Number(numSaturacaoVideo.value),
            gamma: Number(numGammaVideo.value),
            escala: Number(escalaVideo.value),
            fps: Number(fpsVideo.value),
            crf: Number(crfVideo.value),
            preset: presetVideo.value,
            normalizarAudio: chkNormalizarVideo.checked
          })
          mostrarResultado(resQualidade, r, { semPreview: true })
          toast(r?.ok ? 'Vídeo renderizado' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      el('p', { className: 'muted', style: 'font-size:11px;margin:6px 0 0', text: 'Estabilização usa 2 passadas (mais lenta). A saída é MP4 H.264 com faststart.' }),
      resQualidade
    )
  )

  // ------------------------------------------------------------ áudio / texto
  const textoNarrar = el('textarea', { rows: 3, placeholder: 'Texto que será narrado…', style: 'font:inherit;font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text)' })
  const vozNarrar = criarSeletorVoz()
  const taxaNarrar = select([['-10%', 'Mais lenta'], ['0%', 'Natural'], ['+10%', 'Mais rápida']], '0%')
  const resNarrar = el('div', { style: 'font-size:12px' })
  corpo.appendChild(
    caixa(
      'Narrar texto (voz natural)',
      textoNarrar,
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Voz', vozNarrar),
        campo('Ritmo', taxaNarrar),
        botao('Gerar narração', async () => {
          const texto = textoNarrar.value.trim()
          if (!texto) return toast('Digite o texto', 'aviso')
          resNarrar.textContent = 'Gerando áudio…'
          const r = await seguro('midia:narrar', { raiz, texto, voz: vozNarrar.value, taxa: taxaNarrar.value === '0%' ? undefined : taxaNarrar.value })
          mostrarResultado(resNarrar, r, { semPreview: true })
          toast(r?.ok ? 'Narração gerada' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      resNarrar
    )
  )

  let arquivoTranscrever = null
  const lblTranscrever = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Nenhum áudio/vídeo escolhido.' })
  const idiomaTranscrever = select([['auto', 'Automático'], ['pt', 'Português'], ['en', 'Inglês'], ['es', 'Espanhol']], 'auto')
  const modeloTranscrever = select([['tiny', 'tiny (rápido)'], ['base', 'base (equilíbrio)'], ['small', 'small (melhor)']], 'base')
  const resTranscrever = el('div', { style: 'font-size:12px' })
  corpo.appendChild(
    caixa(
      'Transcrever (faster-whisper local)',
      botao('Escolher áudio/vídeo', async () => {
        const [p] = await escolher('midia')
        if (!p) return
        arquivoTranscrever = p
        lblTranscrever.textContent = nomeCurto(p)
      }),
      lblTranscrever,
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Idioma', idiomaTranscrever),
        campo('Modelo', modeloTranscrever),
        botao('Transcrever', async () => {
          if (!arquivoTranscrever) return toast('Escolha um arquivo', 'aviso')
          resTranscrever.textContent = 'Transcrevendo… (pode levar alguns minutos)'
          const r = await seguro('midia:transcrever', { raiz, entrada: arquivoTranscrever, idioma: idiomaTranscrever.value, modelo: modeloTranscrever.value })
          mostrarResultado(resTranscrever, r, { semPreview: true })
          toast(r?.ok ? 'Transcrição concluída' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      resTranscrever
    )
  )

  let videoLegenda = null
  let srtLegenda = null
  const lblLegenda = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Escolha o vídeo e o .srt.' })
  const resLegenda = el('div', { style: 'font-size:12px' })
  corpo.appendChild(
    caixa(
      'Gravar legendas no vídeo',
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        botao('Escolher vídeo', async () => {
          const [p] = await escolher('video')
          if (!p) return
          videoLegenda = p
          lblLegenda.textContent = nomeCurto(videoLegenda) + ' + ' + (srtLegenda ? nomeCurto(srtLegenda) : '…')
        }),
        botao('Escolher .srt', async () => {
          const [p] = await escolher('legenda')
          if (!p) return
          srtLegenda = p
          lblLegenda.textContent = (videoLegenda ? nomeCurto(videoLegenda) : '…') + ' + ' + nomeCurto(srtLegenda)
        }),
        botao('Gravar', async () => {
          if (!videoLegenda || !srtLegenda) return toast('Escolha vídeo e .srt', 'aviso')
          resLegenda.textContent = 'Gravando legendas…'
          const r = await seguro('midia:legendas', { raiz, video: videoLegenda, srt: srtLegenda })
          mostrarResultado(resLegenda, r, { semPreview: true })
          toast(r?.ok ? 'Legendas gravadas' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      lblLegenda,
      resLegenda
    )
  )

  // ------------------------------------------------------------ músicas
  let videoMusica = null
  const lblMusica = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Nenhum vídeo escolhido.' })
  const selMusica = el('select', { style: 'font-size:12px;padding:5px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text);max-width:260px' })
  const volMusica = el('input', { type: 'range', min: '0', max: '0.5', step: '0.02', value: '0.18', style: 'width:120px' })
  const resMusica = el('div', { style: 'font-size:12px' })
  async function carregarMusicas() {
    const r = await seguro('midia:musicas')
    selMusica.textContent = ''
    const itens = r?.itens || []
    if (!itens.length) {
      selMusica.appendChild(el('option', { value: '', text: 'Banco vazio — abra a pasta e adicione áudios' }))
    } else {
      for (const m of itens) selMusica.appendChild(el('option', { value: m.caminho, text: m.nome }))
    }
  }
  void carregarMusicas()
  corpo.appendChild(
    caixa(
      'Música de fundo (banco local)',
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        botao('Escolher vídeo', async () => {
          const [p] = await escolher('video')
          if (!p) return
          videoMusica = p
          lblMusica.textContent = nomeCurto(p)
        }),
        botao('Abrir pasta de músicas', () => void seguro('midia:musicas-pasta')),
        botao('Atualizar lista', () => void carregarMusicas())
      ),
      lblMusica,
      el('div', { style: 'display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Faixa', selMusica),
        campo('Volume', volMusica),
        botao('Mixing', async () => {
          if (!videoMusica) return toast('Escolha um vídeo', 'aviso')
          if (!selMusica.value) return toast('Adicione músicas na pasta do banco', 'aviso')
          resMusica.textContent = 'Mixando áudio…'
          const r = await seguro('midia:musica-mixar', { raiz, video: videoMusica, musica: selMusica.value, volume: Number(volMusica.value) })
          mostrarResultado(resMusica, r)
          toast(r?.ok ? 'Trilha aplicada' : r?.erro || 'Falha ao mixar', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      el('p', { className: 'muted', style: 'font-size:11px;margin:6px 0 0', text: 'Coloque MP3/WAV/OGG/M4A/FLAC em %LOCALAPPDATA%\\dg-editor\\musicas. Nada é baixado automaticamente.' }),
      resMusica
    )
  )

  // ------------------------------------------------------------ biblioteca livre
  const selEstilo = el('select', { style: 'font-size:12px;padding:5px;border-radius:6px;border:1px solid var(--dg-border);background:var(--dg-surface);color:var(--dg-text);max-width:260px' })
  const listaCatalogo = el('div', { style: 'font-size:12px;max-height:150px;overflow:auto;line-height:1.55;margin-top:4px' })
  const resCatalogo = el('div', { style: 'font-size:12px' })
  function renderCatalogo(r) {
    listaCatalogo.textContent = ''
    const est = (r?.estilos || []).find((e) => e.id === selEstilo.value)
    for (const f of est?.faixas || []) {
      listaCatalogo.appendChild(el('div', { text: (f.baixada ? '✓ ' : '• ') + f.titulo + (f.baixada ? ' — baixada' : '') }))
    }
  }
  let catalogoAtual = null
  selEstilo.addEventListener('change', () => renderCatalogo(catalogoAtual))
  void (async () => {
    catalogoAtual = await seguro('midia:musicas-catalogo')
    if (!catalogoAtual) return
    selEstilo.textContent = ''
    for (const e of catalogoAtual.estilos || []) {
      selEstilo.appendChild(el('option', { value: e.id, text: e.rotulo + ' (' + e.total + ')' }))
    }
    renderCatalogo(catalogoAtual)
  })()
  corpo.appendChild(
    caixa(
      'Biblioteca de músicas livres (por estilo)',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Faixas de Kevin MacLeod (incompetech.com), licença CC BY 4.0 — uso gratuito com crédito. O download só acontece quando você pede.' }),
      el('div', { style: 'display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap' },
        campo('Estilo', selEstilo),
        botao('Baixar este estilo', async () => {
          if (!selEstilo.value) return
          resCatalogo.textContent = 'Baixando faixas…'
          const r = await seguro('midia:musicas-baixar', { estilo: selEstilo.value })
          const ok = (r?.baixadas || []).length
          const falhas = (r?.falhas || []).map((f) => f.titulo + ': ' + f.erro)
          resCatalogo.textContent = ok + ' faixa(s) no banco' + (falhas.length ? ' · falhas: ' + falhas.join('; ') : '')
          toast(r?.ok ? ok + ' faixa(s) baixada(s)' : r?.erro || 'Falha no download', r?.ok ? 'ok' : 'erro')
          catalogoAtual = await seguro('midia:musicas-catalogo')
          renderCatalogo(catalogoAtual)
          void carregarMusicas()
        }, true),
        botao('Abrir pasta', () => void seguro('midia:musicas-pasta'))
      ),
      listaCatalogo,
      el('p', { className: 'muted', style: 'font-size:11px;margin:6px 0 0', text: 'Créditos salvos em CREDITOS.json na pasta do banco. Internet necessária só para baixar.' }),
      resCatalogo
    )
  )

  // ------------------------------------------------------------ áudio
  let audioEscolhido = null
  const lblAudio = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Escolha um áudio (MP3/WAV/OGG/M4A/FLAC).' })
  const analiseAudio = el('div', { style: 'font-size:12px' })
  const chkNormalizar = el('input', { type: 'checkbox' })
  chkNormalizar.checked = true
  const numGraves = el('input', { type: 'number', value: '0', min: '-20', max: '20', step: '0.5', style: 'width:64px' })
  const numAgudos = el('input', { type: 'number', value: '0', min: '-20', max: '20', step: '0.5', style: 'width:64px' })
  const numGanho = el('input', { type: 'number', value: '0', min: '-30', max: '30', step: '0.5', style: 'width:64px' })
  const numComp = el('input', { type: 'number', value: '1', min: '1', max: '20', step: '0.5', style: 'width:64px' })
  const numFadeIn = el('input', { type: 'number', value: '0', min: '0', max: '60', step: '0.5', style: 'width:64px' })
  const numFadeOut = el('input', { type: 'number', value: '0', min: '0', max: '60', step: '0.5', style: 'width:64px' })
  const selFormatoAudio = select([['mp3', 'MP3'], ['wav', 'WAV'], ['m4a', 'M4A'], ['ogg', 'OGG']], 'mp3')
  const resAudio = el('div', { style: 'font-size:12px' })
  corpo.appendChild(
    caixa(
      'Áudio: normalizar, equalizar e cortar',
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        botao('Escolher áudio', async () => {
          const [p] = await escolher('audio')
          if (!p) return
          audioEscolhido = p
          lblAudio.textContent = nomeCurto(p)
          analiseAudio.textContent = ''
        }),
        botao('Analisar volume', async () => {
          if (!audioEscolhido) return toast('Escolha um áudio', 'aviso')
          analiseAudio.textContent = 'Analisando…'
          const r = await seguro('midia:audio-analisar', { raiz, entrada: audioEscolhido })
          if (!r?.ok) {
            analiseAudio.textContent = 'Erro: ' + (r?.erro || 'falha')
            return
          }
          const media = typeof r.mediaDb === 'number' ? r.mediaDb.toFixed(1) + ' dB' : '?'
          const pico = typeof r.picoDb === 'number' ? r.picoDb.toFixed(1) + ' dB' : '?'
          const dica = typeof r.mediaDb === 'number' ? ' · para -16 dB, use ganho de ' + (-16 - r.mediaDb).toFixed(1) + ' dB' : ''
          analiseAudio.textContent = 'Duração ' + (r.duracaoSeg ?? '?') + 's · média ' + media + ' · pico ' + pico + dica
        })
      ),
      lblAudio,
      analiseAudio,
      el('div', { style: 'display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-top:8px' },
        campo('Normalizar', chkNormalizar),
        campo('Graves dB', numGraves),
        campo('Agudos dB', numAgudos),
        campo('Ganho dB', numGanho),
        campo('Compressão', numComp),
        campo('Fade in s', numFadeIn),
        campo('Fade out s', numFadeOut),
        campo('Formato', selFormatoAudio)
      ),
      el('div', { style: 'display:flex;gap:6px;margin-top:8px' },
        botao('Processar áudio', async () => {
          if (!audioEscolhido) return toast('Escolha um áudio', 'aviso')
          resAudio.textContent = 'Processando…'
          const r = await seguro('midia:audio-processar', {
            raiz,
            entrada: audioEscolhido,
            normalizar: chkNormalizar.checked,
            ganhoDb: Number(numGanho.value),
            gravesDb: Number(numGraves.value),
            agudosDb: Number(numAgudos.value),
            compressao: Number(numComp.value),
            fadeInSeg: Number(numFadeIn.value),
            fadeOutSeg: Number(numFadeOut.value),
            formato: selFormatoAudio.value
          })
          mostrarResultado(resAudio, r, { semPreview: true })
          toast(r?.ok ? 'Áudio processado' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      resAudio
    )
  )

  // ------------------------------------------------------------ editor de linha do tempo
  let clipesEditor = []
  const listaClipes = el('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:6px' })
  const lblTotalEditor = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Nenhum clipe na linha do tempo.' })
  const resEditor = el('div', { style: 'font-size:12px' })
  const ondaEditor = el('div', { style: 'margin-top:6px;font-size:12px' })
  const selTrilhaEditor = select([['', 'Sem música de fundo']], '')
  const numFundoEditor = el('input', { type: 'number', value: '0.2', min: '0', max: '1', step: '0.05', style: 'width:64px' })
  const resEditorCfg = select([['1280x720', '1280×720'], ['1920x1080', '1920×1080'], ['854x480', '854×480']], '1280x720')
  const fpsEditor = select([['30', '30 fps'], ['24', '24 fps'], ['60', '60 fps']], '30')
  const fadeInEditor = el('input', { type: 'number', value: '0.6', min: '0', max: '10', step: '0.1', style: 'width:64px' })
  const fadeOutEditor = el('input', { type: 'number', value: '0.6', min: '0', max: '10', step: '0.1', style: 'width:64px' })

  const ehImagemEditor = (p) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(String(p || ''))
  const duracaoAproxEditor = (c) => {
    if (ehImagemEditor(c.arquivo)) return Number(c.duracao ?? 3) || 3
    const ini = Number(c.inicio ?? 0)
    const fim = Number(c.fim ?? 0)
    return fim > ini ? fim - ini : 0
  }
  const entradaNum = (valor, min, max, step, onChange) => {
    const i = el('input', { type: 'number', value: String(valor), min: String(min), max: String(max), step: String(step), style: 'width:64px' })
    i.addEventListener('change', () => {
      const n = Number(i.value)
      onChange(Number.isFinite(n) ? n : valor)
    })
    return i
  }
  function atualizarTotalEditor() {
    const soma = clipesEditor.reduce((s, c) => s + duracaoAproxEditor(c), 0)
    const semFim = clipesEditor.filter((c) => !ehImagemEditor(c.arquivo) && !Number(c.fim)).length
    lblTotalEditor.textContent = clipesEditor.length
      ? clipesEditor.length + ' clipe(s) · total ' + soma.toFixed(1) + 's' + (semFim ? ' (+ ' + semFim + ' sem fim definido usam a duração inteira)' : '')
      : 'Nenhum clipe na linha do tempo.'
  }
  function renderClipesEditor() {
    listaClipes.textContent = ''
    clipesEditor.forEach((c, i) => {
      const imagem = ehImagemEditor(c.arquivo)
      const chkMudo = el('input', { type: 'checkbox' })
      chkMudo.checked = c.mudo === true
      chkMudo.addEventListener('change', () => {
        c.mudo = chkMudo.checked
      })
      const mover = (para) => {
        if (para < 0 || para >= clipesEditor.length) return
        const [x] = clipesEditor.splice(i, 1)
        clipesEditor.splice(para, 0, x)
        renderClipesEditor()
      }
      listaClipes.appendChild(
        el('div', { style: 'border:1px solid var(--dg-border);border-radius:6px;padding:6px' },
          el('div', { style: 'display:flex;align-items:center;gap:6px;font-size:12px' },
            el('strong', { text: String(i + 1).padStart(2, '0') }),
            el('span', { className: 'muted', style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', text: nomeCurto(c.arquivo) }),
            el('span', { className: 'muted', style: 'font-size:10px', text: imagem ? 'imagem' : 'vídeo/áudio' }),
            botao('↑', () => mover(i - 1)),
            botao('↓', () => mover(i + 1)),
            botao('Onda', async () => {
              ondaEditor.textContent = 'Gerando forma de onda…'
              const r = await seguro('midia:onda', { raiz, entrada: c.arquivo })
              ondaEditor.textContent = ''
              if (!r?.ok) {
                ondaEditor.appendChild(el('p', { style: 'margin:0;color:#ff8a8a;font-size:12px', text: 'Erro: ' + (r?.erro || 'falha') }))
                return
              }
              if (r.previewBase64) {
                ondaEditor.appendChild(el('img', { src: r.previewBase64, alt: 'Forma de onda', style: 'max-width:100%;border-radius:6px;border:1px solid var(--dg-border)' }))
              }
              ondaEditor.appendChild(el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0 0', text: 'Onda salva em ' + (r.caminhoRel || r.caminho) }))
            }),
            botao('✕', () => {
              clipesEditor.splice(i, 1)
              renderClipesEditor()
            })
          ),
          el('div', { style: 'display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
            imagem
              ? campo('Duração s', entradaNum(c.duracao ?? 3, 0.2, 120, 0.5, (v) => { c.duracao = v; atualizarTotalEditor() }))
              : campo('Início s', entradaNum(c.inicio ?? 0, 0, 7200, 0.5, (v) => { c.inicio = v; atualizarTotalEditor() })),
            imagem
              ? null
              : campo('Fim s', entradaNum(c.fim ?? 0, 0, 7200, 0.5, (v) => { c.fim = v; atualizarTotalEditor() })),
            campo('Fade in s', entradaNum(c.fadeIn ?? 0, 0, 10, 0.5, (v) => { c.fadeIn = v })),
            campo('Fade out s', entradaNum(c.fadeOut ?? 0, 0, 10, 0.5, (v) => { c.fadeOut = v })),
            campo('Volume', entradaNum(c.volume ?? 1, 0, 2, 0.05, (v) => { c.volume = v })),
            campo('Mudo', chkMudo)
          )
        )
      )
    })
    atualizarTotalEditor()
  }
  function payloadEditor() {
    const [largura, altura] = String(resEditorCfg.value).split('x').map(Number)
    return {
      raiz,
      itens: clipesEditor.map((c) => ({
        arquivo: c.arquivo,
        inicio: c.inicio,
        fim: c.fim,
        duracao: c.duracao,
        volume: c.volume,
        fadeIn: c.fadeIn,
        fadeOut: c.fadeOut,
        mudo: c.mudo === true
      })),
      audioFundo: selTrilhaEditor.value || undefined,
      volumeFundo: Number(numFundoEditor.value),
      largura,
      altura,
      fps: Number(fpsEditor.value),
      fadeEntrada: Number(fadeInEditor.value),
      fadeSaida: Number(fadeOutEditor.value)
    }
  }
  if (window.api?.on) {
    window.api.on('midia:linha-tempo-progresso', (_e, ev) => {
      if (!ev || !ev.etapa) return
      resEditor.textContent = 'Exportando: ' + ev.etapa + ' (' + ev.atual + '/' + ev.total + ')…'
    })
  }
  corpo.appendChild(
    caixa(
      'Editor de vídeo/áudio (linha do tempo)',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Junte imagens, vídeos e áudios na ordem; cada clipe pode ser recortado e receber volume/fade. No final aplique fade global e música de fundo. Renderiza localmente com ffmpeg.' }),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        botao('Adicionar mídia', async () => {
          const caminhos = await escolher('midia', true)
          if (!caminhos.length) return
          for (const p of caminhos) clipesEditor.push({ arquivo: p, volume: 1, fadeIn: 0, fadeOut: 0 })
          if (clipesEditor.length > 40) {
            clipesEditor = clipesEditor.slice(0, 40)
            toast('Máximo de 40 clipes por exportação', 'aviso')
          }
          renderClipesEditor()
        }, true),
        botao('Limpar', () => {
          clipesEditor = []
          ondaEditor.textContent = ''
          renderClipesEditor()
        }),
        botao('Escolher música…', async () => {
          const [p] = await escolher('audio')
          if (!p) return
          selTrilhaEditor.appendChild(el('option', { value: p, text: nomeCurto(p) }))
          selTrilhaEditor.value = p
        }),
        botao('Abrir banco de músicas', () => void seguro('midia:musicas-pasta'))
      ),
      listaClipes,
      lblTotalEditor,
      el('div', { style: 'display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:6px' },
        campo('Música de fundo', selTrilhaEditor),
        campo('Volume fundo', numFundoEditor),
        campo('Resolução', resEditorCfg),
        campo('FPS', fpsEditor),
        campo('Fade entrada s', fadeInEditor),
        campo('Fade saída s', fadeOutEditor)
      ),
      el('div', { style: 'display:flex;gap:6px;margin-top:8px' },
        botao('Analisar', async () => {
          if (!clipesEditor.length) return toast('Adicione clipes à linha do tempo', 'aviso')
          resEditor.textContent = 'Analisando…'
          const r = await seguro('midia:linha-tempo-analisar', payloadEditor())
          if (!r?.ok) {
            resEditor.textContent = 'Erro: ' + (r?.erro || 'falha')
            return
          }
          resEditor.textContent = ''
          resEditor.appendChild(el('p', { style: 'margin:0;font-size:12px', text: 'Duração total: ' + r.duracaoSeg + 's · ' + (r.itens || []).length + ' clipe(s)' }))
          for (const it of r.itens || []) {
            resEditor.appendChild(
              el('div', { className: 'muted', style: 'font-size:11px', text: it.nome + ' — ' + it.tipo + ' · ' + it.duracao + 's' + (it.temAudio ? '' : ' · sem áudio') })
            )
          }
        }),
        botao('Exportar MP4', async () => {
          if (!clipesEditor.length) return toast('Adicione clipes à linha do tempo', 'aviso')
          resEditor.textContent = 'Exportando…'
          const r = await seguro('midia:linha-tempo-exportar', payloadEditor())
          mostrarResultado(resEditor, r)
          toast(r?.ok ? 'Linha do tempo exportada' : r?.erro || 'Falha ao exportar', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      ondaEditor,
      resEditor
    )
  )
  renderClipesEditor()
  void (async () => {
    const r = await seguro('midia:musicas')
    for (const m of r?.itens || []) selTrilhaEditor.appendChild(el('option', { value: m.caminho, text: m.nome }))
  })()

  // ------------------------------------------------------------ apps
  const appsInfo = el('div', { style: 'font-size:12px;line-height:1.6' })
  const appsLog = el('pre', {
    style: 'font:11px/1.45 ui-monospace,monospace;background:var(--dg-surface);border:1px solid var(--dg-border);border-radius:6px;padding:8px;max-height:150px;overflow:auto;white-space:pre-wrap;margin:8px 0 0',
    text: 'Sem build nesta sessão.'
  })
  const botoesApps = []
  const botaoApps = (texto, canal, payload, primario = false) => {
    const b = botao(texto, async () => {
      botoesApps.forEach((x) => (x.disabled = true))
      appsLog.textContent = texto + '… isso pode levar vários minutos.'
      const r = await seguro(canal, payload)
      const linhas = String(r?.log || r?.erro || 'sem saída').split(/\r?\n/).filter(Boolean)
      appsLog.textContent = linhas.slice(-40).join('\n')
      if (r?.status) renderAppsStatus(r.status)
      toast(r?.ok ? texto + ' concluído' : r?.erro || 'Falha no build', r?.ok ? 'ok' : 'erro')
      botoesApps.forEach((x) => (x.disabled = false))
    }, primario)
    botoesApps.push(b)
    return b
  }
  function renderAppsStatus(s) {
    appsInfo.textContent = ''
    if (!s) return
    const linha = (txt) => appsInfo.appendChild(el('div', { text: txt }))
    linha('Versão mobile ' + (s.versao || '?') + ' · ' + (s.sdk?.ok ? 'Android SDK pronto' : 'Android SDK ausente') + ' · Java ' + (s.sdk?.java || 'não detectado'))
    linha('Projeto: ' + (s.projeto?.mobile ? 'ok' : 'ausente') + ' · dependências: ' + (s.projeto?.dependencias ? 'ok' : 'ausentes') + ' · android: ' + (s.projeto?.androidGerado ? 'gerado' : 'ainda não gerado'))
    if (s.apk?.length) linha('APK mais recente: ' + s.apk[0].nome + ' (' + Math.round(s.apk[0].bytes / 1024) + ' KB)')
    if (s.instaladores?.length) linha('Instalador mais recente: ' + s.instaladores[0].nome + ' (' + Math.round(s.instaladores[0].bytes / 1048576) + ' MB)')
    linha('OneDrive/APP: ' + (s.pastas?.oneDrive || '?') + ' · ' + (s.publicados?.length || 0) + ' arquivo(s) publicado(s)')
    if (s.erro) linha('Aviso: ' + s.erro)
  }
  void (async () => {
    const s = await seguro('apps:status')
    renderAppsStatus(s?.status || s)
  })()
  corpo.appendChild(
    caixa(
      'Apps (APK Android + instalador)',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Gera DG-Apps APK (Capacitor, offline) e o instalador Windows; sempre copia uma via para OneDrive/APP.' }),
      appsInfo,
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px' },
        botaoApps('Instalar SDK Android', 'apps:instalar'),
        botaoApps('Gerar APK', 'apps:build', { tipo: 'apk' }, true),
        botaoApps('Gerar instalador', 'apps:build', { tipo: 'win' }),
        botaoApps('Gerar tudo', 'apps:build', { tipo: 'tudo' }, true),
        botaoApps('Publicar no OneDrive', 'apps:publicar')
      ),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px' },
        botao('Abrir OneDrive/APP', () => void seguro('apps:abrir-pasta', { qual: 'onedrive' })),
        botao('Abrir dist-apps', () => void seguro('apps:abrir-pasta', { qual: 'dist' }))
      ),
      el('p', { className: 'muted', style: 'font-size:11px;margin:6px 0 0', text: 'APK de depuração: instala direto no celular (fora da Play Store). Requer JDK 17 e internet na primeira instalação.' }),
      appsLog
    )
  )

  // ------------------------------------------------------------ portabilidade
  const diagPort = el('div', { style: 'font-size:12px;line-height:1.6' })
  corpo.appendChild(
    caixa(
      'Portabilidade do PC',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Confere as ferramentas embutidas no instalador (ffmpeg, Python, terminal) e o que é opcional neste PC.' }),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        botao('Verificar agora', async () => {
          diagPort.textContent = 'Verificando…'
          const r = await seguro('diag:portabilidade')
          diagPort.textContent = ''
          if (!r || (r.erro && !r.itens)) {
            diagPort.textContent = 'Erro: ' + (r?.erro || 'falha no diagnóstico')
            return
          }
          for (const it of r.itens || []) {
            const marca = it.ok ? '[OK] ' : it.obrigatorio ? '[FALTA] ' : '[!] '
            const cor = it.ok ? 'var(--dg-ok, #3fb950)' : it.obrigatorio ? 'var(--dg-erro, #f85149)' : 'var(--dg-aviso, #d29922)'
            diagPort.appendChild(
              el('div', { style: 'margin:2px 0' },
                el('strong', { style: 'color:' + cor, text: marca + it.titulo }),
                el('span', { className: 'muted', text: ' — ' + it.detalhe + (it.dica ? ' · ' + it.dica : '') })
              )
            )
          }
          diagPort.appendChild(
            el('div', {
              style: 'margin-top:6px',
              className: 'muted',
              text: (r.resumo?.ok ?? 0) + '/' + (r.resumo?.total ?? 0) + ' itens OK' + (r.embutido ? ' · ferramentas embutidas detectadas' : '')
            })
          )
        }, true)
      ),
      diagPort
    )
  )

  // ------------------------------------------- provisionamento automático
  const provInfo = el('div', { style: 'font-size:12px;line-height:1.6' })
  const provLog = el('div', { className: 'muted', style: 'font-size:11px;max-height:110px;overflow:auto;white-space:pre-wrap' })
  const autoProv = el('input', { type: 'checkbox', id: 'prov-auto' })
  autoProv.checked = true
  autoProv.style.margin = '0 4px 0 0'
  const rotuloAuto = el('label', { style: 'font-size:12px;display:flex;align-items:center;gap:2px;cursor:pointer' }, autoProv, el('span', { text: 'Manter ferramentas atualizadas automaticamente' }))

  function linhaProv(ev) {
    const quando = new Date().toLocaleTimeString('pt-BR')
    const pct = ev && typeof ev.total === 'number' && ev.total > 0 ? ' (' + Math.min(100, Math.round((ev.recebido / ev.total) * 100)) + '%)' : ''
    provLog.appendChild(el('div', { text: '[' + quando + '] ' + ev.id + ': ' + ev.mensagem + pct }))
    while (provLog.childElementCount > 40) provLog.removeChild(provLog.firstChild)
    provLog.scrollTop = provLog.scrollHeight
  }

  async function atualizarStatusProv() {
    provInfo.textContent = 'Consultando…'
    const s = await seguro('prov:status')
    provInfo.textContent = ''
    if (!s || s.erro) {
      provInfo.textContent = 'Erro: ' + (s?.erro || 'falha ao consultar')
      return
    }
    provInfo.appendChild(
      el('div', {
        className: 'muted',
        style: 'font-size:11px',
        text:
          (s.rotulo || s.plataforma) +
          (s.suportado ? '' : ' · não suportado: ' + (s.motivo || '?')) +
          (typeof s.espacoLivreMB === 'number' ? ' · ' + s.espacoLivreMB + ' MB livres em ' + (s.pasta || '') : '')
      })
    )
    for (const it of s.itens || []) {
      const cor = it.ok ? 'var(--dg-ok, #3fb950)' : it.estado === 'incompativel' ? 'var(--dg-aviso, #d29922)' : 'var(--dg-erro, #f85149)'
      provInfo.appendChild(
        el('div', { style: 'margin:2px 0' },
          el('strong', { style: 'color:' + cor, text: (it.ok ? '[OK] ' : '[!] ') + it.nome }),
          el('span', { className: 'muted', text: ' — ' + it.detalhe + (it.origem ? ' · ' + it.origem : '') })
        )
      )
    }
    if (s.emAndamento) provInfo.appendChild(el('div', { className: 'muted', text: 'Download em andamento…' }))
    if (s.ultimoErro) {
      provInfo.appendChild(
        el('div', { className: 'muted', style: 'color:var(--dg-aviso, #d29922);font-size:11px', text: 'Última falha: ' + s.ultimoErro.detalhe })
      )
    }
  }

  async function executarProv(forcar) {
    provLog.textContent = 'Iniciando…'
    const r = await seguro('prov:executar', { forcar: Boolean(forcar) })
    for (const it of (r && r.resultados) || []) {
      provLog.appendChild(el('div', { text: (it.ok ? '[OK] ' : '[FALHA] ') + it.id + ': ' + it.detalhe }))
    }
    await atualizarStatusProv()
  }

  autoProv.addEventListener('change', () => void seguro('prov:preferencias', { auto: autoProv.checked }))
  if (window.api?.on) window.api.on('prov:progresso', (_e, ev) => linhaProv(ev))

  corpo.appendChild(
    caixa(
      'Ferramentas automáticas (download no PC novo)',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Baixa sempre o ffmpeg mais recente, o Python portátil (quando faltar) e os pacotes de voz/transcrição compatíveis com este PC. Tudo grátis, gravado em %LOCALAPPDATA%\\dg-editor\\ferramentas.' }),
      rotuloAuto,
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0' },
        botao('Baixar o que falta', () => void executarProv(false), true),
        botao('Forçar atualização', () => void executarProv(true)),
        botao('Atualizar status', () => void atualizarStatusProv())
      ),
      provInfo,
      provLog
    )
  )
  void (async () => {
    const p = await seguro('prov:preferencias')
    if (p && typeof p.auto === 'boolean') autoProv.checked = p.auto
    await atualizarStatusProv()
  })()

  // ------------------------------------------------------------ efeitos de vídeo
  let videoEscolhido = null
  let segundaEscolhida = null
  const lblVideoFx = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Escolha um vídeo (MP4/MOV/MKV/WEBM).' })
  const lblSegunda = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Nenhum segundo arquivo escolhido (necessário para transição, PiP e chroma key).' })
  const resEfeito = el('div', { style: 'font-size:12px' })
  const resCenas = el('div', { style: 'font-size:12px' })
  const gridCenas = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:6px' })
  const catalogoFx = await seguro('midia:video-efeitos')
  const listaEfeitos = Array.isArray(catalogoFx?.efeitos) ? catalogoFx.efeitos : []
  const selEfeito = select(listaEfeitos.map((e) => [e.id, e.rotulo]), listaEfeitos[0]?.id || 'aprimorar')
  const descEfeito = el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: listaEfeitos[0]?.descricao || '' })

  const nFator = el('input', { type: 'number', value: '2', min: '1', max: '4', step: '0.5', style: 'width:64px' })
  const nDenoise = el('input', { type: 'number', value: '0.25', min: '0', max: '1', step: '0.05', style: 'width:64px' })
  const nNitidez = el('input', { type: 'number', value: '0.7', min: '0', max: '2', step: '0.1', style: 'width:64px' })
  const nGrao = el('input', { type: 'number', value: '0', min: '0', max: '100', step: '5', style: 'width:64px' })
  const nFps = el('input', { type: 'number', value: '60', min: '15', max: '240', step: '1', style: 'width:64px' })
  const chkSuave = el('input', { type: 'checkbox' })
  const nSlow = el('input', { type: 'number', value: '1', min: '1', max: '8', step: '0.25', style: 'width:64px' })
  const nTaxa = el('input', { type: 'number', value: '1', min: '0.25', max: '4', step: '0.25', style: 'width:64px' })
  const selLook = select((catalogoFx?.cores || []).map((c) => [c.id, c.rotulo]), 'cinema')
  const inTexto = entrada({ placeholder: 'Texto do título' })
  const inCor = el('input', { type: 'text', value: '#ffffff', style: 'width:90px' })
  const nTamanho = el('input', { type: 'number', value: '48', min: '12', max: '200', step: '1', style: 'width:64px' })
  const selPosicao = select([['base', 'Base'], ['centro', 'Centro'], ['topo', 'Topo']], 'base')
  const nDuracao = el('input', { type: 'number', value: '1', min: '0.2', max: '10', step: '0.1', style: 'width:64px' })
  const selTipo = select((catalogoFx?.transicoes || ['fade']).map((t) => [t, t]), 'fade')
  const nEscala = el('input', { type: 'number', value: '0.3', min: '0.05', max: '1', step: '0.05', style: 'width:64px' })
  const selPosPip = select(
    [
      ['inferior-direito', 'Inferior direito'],
      ['inferior-esquerdo', 'Inferior esquerdo'],
      ['superior-direito', 'Superior direito'],
      ['superior-esquerdo', 'Superior esquerdo']
    ],
    'inferior-direito'
  )
  const nOpacidade = el('input', { type: 'number', value: '1', min: '0.05', max: '1', step: '0.05', style: 'width:64px' })
  const nSimilaridade = el('input', { type: 'number', value: '0.16', min: '0.01', max: '1', step: '0.01', style: 'width:64px' })
  const nMistura = el('input', { type: 'number', value: '0.1', min: '0', max: '1', step: '0.05', style: 'width:64px' })
  const nRegX = el('input', { type: 'number', value: '20', min: '0', step: '1', style: 'width:70px' })
  const nRegY = el('input', { type: 'number', value: '20', min: '0', step: '1', style: 'width:70px' })
  const nRegW = el('input', { type: 'number', value: '240', min: '2', step: '1', style: 'width:70px' })
  const nRegH = el('input', { type: 'number', value: '90', min: '2', step: '1', style: 'width:70px' })
  const nIntensidade = el('input', { type: 'number', value: '10', min: '1', max: '30', step: '1', style: 'width:64px' })

  const camposFx = {
    fator: campo('Upscale (1–4×)', nFator),
    denoise: campo('Denoise', nDenoise),
    nitidez: campo('Nitidez', nNitidez),
    grao: campo('Grão', nGrao),
    fps: campo('FPS alvo', nFps),
    suave: campo('Suave (rápido)', chkSuave),
    slow: campo('Slow motion', nSlow),
    taxa: campo('Velocidade', nTaxa),
    preset: campo('Look de cor', selLook),
    texto: campo('Título', inTexto),
    cor: campo('Cor (#hex)', inCor),
    tamanho: campo('Tamanho', nTamanho),
    posicao: campo('Posição', selPosicao),
    duracao: campo('Duração (s)', nDuracao),
    tipo: campo('Transição', selTipo),
    escala: campo('Escala PiP', nEscala),
    posicaoPip: campo('Posição PiP', selPosPip),
    opacidade: campo('Opacidade', nOpacidade),
    similaridade: campo('Similaridade', nSimilaridade),
    mistura: campo('Mistura', nMistura),
    regiao: el('div', { style: 'display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap' },
      campo('X', nRegX), campo('Y', nRegY), campo('Largura', nRegW), campo('Altura', nRegH)),
    intensidade: campo('Intensidade', nIntensidade)
  }
  const areaCampos = el('div', { style: 'display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:8px' })
  function atualizarCamposEfeito() {
    const id = selEfeito.value
    const def = listaEfeitos.find((e) => e.id === id)
    descEfeito.textContent = def ? def.descricao : ''
    areaCampos.textContent = ''
    for (const chave of def?.opcoes || []) if (camposFx[chave]) areaCampos.appendChild(camposFx[chave])
    if (id === 'gif') {
      // Aproveita "duração" e "tamanho" (largura do GIF) nos mesmos campos.
      areaCampos.textContent = ''
      areaCampos.appendChild(campo('Duração (s)', nDuracao))
      areaCampos.appendChild(campo('Largura do GIF', nTamanho))
    }
  }
  selEfeito.addEventListener('change', atualizarCamposEfeito)
  atualizarCamposEfeito()

  corpo.appendChild(
    caixa(
      'Efeitos de vídeo (estilo Topaz / PowerDirector / Filmora)',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Upscale, interpolação de quadros, slow motion, transições, PiP, chroma key, títulos, looks de cor, reframe vertical, remoção de logo/blur, proxy, correção de lente, GIF e extração de áudio. Tudo processado localmente pelo ffmpeg embutido.' }),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        botao('Escolher vídeo', async () => {
          const [p] = await escolher('video')
          if (!p) return
          videoEscolhido = p
          lblVideoFx.textContent = nomeCurto(p)
        }),
        botao('Escolher 2º arquivo', async () => {
          const [p] = await escolher('midia')
          if (!p) return
          segundaEscolhida = p
          lblSegunda.textContent = 'Segundo arquivo: ' + nomeCurto(p)
        })
      ),
      lblVideoFx,
      lblSegunda,
      campo('Efeito', selEfeito),
      descEfeito,
      areaCampos,
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px' },
        botao('Aplicar efeito', async () => {
          if (!videoEscolhido) return toast('Escolha um vídeo', 'aviso')
          resEfeito.textContent = 'Processando (pode levar alguns minutos)…'
          const r = await seguro('midia:video-efeito', {
            raiz,
            entrada: videoEscolhido,
            segunda: segundaEscolhida || undefined,
            efeito: selEfeito.value,
            fator: Number(nFator.value),
            denoise: Number(nDenoise.value),
            nitidez: Number(nNitidez.value),
            grao: Number(nGrao.value),
            fps: Number(nFps.value),
            suave: chkSuave.checked,
            slow: Number(nSlow.value),
            taxa: Number(nTaxa.value),
            preset: selLook.value,
            texto: inTexto.value,
            cor: inCor.value,
            tamanho: Number(nTamanho.value),
            posicao: selPosicao.value,
            duracao: Number(nDuracao.value),
            tipo: selTipo.value,
            escala: Number(nEscala.value),
            posicaoPip: selPosPip.value,
            opacidade: Number(nOpacidade.value),
            similaridade: Number(nSimilaridade.value),
            mistura: Number(nMistura.value),
            regiao: { x: Number(nRegX.value), y: Number(nRegY.value), w: Number(nRegW.value), h: Number(nRegH.value) },
            intensidade: Number(nIntensidade.value)
          })
          mostrarResultado(resEfeito, r)
          toast(r?.ok ? 'Efeito aplicado' : r?.erro || 'Falha ao aplicar', r?.ok ? 'ok' : 'erro')
          void atualizarGaleria()
        }, true),
        botao('Detectar cenas (destaques)', async () => {
          if (!videoEscolhido) return toast('Escolha um vídeo', 'aviso')
          resCenas.textContent = 'Detectando cortes…'
          gridCenas.textContent = ''
          const r = await seguro('midia:cenas', { raiz, entrada: videoEscolhido, limiar: 0.32, max: 12 })
          const cenas = r?.detalhes?.cenas || []
          resCenas.textContent = r?.ok ? cenas.length + ' cena(s): ' + cenas.map((c) => c.tempo + 's').join(' · ') : 'Erro: ' + (r?.erro || 'falha')
          for (const c of cenas) {
            const img = await seguro('arquivo:ler-base64', c.miniatura, [raiz])
            if (img?.ok && img.dataUrl) gridCenas.appendChild(el('img', { src: img.dataUrl, alt: 'Cena em ' + c.tempo + 's', style: 'width:100%;border-radius:6px;border:1px solid var(--dg-border)' }))
          }
        })
      ),
      resEfeito,
      resCenas,
      gridCenas
    )
  )

  // ------------------------------------------------------------ efeitos de voz
  let audioVoz = null
  const lblVozFx = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Escolha um áudio com voz (MP3/WAV/M4A/OGG/FLAC).' })
  const resVozFx = el('div', { style: 'font-size:12px' })
  const catalogoVoz = await seguro('midia:voz-presets')
  const presetsVoz = Array.isArray(catalogoVoz?.presets) ? catalogoVoz.presets : []
  const selPresetVoz = select(presetsVoz.map((p) => [p.id, p.rotulo]), 'grave')
  const descPresetVoz = el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: presetsVoz.find((p) => p.id === 'grave')?.descricao || '' })
  const nVozIntensidade = el('input', { type: 'number', value: '0.7', min: '0.1', max: '1', step: '0.1', style: 'width:64px' })
  const chkRuido = el('input', { type: 'checkbox' })
  chkRuido.checked = true
  const chkDeesser = el('input', { type: 'checkbox' })
  const chkSilencios = el('input', { type: 'checkbox' })
  const chkNormalizarVoz = el('input', { type: 'checkbox' })
  chkNormalizarVoz.checked = true
  const selFormatoVoz = select([['mp3', 'MP3'], ['wav', 'WAV'], ['m4a', 'M4A'], ['ogg', 'OGG']], 'mp3')
  selPresetVoz.addEventListener('change', () => {
    descPresetVoz.textContent = presetsVoz.find((p) => p.id === selPresetVoz.value)?.descricao || ''
  })
  corpo.appendChild(
    caixa(
      'Efeitos de voz (estilo RealVoice / PowerDirector)',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Muda o timbre (grave, agudo, criança, monstro, robô), simula telefone/rádio/caverna/megafone e limpa ruído, chiado e silêncios. Processamento local, sem enviar áudio para a nuvem.' }),
      botao('Escolher áudio', async () => {
        const [p] = await escolher('audio')
        if (!p) return
        audioVoz = p
        lblVozFx.textContent = nomeCurto(p)
      }),
      lblVozFx,
      campo('Preset de voz', selPresetVoz),
      descPresetVoz,
      el('div', { style: 'display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-top:8px' },
        campo('Intensidade', nVozIntensidade),
        campo('Reduzir ruído', chkRuido),
        campo('De-esser', chkDeesser),
        campo('Cortar silêncios', chkSilencios),
        campo('Normalizar', chkNormalizarVoz),
        campo('Formato', selFormatoVoz)
      ),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px' },
        botao('Aplicar voz', async () => {
          if (!audioVoz) return toast('Escolha um áudio', 'aviso')
          resVozFx.textContent = 'Processando voz…'
          const r = await seguro('midia:voz-efeito', {
            raiz,
            entrada: audioVoz,
            preset: selPresetVoz.value,
            intensidade: Number(nVozIntensidade.value),
            reduzirRuido: chkRuido.checked,
            deesser: chkDeesser.checked,
            cortarSilencios: chkSilencios.checked,
            normalizar: chkNormalizarVoz.checked,
            formato: selFormatoVoz.value
          })
          mostrarResultado(resVozFx, r)
          toast(r?.ok ? 'Voz processada' : r?.erro || 'Falha na voz', r?.ok ? 'ok' : 'erro')
          void atualizarGaleria()
        }, true)
      ),
      resVozFx
    )
  )

  // ------------------------------------------------------------ imagens e ISO
  let imagemIso = null
  let unidadeIso = null
  const lblIso = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Nenhuma imagem escolhida (ISO, IMG ou DMG).' })
  const resIso = el('div', { style: 'font-size:12px' })
  const listaUsb = el('div', { style: 'display:flex;flex-direction:column;gap:4px;margin-top:6px' })
  const dicaToken = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0 0' })
  const tokenUsb = entrada({ placeholder: 'Digite o serial da unidade para liberar a gravação' })
  const chkVerificarUsb = el('input', { type: 'checkbox' })
  chkVerificarUsb.checked = true
  const chkApagar = el('input', { type: 'checkbox' })
  const progressoUsb = el('div', { style: 'font-size:11px;margin-top:6px;min-height:14px' })
  const resUsb = el('div', { style: 'font-size:12px' })
  const suporteIso = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Suporte pycdlib: verificando…' })
  const rotuloIso = entrada({ placeholder: 'Rótulo do volume (opcional, ex.: WIN11_CUSTOM)' })
  const resExtrair = el('div', { style: 'font-size:12px' })
  const resReconstruir = el('div', { style: 'font-size:12px' })
  const avisoAdmin = el('p', { className: 'muted', style: 'font-size:11px;margin:4px 0', text: 'Permissão de administrador: verificando…' })
  const resHash = el('div', { style: 'font-size:11px;word-break:break-all' })
  const conteudoIso = el('div', { style: 'font-size:11px;max-height:180px;overflow:auto;border:1px solid var(--dg-border-subtle);border-radius:6px;padding:6px;margin-top:6px;display:none' })
  const filtroConteudo = entrada({ placeholder: 'Filtrar conteúdo (ex.: install.wim, boot)' })
  let itensConteudo = []
  const resUnattend = el('div', { style: 'font-size:11px' })
  const selEdicaoWin = select([
    ['Professional', 'Professional'],
    ['Core', 'Home (Core)'],
    ['HomeSingleLanguage', 'Home Single Language'],
    ['Enterprise', 'Enterprise'],
    ['Education', 'Education']
  ], 'Professional')
  const selCanalWin = select([['Retail', 'Retail'], ['Volume', 'Volume'], ['OEM', 'OEM']], 'Retail')
  const nomePcWin = entrada({ placeholder: 'Nome do PC (opcional, até 15 caracteres)' })
  const resPreset = el('div', { style: 'font-size:11px' })
  const nomePreset = entrada({ placeholder: 'Nome do preset (ex.: win11-pro)' })
  const listaPresets = el('div', { style: 'display:flex;flex-direction:column;gap:4px;margin-top:6px' })

  function formatarSegundos(s) {
    if (!Number.isFinite(s) || s <= 0) return ''
    if (s < 60) return Math.round(s) + 's'
    const m = Math.floor(s / 60)
    const r = Math.round(s % 60)
    return m + 'min' + (r ? ' ' + r + 's' : '')
  }

  function pintarConteudo() {
    conteudoIso.textContent = ''
    const filtro = filtroConteudo.value.trim().toLowerCase()
    const vistos = filtro ? itensConteudo.filter((i) => i.nome.toLowerCase().includes(filtro)) : itensConteudo
    if (!vistos.length) {
      conteudoIso.appendChild(el('p', { className: 'muted', style: 'margin:0', text: filtro ? 'Nada corresponde ao filtro.' : 'Nenhum item listado.' }))
      return
    }
    for (const item of vistos.slice(0, 800)) {
      conteudoIso.appendChild(
        el('div', { style: 'display:flex;gap:6px;justify-content:space-between;padding:1px 0;border-bottom:1px solid var(--dg-border-subtle)' },
          el('span', { style: 'word-break:break-all', text: (item.pasta ? '📁 ' : '') + item.nome }),
          el('span', { className: 'muted', style: 'white-space:nowrap', text: item.pasta || !item.bytes ? '' : mb(item.bytes) })
        )
      )
    }
    if (vistos.length > 800) {
      conteudoIso.appendChild(el('p', { className: 'muted', style: 'margin:4px 0 0', text: '… ' + (vistos.length - 800) + ' item(ns) omitido(s)' }))
    }
  }

  async function listarConteudoIsoUi() {
    if (!imagemIso) return toast('Escolha uma imagem primeiro', 'aviso')
    conteudoIso.style.display = 'block'
    conteudoIso.textContent = 'Lendo o conteúdo da ISO…'
    const r = await seguro('imagens:listar-conteudo', { raiz, entrada: imagemIso, limite: 2000 })
    if (!r?.ok) {
      conteudoIso.textContent = ''
      conteudoIso.appendChild(el('p', { style: 'margin:0;color:#ff8a8a', text: 'Erro: ' + (r?.erro || 'falha ao listar') }))
      return
    }
    const bruto = r.detalhes?.itens || r.detalhes?.conteudo || []
    itensConteudo = (Array.isArray(bruto) ? bruto : []).map((i) => ({
      nome: String(i.nome || i.caminho || ''),
      pasta: !!i.pasta,
      bytes: Number(i.bytes) || 0
    }))
    pintarConteudo()
  }

  async function atualizarPresets() {
    const r = await seguro('imagens:presets-listar', { raiz })
    listaPresets.textContent = ''
    const itens = Array.isArray(r?.itens) ? r.itens : []
    if (!itens.length) {
      listaPresets.appendChild(el('p', { className: 'muted', style: 'margin:0', text: 'Nenhum preset salvo ainda.' }))
      return
    }
    for (const p of itens) {
      listaPresets.appendChild(
        el('div', { style: 'display:flex;gap:6px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--dg-border-subtle);padding:2px 0' },
          el('span', { style: 'word-break:break-all', text: p.id + ' · ' + p.arquivos + ' arquivo(s)' }),
          botao('Aplicar', async () => {
            const a = await seguro('imagens:presets-aplicar', { raiz, nome: p.id })
            toast(a?.ok ? 'Preset aplicado na pasta de personalização' : a?.erro || 'Falha ao aplicar', a?.ok ? 'ok' : 'erro')
          })
        )
      )
    }
  }

  const mb = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(0, Math.round(bytes / 1024)) + ' KB')
  const gb = (bytes) => (bytes / 1073741824).toFixed(1) + ' GB'

  function pintarAnaliseIso(r) {
    resIso.textContent = ''
    if (!r?.ok) {
      resIso.appendChild(el('p', { style: 'margin:0;color:#ff8a8a;font-size:12px', text: 'Erro: ' + (r?.erro || 'falha ao analisar') }))
      return
    }
    const boot = []
    if (r.boot?.bios) boot.push('BIOS')
    if (r.boot?.uefi) boot.push('UEFI')
    if (r.boot?.eltorito) boot.push('El Torito')
    if (r.boot?.gpt) boot.push('GPT')
    if (r.boot?.mbr) boot.push('MBR')
    if (r.boot?.hfs) boot.push('HFS')
    const sistemas = []
    if (r.iso?.iso9660) sistemas.push('ISO 9660')
    if (r.iso?.joliet) sistemas.push('Joliet')
    if (r.iso?.udf) sistemas.push('UDF')
    resIso.appendChild(
      el('p', { style: 'margin:0;font-size:12px', text: (r.rotulo || '(sem rótulo)') + ' · ' + (r.sistema || 'desconhecido') + (r.distro && r.distro !== r.sistema ? ' (' + r.distro + ')' : '') })
    )
    resIso.appendChild(el('p', { className: 'muted', style: 'margin:2px 0 0;font-size:11px', text: (r.formato || '').toUpperCase() + ' · ' + mb(r.bytes || 0) + (sistemas.length ? ' · ' + sistemas.join(' + ') : '') }))
    resIso.appendChild(el('p', { className: 'muted', style: 'margin:2px 0 0;font-size:11px', text: 'Boot: ' + (boot.length ? boot.join(' + ') : 'não detectado') }))
    const raiz = Array.isArray(r.iso?.raiz) ? r.iso.raiz : []
    if (raiz.length) {
      const amostra = raiz.slice(0, 12).map((i) => (i.pasta ? '📁 ' : '') + i.nome).join(' · ')
      resIso.appendChild(el('p', { className: 'muted', style: 'margin:2px 0 0;font-size:11px;word-break:break-word', text: 'Raiz: ' + amostra + (raiz.length > 12 ? ' …' : '') }))
    }
    if (Array.isArray(r.avisos) && r.avisos.length) {
      resIso.appendChild(el('p', { style: 'margin:2px 0 0;font-size:11px;color:#e8b45a', text: r.avisos.join(' · ') }))
    }
    if (!rotuloIso.value && r.rotulo) rotuloIso.value = r.rotulo
  }

  async function analisarImagemIso(caminho) {
    resIso.textContent = 'Analisando imagem…'
    resHash.textContent = ''
    conteudoIso.style.display = 'none'
    itensConteudo = []
    const r = await seguro('imagens:analisar', { raiz, caminho })
    pintarAnaliseIso(r)
    if (r?.ok) toast('Imagem analisada', 'ok')
    else toast(r?.erro || 'Falha ao analisar', 'erro')
  }

  async function listarPendrives() {
    listaUsb.textContent = 'Procurando unidades removíveis…'
    unidadeIso = null
    const r = await seguro('imagens:usb-listar')
    listaUsb.textContent = ''
    if (!r?.ok) {
      listaUsb.appendChild(el('p', { style: 'margin:0;color:#ff8a8a;font-size:12px', text: 'Erro: ' + (r?.erro || 'falha ao listar') }))
      return
    }
    const unidades = Array.isArray(r.unidades) ? r.unidades : []
    if (!unidades.length) {
      listaUsb.appendChild(el('p', { className: 'muted', style: 'margin:0;font-size:11px', text: 'Nenhum pendrive ou cartão SD conectado.' }))
      return
    }
    for (const u of unidades) {
      const radio = el('input', { type: 'radio', name: 'dg-usb-escolha' })
      radio.disabled = !u.podeGravar
      radio.addEventListener('change', () => {
        unidadeIso = u
        tokenUsb.value = ''
        dicaToken.textContent = 'Confirme digitando: ' + u.token
      })
      const texto = u.nome + ' · disco ' + u.disco + ' · ' + gb(u.tamanhoBytes || 0) + ' · ' + (u.bus || '?') + (u.volumes?.length ? ' · ' + u.volumes.map((v) => v + ':').join(' ') : '')
      listaUsb.appendChild(
        el('label', { style: 'display:flex;gap:8px;align-items:flex-start;font-size:11px;padding:4px 0;border-bottom:1px solid var(--dg-border-subtle)' },
          radio,
          el('span', {}, el('span', { text: texto }), u.motivo ? el('span', { style: 'display:block;color:#e8b45a', text: u.motivo }) : null)
        )
      )
    }
  }

  if (cancelarProgressoUsb) cancelarProgressoUsb()
  let inicioProgressoUsb = 0
  cancelarProgressoUsb = window.api.on('imagens:usb-progresso', (_ev, ev) => {
    if (!ev) return
    if (ev.etapa === 'verificando') {
      progressoUsb.textContent = 'Verificando a gravação (leitura de volta)…'
      return
    }
    if (!inicioProgressoUsb) inicioProgressoUsb = Date.now()
    const pct = ev.total ? Math.min(100, Math.round((ev.escritos / ev.total) * 100)) : 0
    const decorrido = (Date.now() - inicioProgressoUsb) / 1000
    const taxa = decorrido > 0.5 ? (ev.escritos || 0) / decorrido : 0
    const restante = taxa > 0 && ev.total ? formatarSegundos((ev.total - ev.escritos) / taxa) : ''
    progressoUsb.textContent =
      'Gravando… ' + pct + '% (' + mb(ev.escritos || 0) + ' de ' + mb(ev.total || 0) + ')' +
      (restante ? ' · faltam ~' + restante : '')
  })

  filtroConteudo.addEventListener('input', () => pintarConteudo())

  corpo.appendChild(
    caixa(
      'Imagens e ISO (estilo Rufus)',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Analise ISO/IMG/DMG de Windows, Linux e macOS, personalize o conteúdo (extrair, injetar arquivos e reconstruir mantendo boot BIOS/UEFI) e grave em pendrive. Gravação crua apaga a unidade — só discos USB/SD são aceitos, nunca o disco do sistema, e é preciso digitar o serial para confirmar.' }),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        botao('Escolher imagem', async () => {
          const r = await seguro('imagens:escolher-imagem')
          if (!r?.ok || r.cancelado || !r.caminho) return
          imagemIso = r.caminho
          lblIso.textContent = nomeCurto(r.caminho)
          await analisarImagemIso(r.caminho)
        }, true),
        botao('Analisar', async () => {
          if (!imagemIso) return toast('Escolha uma imagem primeiro', 'aviso')
          await analisarImagemIso(imagemIso)
        }),
        botao('Listar conteúdo', () => void listarConteudoIsoUi()),
        botao('SHA-256', async () => {
          if (!imagemIso) return toast('Escolha uma imagem primeiro', 'aviso')
          resHash.textContent = 'Calculando SHA-256…'
          const r = await seguro('imagens:hash', { raiz, caminho: imagemIso })
          resHash.textContent = r?.ok ? 'SHA-256: ' + r.hash : 'Falha no hash: ' + (r?.erro || 'erro')
        }),
        botao('Listar pendrives', () => void listarPendrives()),
        botao('Abrir pasta de personalização', () => void seguro('imagens:abrir-overlay', { raiz }))
      ),
      lblIso,
      resIso,
      resHash,
      suporteIso,
      avisoAdmin,
      filtroConteudo,
      conteudoIso,
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px' },
        botao('Extrair ISO', async () => {
          if (!imagemIso) return toast('Escolha uma imagem primeiro', 'aviso')
          resExtrair.textContent = 'Extraindo…'
          const r = await seguro('imagens:extrair', { raiz, entrada: imagemIso })
          mostrarResultado(resExtrair, r)
          toast(r?.ok ? 'Conteúdo extraído' : r?.erro || 'Falha ao extrair', r?.ok ? 'ok' : 'erro')
        }),
        botao('Reconstruir ISO personalizada', async () => {
          if (!imagemIso) return toast('Escolha uma imagem primeiro', 'aviso')
          resReconstruir.textContent = 'Reconstruindo (extrai, injeta a pasta de personalização e recria o boot)…'
          const r = await seguro('imagens:reconstruir', { raiz, entrada: imagemIso, rotulo: rotuloIso.value.trim() || undefined })
          mostrarResultado(resReconstruir, r)
          toast(r?.ok ? 'ISO personalizada criada' : r?.erro || 'Falha ao reconstruir', r?.ok ? 'ok' : 'erro')
        }, true)
      ),
      campo('Rótulo do volume ao reconstruir', rotuloIso),
      resExtrair,
      resReconstruir,
      el('h5', { style: 'margin:12px 0 4px;font-size:12px', text: 'Instalação sem supervisão (autounattend.xml + ei.cfg)' }),
      el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap' },
        campo('Edição', selEdicaoWin),
        campo('Canal', selCanalWin),
        campo('Nome do PC', nomePcWin),
        botao('Gerar arquivos', async () => {
          const r = await seguro('imagens:unattend', {
            raiz,
            edicao: selEdicaoWin.value,
            canal: selCanalWin.value,
            nomePc: nomePcWin.value.trim() || undefined
          })
          resUnattend.textContent = r?.ok
            ? 'Criado: ' + (r.detalhes?.arquivos || []).join(' · ')
            : 'Falha: ' + (r?.erro || 'erro')
          toast(r?.ok ? 'autounattend.xml e ei.cfg criados' : r?.erro || 'Falha', r?.ok ? 'ok' : 'erro')
        })
      ),
      resUnattend,
      el('h5', { style: 'margin:10px 0 4px;font-size:12px', text: 'Presets de personalização' }),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end' },
        campo('Nome do preset', nomePreset),
        botao('Salvar atual', async () => {
          if (!nomePreset.value.trim()) return toast('Informe um nome para o preset', 'aviso')
          const r = await seguro('imagens:presets-salvar', { raiz, nome: nomePreset.value.trim() })
          resPreset.textContent = r?.ok ? 'Preset salvo (' + (r.detalhes?.arquivos || 0) + ' arquivo(s))' : 'Falha: ' + (r?.erro || 'erro')
          toast(r?.ok ? 'Preset salvo' : r?.erro || 'Falha ao salvar', r?.ok ? 'ok' : 'erro')
          if (r?.ok) void atualizarPresets()
        }),
        botao('Atualizar lista', () => void atualizarPresets())
      ),
      resPreset,
      listaPresets,
      el('h5', { style: 'margin:12px 0 4px;font-size:12px', text: 'Gravar em pendrive (apaga todos os dados)' }),
      listaUsb,
      campo('Confirmação', tokenUsb),
      dicaToken,
      el('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:6px' },
        el('label', { style: 'display:flex;gap:6px;align-items:center;font-size:11px' }, chkVerificarUsb, 'Verificar após gravar'),
        el('label', { style: 'display:flex;gap:6px;align-items:center;font-size:11px' }, chkApagar, 'Entendi que todos os dados da unidade serão apagados')
      ),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px' },
        botao('Gravar USB', async () => {
          if (!imagemIso) return toast('Escolha uma imagem primeiro', 'aviso')
          if (!unidadeIso) return toast('Selecione um pendrive na lista', 'aviso')
          if (tokenUsb.value.trim().toUpperCase() !== String(unidadeIso.token).toUpperCase()) {
            return toast('Confirmação não confere — digite exatamente ' + unidadeIso.token, 'erro')
          }
          if (!chkApagar.checked) return toast('Marque a caixa confirmando que os dados serão apagados', 'aviso')
          const ok = window.confirm('Gravar ' + nomeCurto(imagemIso) + ' em "' + unidadeIso.nome + '" (disco ' + unidadeIso.disco + ')?\n\nTODOS os dados da unidade serão apagados. Se o DG Editor não estiver como administrador, a gravação será recusada.')
          if (!ok) return
          inicioProgressoUsb = 0
          progressoUsb.textContent = 'Preparando gravação…'
          resUsb.textContent = ''
          const r = await seguro('imagens:usb-gravar', {
            raiz,
            imagem: imagemIso,
            disco: unidadeIso.disco,
            serial: unidadeIso.serial,
            confirmacao: tokenUsb.value.trim(),
            verificar: chkVerificarUsb.checked
          })
          progressoUsb.textContent = ''
          mostrarResultado(resUsb, r?.ok ? { ...r, aviso: (r.verificado ? 'verificado · ' : '') + (r.duracaoSeg + 's') } : r)
          toast(r?.ok ? 'Gravação concluída' : r?.erro || 'Falha na gravação', r?.ok ? 'ok' : 'erro')
        }, true),
        botao('Cancelar gravação', async () => {
          const r = await seguro('imagens:usb-cancelar')
          toast(r?.ok ? 'Cancelando — aguarde o processo encerrar' : r?.erro || 'Nada para cancelar', r?.ok ? 'aviso' : 'erro')
        }),
        botao('Instalar suporte ISO (pycdlib)', async () => {
          suporteIso.textContent = 'Instalando pycdlib no Python do app…'
          const r = await seguro('imagens:instalar-suporte')
          suporteIso.textContent = r?.ok ? 'Suporte pycdlib: ' + (r.versao || 'ok') : 'Suporte pycdlib indisponível: ' + (r?.erro || 'falha')
          toast(r?.ok ? 'Suporte ISO pronto' : r?.erro || 'Falha ao instalar', r?.ok ? 'ok' : 'erro')
        })
      ),
      progressoUsb,
      resUsb
    )
  )

  void seguro('imagens:suporte').then((r) => {
    suporteIso.textContent = r?.ok ? 'Suporte pycdlib: ' + (r.versao || 'ok') : 'Suporte pycdlib não encontrado — use "Instalar suporte ISO" para extrair e reconstruir.'
  })
  void seguro('imagens:usb-admin').then((r) => {
    if (!r?.ok) {
      avisoAdmin.textContent = 'Não foi possível verificar a elevação: ' + (r?.erro || 'erro')
      return
    }
    avisoAdmin.textContent = r.admin
      ? 'Administrador: sim — gravação USB liberada.'
      : 'Administrador: não — o Windows recusará a gravação crua. Feche o DG Editor e abra como administrador.'
    avisoAdmin.style.color = r.admin ? '' : '#e8b45a'
  })
  void atualizarPresets()

  // ------------------------------------------------------------ captura e envio
  corpo.appendChild(
    caixa(
      'Gravação de tela e envio local',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Grave a tela ou uma janela (com áudio do sistema e microfone) em WebM e converta para MP4. Também abre uma página local para o celular enviar arquivos para este PC pela mesma rede Wi-Fi — sem nuvem e sem conta.' }),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        botao('Abrir gravador de tela', () => void abrirGravador({ raiz }), true),
        botao('Receber do celular (LAN)', () => void abrirCompartilhamento({ raiz }))
      )
    )
  )

  corpo.appendChild(
    caixa(
      'Engenharia reversa local (REA)',
      el('p', { className: 'muted', style: 'font-size:11px;margin:0 0 6px', text: 'Analisa binários PE/ELF/Mach-O, apps Electron (app.asar), JAR/APK e páginas web: arquitetura, imports, strings, canais IPC e riscos, com evidências e limitações. 100% offline, sem Hopper/IDA. Use apenas em software que você possui ou tem autorização para inspecionar.' }),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        botao('Abrir análise de reversa', () => void abrirReversa({ raiz }))
      )
    )
  )

  // ------------------------------------------------------------ galeria
  const galeria = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px' })
  const secaoGaleria = caixa(
    'Arquivos gerados',
    el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px' },
      botao('Atualizar', () => void atualizarGaleria()),
      botao('Abrir pasta', () => void seguro('midia:abrir-pasta', raiz))
    ),
    galeria
  )
  corpo.appendChild(secaoGaleria)

  async function atualizarGaleria() {
    const r = await seguro('midia:listar', raiz)
    galeria.textContent = ''
    const itens = (r && r.itens) || []
    if (!itens.length) {
      galeria.appendChild(el('p', { className: 'tool-vazio', style: 'grid-column:1/-1', text: 'Nada gerado ainda. Use uma das ferramentas acima.' }))
      return
    }
    for (const it of itens.slice(0, 12)) {
      const card = el('div', { style: 'border:1px solid var(--dg-border-subtle);border-radius:6px;padding:4px;overflow:hidden' })
      if (it.previewBase64) {
        card.appendChild(el('img', { src: it.previewBase64, alt: it.nome, style: 'width:100%;height:72px;object-fit:cover;border-radius:4px;display:block' }))
      }
      card.appendChild(el('div', { style: 'font-size:10px;margin-top:3px;word-break:break-all', text: it.nome }))
      galeria.appendChild(card)
    }
  }

  await atualizarGaleria()
}
