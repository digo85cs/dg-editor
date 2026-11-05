(function(){
  const api = window.api || {};
  function init(){
    const bMax = document.getElementById('btn-maximizar') || document.querySelector('.btn-maximizar');
    const bMin = document.getElementById('btn-minimizar') || document.querySelector('.btn-minimizar');
    const bClose = document.getElementById('btn-fechar') || document.querySelector('.btn-fechar');
    if(bMin){ bMin.onclick = ()=>api.invoke('janela:minimizar'); }
    if(bMax){ bMax.onclick = async ()=>{ try{ await api.invoke('janela:maximizar'); atualizar(); }catch(e){} }; }
    if(bClose){ bClose.onclick = ()=>api.invoke('janela:fechar'); }
    async function atualizar(){
      try{
        const st = await api.invoke('janela:estado');
        if(bMax){ bMax.setAttribute('data-max', st.maximizado ? '1':'0'); bMax.textContent = st.maximizado ? '?' : '?'; }
      }catch(e){}
    }
    setInterval(atualizar, 500);
    atualizar();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
