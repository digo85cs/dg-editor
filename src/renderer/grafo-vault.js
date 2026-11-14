/**
 * Visualização de grafo do vault (estilo Obsidian).
 * Canvas puro, layout force-directed determinístico, zoom/pan e clique para abrir nota.
 */

function embaralharSemente(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function corDaNota(no) {
  const tag = no.tags && no.tags[0]
  if (!tag) return '#8b93a7'
  let h = 0
  for (const ch of String(tag)) h = (h * 31 + ch.charCodeAt(0)) % 360
  return 'hsl(' + h + ' 68% 62%)'
}

function raioDaNota(no) {
  return 3 + Math.min(7, Math.sqrt(Math.max(0, no.grau || 0)) * 2.2)
}

function layoutForca(nos, arestas, largura, altura, seed) {
  const rand = embaralharSemente(seed || 1)
  const n = nos.length
  const porPath = new Map(nos.map((x) => [x.path, x]))
  const area = Math.max(1, largura * altura)
  const k = Math.sqrt(area / Math.max(1, n)) * 0.7
  const cx = largura / 2
  const cy = altura / 2
  const raioInicial = Math.min(largura, altura) * 0.36
  nos.forEach((no, i) => {
    const ang = (i / Math.max(1, n)) * Math.PI * 2 + rand() * 0.25
    const r = raioInicial * (0.75 + rand() * 0.25)
    no.x = cx + Math.cos(ang) * r
    no.y = cy + Math.sin(ang) * r
  })
  const pares = arestas
    .map((e) => [porPath.get(e.origem), porPath.get(e.destino)])
    .filter(([a, b]) => !!a && !!b)
  let temp = Math.min(largura, altura) * 0.1
  const iteracoes = n > 220 ? 140 : 240
  for (let it = 0; it < iteracoes; it++) {
    for (const no of nos) {
      no._dx = 0
      no._dy = 0
    }
    for (let i = 0; i < n; i++) {
      const a = nos[i]
      for (let j = i + 1; j < n; j++) {
        const b = nos[j]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let d = Math.hypot(dx, dy)
        if (d < 0.01) {
          dx = rand() - 0.5
          dy = rand() - 0.5
          d = Math.hypot(dx, dy) || 0.01
        }
        const f = (k * k) / d
        const ux = dx / d
        const uy = dy / d
        a._dx += ux * f
        a._dy += uy * f
        b._dx -= ux * f
        b._dy -= uy * f
      }
    }
    for (const [a, b] of pares) {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 0.01
      const f = (d * d) / k
      const ux = dx / d
      const uy = dy / d
      a._dx += ux * f
      a._dy += uy * f
      b._dx -= ux * f
      b._dy -= uy * f
    }
    for (const no of nos) {
      no._dx += (cx - no.x) * 0.012
      no._dy += (cy - no.y) * 0.012
      const d = Math.hypot(no._dx, no._dy) || 0.01
      const passo = Math.min(d, temp)
      no.x = Math.max(24, Math.min(largura - 24, no.x + (no._dx / d) * passo))
      no.y = Math.max(24, Math.min(altura - 24, no.y + (no._dy / d) * passo))
    }
    temp *= 0.985
  }
}

/**
 * @param {{ abrirNota?: (path: string) => void }} [opcoes]
 */
export async function abrirGrafoVault(opcoes = {}) {
  let r
  try {
    r = await window.api.invoke('vault:grafo', 400)
  } catch (e) {
    console.warn('[grafo] falha ao consultar', e)
    return
  }
  if (!r?.ok) {
    alert('Não foi possível montar o grafo: ' + (r?.erro || 'vault fechado'))
    return
  }
  const nos = r.nos || []
  if (!nos.length) {
    alert('O vault ainda não tem notas para exibir.')
    return
  }

  const modal = document.createElement('div')
  modal.className = 'modal grafo-modal'
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  modal.setAttribute('aria-label', 'Grafo do vault')

  const box = document.createElement('div')
  box.className = 'modal-box grafo-modal-box'

  const head = document.createElement('div')
  head.className = 'grafo-modal-head'
  const titulo = document.createElement('h3')
  titulo.textContent = 'Grafo do vault'
  const info = document.createElement('span')
  info.className = 'grafo-info muted'
  info.textContent =
    nos.length +
    ' notas · ' +
    (r.arestas?.length || 0) +
    ' conexões' +
    (r.truncado ? ' · top de ' + r.totalNotas : '')
  const busca = document.createElement('input')
  busca.type = 'search'
  busca.className = 'campo-busca'
  busca.placeholder = 'Filtrar título ou tag'
  busca.setAttribute('aria-label', 'Filtrar notas do grafo')
  const btnReorganizar = document.createElement('button')
  btnReorganizar.type = 'button'
  btnReorganizar.className = 'btn-small'
  btnReorganizar.textContent = 'Reorganizar'
  const btnFechar = document.createElement('button')
  btnFechar.type = 'button'
  btnFechar.className = 'btn-small btn-ghost'
  btnFechar.textContent = 'Fechar'
  head.append(titulo, info, busca, btnReorganizar, btnFechar)

  const wrap = document.createElement('div')
  wrap.className = 'grafo-canvas-wrap'
  wrap.dataset.mask = 'grafo'
  const canvas = document.createElement('canvas')
  canvas.className = 'grafo-canvas'
  canvas.setAttribute('aria-label', 'Grafo interativo de notas; clique em um nó para abrir a nota')
  canvas.tabIndex = 0
  wrap.appendChild(canvas)

  const dica = document.createElement('div')
  dica.className = 'grafo-legenda'
  dica.textContent =
    'Clique para abrir · arraste para mover · roda para zoom · ' +
    'cor = primeira tag · tamanho = conexões'
  box.append(head, wrap, dica)
  modal.appendChild(box)
  document.body.appendChild(modal)

  const ctx = canvas.getContext('2d')
  let escala = 1
  let panX = 0
  let panY = 0
  let larguraCss = 0
  let alturaCss = 0
  let hover = null
  let filtro = ''
  let seed = Date.now() % 100000
  let arrastando = null
  let moveu = 0

  function redimensionar() {
    const dpr = window.devicePixelRatio || 1
    larguraCss = Math.max(200, wrap.clientWidth)
    alturaCss = Math.max(160, wrap.clientHeight)
    canvas.width = Math.round(larguraCss * dpr)
    canvas.height = Math.round(alturaCss * dpr)
    canvas.style.width = larguraCss + 'px'
    canvas.style.height = alturaCss + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function paraTela(x, y) {
    return [
      (x - larguraCss / 2) * escala + larguraCss / 2 + panX,
      (y - alturaCss / 2) * escala + alturaCss / 2 + panY
    ]
  }

  function paraMundo(sx, sy) {
    return [
      ((sx - larguraCss / 2 - panX) / escala) + larguraCss / 2,
      ((sy - alturaCss / 2 - panY) / escala) + alturaCss / 2
    ]
  }

  function corresponde(no) {
    if (!filtro) return true
    const alvo = filtro.toLowerCase()
    return (
      String(no.titulo || '').toLowerCase().includes(alvo) ||
      String(no.rel || '').toLowerCase().includes(alvo) ||
      (no.tags || []).some((t) => String(t).toLowerCase().includes(alvo))
    )
  }

  const porPath = new Map(nos.map((n) => [n.path, n]))

  function desenhar() {
    ctx.clearRect(0, 0, larguraCss, alturaCss)
    const pintar = (no) => (filtro ? corresponde(no) : true)
    for (const e of r.arestas || []) {
      const a = porPath.get(e.origem)
      const b = porPath.get(e.destino)
      if (!a || !b) continue
      const ativo = pintar(a) && pintar(b)
      const [ax, ay] = paraTela(a.x, a.y)
      const [bx, by] = paraTela(b.x, b.y)
      ctx.strokeStyle = ativo ? 'rgba(140,150,175,0.38)' : 'rgba(140,150,175,0.08)'
      ctx.lineWidth = ativo ? Math.max(1, escala * 1.1) : 1
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
    }
    const ordenados = [...nos].sort((a, b) => (a.grau || 0) - (b.grau || 0))
    for (const no of ordenados) {
      const [sx, sy] = paraTela(no.x, no.y)
      if (sx < -30 || sy < -30 || sx > larguraCss + 30 || sy > alturaCss + 30) continue
      const ativo = pintar(no)
      const destacado = hover === no
      const raio = Math.max(2.5, raioDaNota(no) * escala)
      ctx.globalAlpha = ativo ? 1 : 0.18
      ctx.beginPath()
      ctx.arc(sx, sy, raio, 0, Math.PI * 2)
      ctx.fillStyle = corDaNota(no)
      ctx.fill()
      if (destacado) {
        ctx.lineWidth = 2
        ctx.strokeStyle = '#ffffff'
        ctx.stroke()
      }
      const mostrarRotulo =
        ativo &&
        (destacado ||
          no.grau >= 3 ||
          (filtro && corresponde(no)) ||
          nos.length <= 12)
      if (mostrarRotulo) {
        ctx.font = (destacado ? '600 ' : '') + '11px system-ui, sans-serif'
        ctx.fillStyle = destacado ? '#ffffff' : 'rgba(225,230,242,0.82)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(no.titulo || no.rel, sx, sy + raio + 4, 140)
      }
      ctx.globalAlpha = 1
    }
  }

  function noEm(sx, sy) {
    let achado = null
    let melhor = 14
    for (const no of nos) {
      const [x, y] = paraTela(no.x, no.y)
      const d = Math.hypot(x - sx, y - sy)
      if (d < melhor && (filtro ? corresponde(no) : true)) {
        melhor = d
        achado = no
      }
    }
    return achado
  }

  function posicaoLocal(ev) {
    const rect = canvas.getBoundingClientRect()
    return [ev.clientX - rect.left, ev.clientY - rect.top]
  }

  canvas.addEventListener('mousedown', (ev) => {
    arrastando = posicaoLocal(ev)
    moveu = 0
  })
  canvas.addEventListener('mousemove', (ev) => {
    const [sx, sy] = posicaoLocal(ev)
    if (arrastando) {
      const dx = sx - arrastando[0]
      const dy = sy - arrastando[1]
      moveu += Math.abs(dx) + Math.abs(dy)
      panX += dx
      panY += dy
      arrastando = [sx, sy]
      canvas.style.cursor = 'grabbing'
      desenhar()
      return
    }
    const no = noEm(sx, sy)
    canvas.style.cursor = no ? 'pointer' : 'grab'
    if (no !== hover) {
      hover = no
      desenhar()
    }
  })
  const soltar = (ev) => {
    if (arrastando && moveu < 5) {
      const [sx, sy] = posicaoLocal(ev)
      const no = noEm(sx, sy)
      if (no && typeof opcoes.abrirNota === 'function') {
        opcoes.abrirNota(no.path)
        modal.remove()
        return
      }
    }
    arrastando = null
    canvas.style.cursor = 'grab'
  }
  canvas.addEventListener('mouseup', soltar)
  canvas.addEventListener('mouseleave', () => {
    arrastando = null
    hover = null
    desenhar()
  })
  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault()
      const [sx, sy] = posicaoLocal(ev)
      const antes = paraMundo(sx, sy)
      escala = Math.max(0.25, Math.min(3.5, escala * (ev.deltaY < 0 ? 1.12 : 0.89)))
      const depois = paraMundo(sx, sy)
      panX += (depois[0] - antes[0]) * escala
      panY += (depois[1] - antes[1]) * escala
      desenhar()
    },
    { passive: false }
  )
  canvas.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') modal.remove()
  })
  busca.addEventListener('input', () => {
    filtro = busca.value.trim()
    desenhar()
  })
  btnReorganizar.addEventListener('click', () => {
    seed = (seed * 48271 + 11) % 2147483647
    layoutForca(nos, r.arestas || [], larguraCss, alturaCss, seed)
    escala = 1
    panX = 0
    panY = 0
    desenhar()
  })
  const fechar = () => {
    observer.disconnect()
    modal.remove()
  }
  btnFechar.addEventListener('click', fechar)
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) fechar()
  })
  modal.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') fechar()
  })

  const observer = new ResizeObserver(() => {
    redimensionar()
    desenhar()
  })
  observer.observe(wrap)

  redimensionar()
  layoutForca(nos, r.arestas || [], larguraCss, alturaCss, seed)
  desenhar()
  busca.focus()
}
