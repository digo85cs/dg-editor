// Tela de boas-vindas com atalhos
(function(){
  const KEY='dg_bemvindo_oculto';
  if(localStorage.getItem(KEY)==='1') return;
  function init(){
    const overlay = document.createElement('div');
    overlay.id='boas-vindas-overlay';
    overlay.innerHTML = 
      <div class="bv-modal">
        <div class="bv-header"><h2>Bem-vindo ao DG Editor</h2><button id="bv-fechar"></button></div>
        <div class="bv-body">
          <div class="bv-grid">
            <button class="bv-card" data-acao="video"><b>Criar Vdeos</b><br><small>ComfyUI/Wan local</small></button>
            <button class="bv-card" data-acao="imagem"><b>Gerar Imagens</b><br><small>Flux/SDXL via ComfyUI</small></button>
            <button class="bv-card" data-acao="planilha"><b>Perguntar  Planilha</b><br><small>CSV/JSON/Excel local</small></button>
            <button class="bv-card" data-acao="pdf"><b>Analisar PDF/Docs</b><br><small>MarkItDown/Docling</small></button>
            <button class="bv-card" data-acao="sistema"><b>Configurar Sistema</b><br><small>MCP, Skills, Permisses</small></button>
            <button class="bv-card" data-acao="continuar"><b>Continuar Trabalho</b><br><small>ltimo projeto/chat</small></button>
          </div>
          <label class="bv-nao-mostrar"><input type="checkbox" id="bv-check"> No mostrar novamente</label>
        </div>
      </div>
    ;
    document.body.appendChild(overlay);
    overlay.querySelector('#bv-fechar').addEventListener('click', fechar);
    overlay.querySelector('#bv-check').addEventListener('change', (e)=>{ if(e.target.checked) localStorage.setItem(KEY,'1'); });
    overlay.querySelectorAll('.bv-card').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const a = btn.getAttribute('data-acao');
        try{
          if(a==='sistema'){ document.querySelector('#btn-configuracoes, .btn-config')?.click(); }
          if(a==='planilha'){ document.getElementById('planilha-section')?.scrollIntoView({behavior:'smooth'}); }
        }catch(e){}
        fechar();
      });
    });
    function fechar(){ overlay.remove(); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
