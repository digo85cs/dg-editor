/**
 * Gravador de tela (estilo OBS, versão mínima): captura tela/janela via
 * desktopCapturer, grava WebM em chunks no projeto e converte para MP4.
 */
import { anunciar } from './features/ui/live-region.js'

function botao(rotulo, classe = 'btn-small') {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = classe
  b.textContent = rotulo
  return b
}

function rotuloCampo(texto, controle) {
  const lab = document.createElement('label')
  lab.className = 'gravador-campo'
  const span = document.createElement('span')
  span.textContent = texto
  lab.append(span, controle)
  return lab
}

function selecao(opcoes, valor) {
  const s = document.createElement('select')
  s.className = 'gravador-select'
  for (const [v, t] of opcoes) {
    const op = document.createElement('option')
    op.value = String(v)
    op.textContent = t
    op.selected = String(v) === String(valor)
    s.appendChild(op)
  }
  return s
}

function formatarDuracao(seg) {
  const s = Math.max(0, Math.floor(seg))
  const m = Math.floor(s / 60)
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

function formatarBytes(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB'
}

/**
 * @param {{ raiz?: string }} [opcoes]
 */
export async function abrirGravador(opcoes = {}) {
  if (document.querySelector('.gravador-modal')) return null
  const raiz = opcoes.raiz || ''

  const modal = document.createElement('div')
  modal.className = 'modal gravador-modal'
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  modal.setAttribute('aria-label', 'Gravador de tela')

  const box = document.createElement('div')
  box.className = 'modal-box gravador-modal-box'

  const head = document.createElement('div')
  head.className = 'gravador-head'
  const titulo = document.createElement('h3')
  titulo.textContent = 'Gravador de tela'
  const btnFechar = botao('Fechar', 'btn-small btn-ghost')
  head.append(titulo, btnFechar)

  const fontesSelect = selecao([['', 'Carregando fontes…']], '')
  const fpsSelect = selecao(
    [
      [24, '24 fps'],
      [30, '30 fps (padrão)'],
      [60, '60 fps']
    ],
    30
  )
  const qualidadeSelect = selecao(
    [
      [2_500_000, 'Leve (~2,5 Mbps)'],
      [5_000_000, 'Boa (~5 Mbps, padrão)'],
      [8_000_000, 'Alta (~8 Mbps)']
    ],
    5_000_000
  )
  const chkAudioSistema = document.createElement('input')
  chkAudioSistema.type = 'checkbox'
  chkAudioSistema.checked = true
  const chkMicrofone = document.createElement('input')
  chkMicrofone.type = 'checkbox'
  chkMicrofone.checked = false

  const btnAtualizar = botao('Atualizar fontes')
  const btnGravar = botao('Gravar', 'btn-small btn-primary')
  const cronometro = document.createElement('span')
  cronometro.className = 'gravador-cronometro'
  cronometro.textContent = '00:00'
  cronometro.setAttribute('aria-live', 'off')

  const controles = document.createElement('div')
  controles.className = 'gravador-controles'
  controles.append(
    rotuloCampo('Fonte', fontesSelect),
    rotuloCampo('Quadros', fpsSelect),
    rotuloCampo('Qualidade', qualidadeSelect),
    rotuloCampo('Áudio do sistema', chkAudioSistema),
    rotuloCampo('Microfone', chkMicrofone),
    btnAtualizar
  )

  const barra = document.createElement('div')
  barra.className = 'gravador-barra'
  const status = document.createElement('div')
  status.className = 'gravador-status muted'
  status.setAttribute('role', 'status')
  status.textContent = 'Escolha a fonte e clique em Gravar.'
  barra.append(btnGravar, cronometro, status)

  const preview = document.createElement('video')
  preview.className = 'gravador-preview'
  preview.muted = true
  preview.autoplay = true
  preview.playsInline = true
  preview.setAttribute('aria-label', 'Prévia da captura')

  const resultado = document.createElement('div')
  resultado.className = 'gravador-resultado'

  const listaTitulo = document.createElement('h4')
  listaTitulo.textContent = 'Gravações salvas (.dg-editor/gravacoes)'
  const lista = document.createElement('div')
  lista.className = 'gravador-lista'

  box.append(head, controles, barra, preview, resultado, listaTitulo, lista)
  modal.appendChild(box)
  document.body.appendChild(modal)

  let fluxoCaptura = null
  let fluxoMicrofone = null
  let contextoAudio = null
  let gravador = null
  let sessao = ''
  let inicio = 0
  let timer = null
  let filaEnvio = Promise.resolve()
  let gravando = false

  function avisar(msg, erro = false) {
    status.textContent = msg
    status.style.color = erro ? 'var(--dg-danger, #e5534b)' : ''
    anunciar(msg, { urgencia: erro ? 'assertivo' : 'educado' })
  }

  async function carregarFontes() {
    fontesSelect.innerHTML = ''
    const op = document.createElement('option')
    op.value = ''
    op.textContent = 'Carregando fontes…'
    fontesSelect.appendChild(op)
    try {
      const r = await window.api.invoke('gravacao:fontes')
      fontesSelect.innerHTML = ''
      if (!r?.ok || !r.fontes?.length) {
        const vazio = document.createElement('option')
        vazio.value = ''
        vazio.textContent = 'Nenhuma fonte disponível'
        fontesSelect.appendChild(vazio)
        avisar(r?.erro || 'Nenhuma tela ou janela encontrada para capturar.', true)
        return
      }
      for (const f of r.fontes) {
        const o = document.createElement('option')
        o.value = f.id
        o.textContent = (f.tipo === 'tela' ? 'Tela: ' : 'Janela: ') + f.nome
        fontesSelect.appendChild(o)
      }
      avisar(r.fontes.length + ' fonte(s) disponível(is). Escolha uma e grave.')
    } catch (e) {
      avisar('Falha ao listar fontes: ' + String(e), true)
    }
  }

  async function atualizarLista() {
    lista.textContent = ''
    const r = await window.api.invoke('gravacao:listar', { raiz })
    const itens = r?.gravacoes || []
    if (!itens.length) {
      const p = document.createElement('p')
      p.className = 'muted'
      p.textContent = 'Nenhuma gravação ainda.'
      lista.appendChild(p)
      return
    }
    for (const item of itens) {
      const linha = document.createElement('div')
      linha.className = 'gravador-item'
      const info = document.createElement('span')
      info.textContent =
        item.nome + ' · ' + formatarBytes(item.bytes) + ' · ' + new Date(item.mtimeMs).toLocaleString('pt-BR')
      const btn = botao(/\.mp4$/i.test(item.nome) ? 'Abrir pasta' : 'Converter para MP4')
      btn.addEventListener('click', async () => {
        if (/\.mp4$/i.test(item.nome)) {
          await window.api.invoke('gravacao:abrir-pasta', { raiz })
          return
        }
        btn.disabled = true
        avisar('Convertendo ' + item.nome + ' para MP4…')
        const conv = await window.api.invoke('gravacao:converter', { raiz, entrada: item.caminho })
        btn.disabled = false
        if (!conv?.ok) {
          avisar(conv?.erro || 'Falha ao converter.', true)
          return
        }
        avisar('MP4 gerado: ' + conv.caminhoRel + ' · ' + formatarBytes(conv.bytes))
        anunciar('Gravação convertida para MP4')
        await atualizarLista()
      })
      linha.append(info, btn)
      lista.appendChild(linha)
    }
  }

  function pararTimer() {
    if (timer) clearInterval(timer)
    timer = null
  }

  async function liberarCaptura() {
    pararTimer()
    for (const f of [fluxoCaptura, fluxoMicrofone]) {
      if (f) for (const t of f.getTracks()) t.stop()
    }
    fluxoCaptura = null
    fluxoMicrofone = null
    if (contextoAudio) {
      try {
        await contextoAudio.close()
      } catch {
        /* */
      }
      contextoAudio = null
    }
    preview.srcObject = null
  }

  async function iniciar() {
    if (gravando) return
    const fonte = String(fontesSelect.value || '')
    if (!fonte) {
      avisar('Escolha uma tela ou janela para gravar.', true)
      return
    }
    const fps = Number(fpsSelect.value) || 30
    btnGravar.disabled = true
    avisar('Preparando captura…')
    try {
      const constraints = {
        audio: chkAudioSistema.checked ? { mandatory: { chromeMediaSource: 'desktop' } } : false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: fonte,
            maxFrameRate: fps
          }
        }
      }
      fluxoCaptura = await navigator.mediaDevices.getUserMedia(constraints)
      const videoTrack = fluxoCaptura.getVideoTracks()[0]
      if (!videoTrack) throw new Error('a fonte não forneceu vídeo')

      let fluxoFinal = new MediaStream([videoTrack])
      const audioTracks = fluxoCaptura.getAudioTracks()
      if (chkMicrofone.checked) {
        fluxoMicrofone = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      if (audioTracks.length || fluxoMicrofone) {
        contextoAudio = new AudioContext()
        const destino = contextoAudio.createMediaStreamDestination()
        if (audioTracks.length) {
          contextoAudio.createMediaStreamSource(new MediaStream(audioTracks)).connect(destino)
        }
        if (fluxoMicrofone) {
          contextoAudio.createMediaStreamSource(fluxoMicrofone).connect(destino)
        }
        fluxoFinal = new MediaStream([videoTrack, ...destino.stream.getAudioTracks()])
      }

      preview.srcObject = fluxoFinal

      const candidatos = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ]
      const mimeType = candidatos.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || ''
      const s = await window.api.invoke('gravacao:iniciar', { raiz })
      if (!s?.ok) throw new Error(s?.erro || 'não foi possível iniciar a sessão de gravação')
      sessao = s.id
      filaEnvio = Promise.resolve()
      const opcoesRec = mimeType ? { mimeType } : {}
      opcoesRec.videoBitsPerSecond = Number(qualidadeSelect.value) || 5_000_000
      gravador = new MediaRecorder(fluxoFinal, opcoesRec)
      gravador.addEventListener('dataavailable', (ev) => {
        if (!ev.data || !ev.data.size) return
        const dadosPromise = ev.data.arrayBuffer()
        filaEnvio = filaEnvio.then(async () => {
          const buf = await dadosPromise
          await window.api.invoke('gravacao:chunk', { id: sessao, dados: new Uint8Array(buf) })
        })
      })
      gravador.start(2000)
      gravando = true
      inicio = Date.now()
      pararTimer()
      timer = setInterval(() => {
        cronometro.textContent = formatarDuracao((Date.now() - inicio) / 1000)
      }, 500)
      btnGravar.textContent = 'Parar'
      btnGravar.disabled = false
      avisar('Gravando… clique em Parar para salvar.')
      anunciar('Gravação de tela iniciada')
    } catch (e) {
      btnGravar.disabled = false
      await liberarCaptura()
      avisar('Não foi possível gravar: ' + String(e), true)
    }
  }

  async function parar() {
    if (!gravando) return
    btnGravar.disabled = true
    gravando = false
    avisar('Finalizando gravação…')
    const parada = new Promise((r) => {
      if (!gravador) return r()
      gravador.addEventListener('stop', () => r(), { once: true })
      try {
        gravador.stop()
      } catch {
        r()
      }
    })
    await parada
    await filaEnvio.catch(() => {})
    const fim = await window.api.invoke('gravacao:finalizar', { id: sessao, raiz })
    sessao = ''
    gravador = null
    await liberarCaptura()
    btnGravar.textContent = 'Gravar'
    btnGravar.disabled = false
    cronometro.textContent = '00:00'
    if (!fim?.ok) {
      avisar(fim?.erro || 'A gravação não gerou arquivo.', true)
      return
    }
    resultado.textContent = ''
    const p = document.createElement('p')
    p.textContent =
      'Salvo em ' + fim.caminhoRel + ' · ' + formatarBytes(fim.bytes) + ' (WebM — converta para MP4 se precisar).'
    const btnConverter = botao('Converter para MP4')
    btnConverter.addEventListener('click', async () => {
      btnConverter.disabled = true
      avisar('Convertendo para MP4…')
      const conv = await window.api.invoke('gravacao:converter', { raiz, entrada: fim.caminho })
      btnConverter.disabled = false
      if (!conv?.ok) {
        avisar(conv?.erro || 'Falha ao converter.', true)
        return
      }
      avisar('MP4 gerado: ' + conv.caminhoRel + ' · ' + formatarBytes(conv.bytes))
      anunciar('Gravação convertida para MP4')
      await atualizarLista()
    })
    resultado.append(p, btnConverter)
    avisar('Gravação salva. Você pode converter para MP4.')
    anunciar('Gravação de tela finalizada')
    await atualizarLista()
  }

  btnGravar.addEventListener('click', () => {
    if (gravando) void parar()
    else void iniciar()
  })
  btnAtualizar.addEventListener('click', () => void carregarFontes())

  const fechar = async () => {
    if (gravando) {
      gravando = false
      try {
        gravador?.stop()
      } catch {
        /* */
      }
      await filaEnvio.catch(() => {})
      if (sessao) await window.api.invoke('gravacao:cancelar', { id: sessao })
      sessao = ''
      gravador = null
    }
    await liberarCaptura()
    modal.remove()
  }
  btnFechar.addEventListener('click', () => void fechar())
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) void fechar()
  })
  modal.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') void fechar()
  })

  await Promise.all([carregarFontes(), atualizarLista()])
  btnGravar.focus()
  return modal
}
