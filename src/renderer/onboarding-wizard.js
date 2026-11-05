(function(){
  const api = window.api || {};
  let step = 0;
  function init(){
    api.invoke('onboarding:status').then(st=>{
      if(st.completed && !st.resetadoEm) return;
      criar();
    }).catch(criar);
  }
  function criar(){
    if(document.getElementById('onb-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'onb-overlay';
    overlay.innerHTML = 
      <div class="onb-modal">
        <div class="onb-header"><div class="onb-logo">DG</div><div><b>DG Editor</b><div style="font-size:12px;opacity:.7">Assistente de primeiro acesso</div></div></div>
        <div class="onb-body" id="onb-body"></div>
        <div class="onb-footer"><button id="onb-prev" style="display:none">Voltar</button><div style="flex:1"></div><button id="onb-next">Começar</button></div>
      </div>
    ;
    document.body.appendChild(overlay);
    render();
    document.getElementById('onb-next').onclick = ()=>next();
    document.getElementById('onb-prev').onclick = ()=>prev();
  }
  function render(){
    const body = document.getElementById('onb-body');
    const next = document.getElementById('onb-next');
    const prev = document.getElementById('onb-prev');
    if(step===0){
      body.innerHTML = '<h2>Bem-vindo ao DG Editor</h2><p>Configure seu ambiente em poucos passos. Você poderá conectar suas contas direto pelo navegador embutido e tudo ficará salvo para o próximo acesso.</p>';
      next.textContent='Começar'; prev.style.display='none';
    }else if(step===1){
      body.innerHTML = '<h2>Conecte suas contas</h2><p>Conecte as contas que você usa. Todas abrem no navegador embutido do DG e ficam salvas automaticamente.</p><div class="onb-contas"><div class="onb-card"><b>Google</b><button class="onb-c" data-s="google">Conectar</button></div><div class="onb-card"><b>Microsoft / OneDrive</b><button class="onb-c" data-s="microsoft">Conectar</button></div><div class="onb-card"><b>GitHub</b><button class="onb-c" data-s="github">Conectar</button></div><div class="onb-card"><b>Adapta (One/Maestro)</b><button class="onb-c" data-s="adapta">Conectar</button></div></div>';
      body.querySelectorAll('.onb-c').forEach(b=>{ b.onclick=async()=>{ b.disabled=true; b.textContent='Conectando...'; try{ await api.invoke('auth:'+b.getAttribute('data-s')+':conectar'); b.textContent='Conectado'; }catch(e){b.textContent='Tentar'; b.disabled=false;} }; });
      next.textContent='Continuar'; prev.style.display='inline-block';
    }else if(step===2){
      body.innerHTML = '<h2>Tudo pronto</h2><p>Seu ambiente está limpo e configurado. Você já pode começar a usar o DG Editor com suas contas conectadas.</p>';
      next.textContent='Abrir DG Editor'; prev.style.display='inline-block';
    }
  }
  async function next(){
    if(step===2){ await api.invoke('onboarding:concluir'); document.getElementById('onb-overlay').remove(); return; }
    step++; render();
  }
  function prev(){ if(step>0){ step--; render(); } }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
