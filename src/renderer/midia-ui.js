/** Estúdio de mídia: geração/edição de imagem, diagramas, vídeo e áudio — tudo grátis. */

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
