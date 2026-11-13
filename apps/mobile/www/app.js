'use strict';

const $ = (sel) => document.querySelector(sel);
const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
let foto = null;

function trocarTela(id) {
  document.querySelectorAll('.tela').forEach((t) => t.classList.toggle('ativa', t.id === 'tela-' + id));
  document.querySelectorAll('.abas button').forEach((b) => {
    const ativa = b.dataset.tela === id;
    b.classList.toggle('ativa', ativa);
    if (ativa) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.abas button').forEach((b) => {
  b.addEventListener('click', () => trocarTela(b.dataset.tela));
});

function quebrar(texto, maxLargura) {
  const palavras = String(texto || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const teste = atual ? atual + ' ' + p : p;
    if (ctx.measureText(teste).width <= maxLargura || !atual) atual = teste;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function desenhar() {
  if (!foto) return;
  const largura = canvas.width;
  const altura = canvas.height;
  ctx.clearRect(0, 0, largura, altura);
  const escala = Math.max(largura / foto.width, altura / foto.height);
  const w = foto.width * escala;
  const h = foto.height * escala;
  ctx.drawImage(foto, (largura - w) / 2, (altura - h) / 2, w, h);

  let tamanho = Math.max(34, Math.round(largura / 11));
  let cima = [];
  let baixo = [];
  const limite = largura * 0.92;
  for (let i = 0; i < 14; i++) {
    ctx.font = '900 ' + tamanho + 'px Impact, "Arial Black", sans-serif';
    cima = quebrar($('#topo').value, limite);
    baixo = quebrar($('#baixo').value, limite);
    if (cima.length + baixo.length <= 6) break;
    tamanho = Math.round(tamanho * 0.9);
  }

  const linha = Math.round(tamanho * 1.08);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(4, Math.round(tamanho / 7));
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#fff';
  const margem = Math.round(largura * 0.04);

  let y = margem;
  for (const l of cima) {
    ctx.strokeText(l, largura / 2, y);
    ctx.fillText(l, largura / 2, y);
    y += linha;
  }
  y = altura - margem - baixo.length * linha;
  for (const l of baixo) {
    ctx.strokeText(l, largura / 2, y);
    ctx.fillText(l, largura / 2, y);
    y += linha;
  }
}

$('#foto').addEventListener('change', (ev) => {
  const arquivo = ev.target.files && ev.target.files[0];
  if (!arquivo) return;
  const url = URL.createObjectURL(arquivo);
  const img = new Image();
  img.onload = () => {
    foto = img;
    const lado = Math.max(img.width, img.height);
    const escala = Math.min(1, 1280 / lado);
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.classList.add('visivel');
    $('#vazio').style.display = 'none';
    $('#salvar').disabled = false;
    desenhar();
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    $('#status-meme').textContent = 'Não consegui abrir essa imagem.';
    URL.revokeObjectURL(url);
  };
  img.src = url;
});

$('#topo').addEventListener('input', desenhar);
$('#baixo').addEventListener('input', desenhar);

$('#salvar').addEventListener('click', () => {
  if (!foto) return;
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const nome = 'dg-meme-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
    const arquivo = new File([blob], nome, { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: 'Meme DG' });
        $('#status-meme').textContent = 'Meme compartilhado.';
        return;
      }
    } catch {
      /* segue para download */
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    $('#status-meme').textContent = 'Meme salvo em Downloads: ' + nome;
  }, 'image/png');
});

function gerarPrompt() {
  const tema = $('#tema').value.trim() || 'uma cena criativa';
  const estilo = $('#estilo').value;
  const formato = $('#formato').value;
  const duracao = $('#duracao').value;
  const camera = $('#camera').value;
  const texto = [
    'Crie um vídeo de ' + duracao + ' segundos em formato ' + formato + '.',
    'Tema: ' + tema + '.',
    'Estilo visual: ' + estilo + ', iluminação coerente, cores bem definidas, alta nitidez.',
    'Câmera: ' + camera + ', movimento suave e estável.',
    'Sem texto na tela, sem logotipos, sem marcas d\u2019água e sem imitar pessoa real.',
    'Áudio: ambiente sutil, sem música protegida por direitos autorais.',
    'Consistência: mesma identidade visual do primeiro ao último quadro.'
  ].join('\n');
  $('#saida-prompt').textContent = texto;
  $('#copiar').disabled = false;
}

$('#gerar-prompt').addEventListener('click', gerarPrompt);

$('#copiar').addEventListener('click', async () => {
  const texto = $('#saida-prompt').textContent;
  try {
    await navigator.clipboard.writeText(texto);
    $('#copiar').textContent = 'Copiado';
    setTimeout(() => ($('#copiar').textContent = 'Copiar prompt'), 1500);
  } catch {
    $('#copiar').textContent = 'Selecione e copie manualmente';
  }
});

$('#versao').textContent = 'versão 0.1.0 · offline';
