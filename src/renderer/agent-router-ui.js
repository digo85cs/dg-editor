// Agent Router - sugestao ao enviar
(function(){
  const api = window.api || {};
  function init(){
    const input = document.querySelector('#chat-input, textarea.chat, input.chat');
    if(!input) return;
    const btn = document.querySelector('#chat-enviar, .btn-enviar') || input;
    btn.addEventListener('click', async ()=>{
      try{
        const txt = input.value || '';
        if(!txt.trim()) return;
        const r = await api.invoke('dg:agente:rotasugerir', txt);
        if(r?.ok){
          const s = r.sugestao;
          console.log('[agent-router]', r.intencao, s);
        }
      }catch(e){}
    }, true);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
