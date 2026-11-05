(function(){
  const api = window.api || {};
  function criarSecao(){
    if(document.getElementById('contas-dg-section')) return;
    const container = document.createElement('div');
    container.id = 'contas-dg-section';
    container.innerHTML = 
      <div class="secao">
        <h3>Contas Conectadas</h3>
        <div class="contas-grid">
          <div class="conta-card" data-svc="google">
            <div class="conta-info"><b>Google</b><div class="conta-status" id="st-google">Verificando...</div></div>
            <div class="conta-acoes"><button class="btn-conn" id="btn-google">Conectar</button><button class="btn-disc" id="btn-google-disc" style="display:none">Desconectar</button></div>
          </div>
          <div class="conta-card" data-svc="microsoft">
            <div class="conta-info"><b>Microsoft / OneDrive</b><div class="conta-status" id="st-microsoft">Verificando...</div></div>
            <div class="conta-acoes"><button class="btn-conn" id="btn-microsoft">Conectar</button><button class="btn-disc" id="btn-microsoft-disc" style="display:none">Desconectar</button></div>
          </div>
          <div class="conta-card" data-svc="adapta">
            <div class="conta-info"><b>Adapta (One/Maestro)</b><div class="conta-status" id="st-adapta">Verificando...</div></div>
            <div class="conta-acoes"><button class="btn-conn" id="btn-adapta">Conectar</button><button class="btn-disc" id="btn-adapta-disc" style="display:none">Desconectar</button></div>
          </div>
          <div class="conta-card" data-svc="github">
            <div class="conta-info"><b>GitHub</b><div class="conta-status" id="st-github">Verificando...</div></div>
            <div class="conta-acoes"><button class="btn-conn" id="btn-github">Conectar</button><button class="btn-disc" id="btn-github-disc" style="display:none">Desconectar</button></div>
          </div>
        </div>
      </div>
    ;
    const host = document.querySelector('#configuracoes, .painel-config, [data-painel="config"]') || document.body;
    host.appendChild(container);
    bind();
    atualizar();
  }
  function bind(){
    document.getElementById('btn-google').onclick = async ()=>{ const b=document.getElementById('btn-google'); b.disabled=true; b.textContent='Conectando...'; try{ const r=await api.invoke('auth:google:conectar'); if(!r.ok) alert(r.erro||'Erro'); atualizar(); }catch(e){alert(e)} b.disabled=false; b.textContent='Conectar'; };
    document.getElementById('btn-google-disc').onclick = async ()=>{ await api.invoke('auth:google:desconectar'); atualizar(); };
    document.getElementById('btn-microsoft').onclick = async ()=>{ const b=document.getElementById('btn-microsoft'); b.disabled=true; b.textContent='Conectando...'; try{ const r=await api.invoke('auth:microsoft:conectar'); if(!r.ok) alert(r.erro||'Erro'); atualizar(); }catch(e){alert(e)} b.disabled=false; b.textContent='Conectar'; };
    document.getElementById('btn-microsoft-disc').onclick = async ()=>{ await api.invoke('auth:microsoft:desconectar'); atualizar(); };
    document.getElementById('btn-adapta').onclick = async ()=>{ const b=document.getElementById('btn-adapta'); b.disabled=true; b.textContent='Conectando...'; try{ const r=await api.invoke('auth:adapta:conectar'); if(!r.ok) alert(r.erro||'Erro'); atualizar(); }catch(e){alert(e)} b.disabled=false; b.textContent='Conectar'; };
    document.getElementById('btn-adapta-disc').onclick = async ()=>{ await api.invoke('auth:adapta:desconectar'); atualizar(); };
    document.getElementById('btn-github').onclick = async ()=>{ const b=document.getElementById('btn-github'); b.disabled=true; b.textContent='Conectando...'; try{ const r=await api.invoke('auth:github:conectar'); if(!r.ok) alert(r.erro||'Erro'); atualizar(); }catch(e){alert(e)} b.disabled=false; b.textContent='Conectar'; };
    document.getElementById('btn-github-disc').onclick = async ()=>{ await api.invoke('auth:github:desconectar'); atualizar(); };
  }
  async function atualizar(){
    try{
      const g = await api.invoke('auth:google:status').catch(()=>({conectado:false}));
      set('google', g.conectado, g.email||g.nome);
      const m = await api.invoke('auth:microsoft:status').catch(()=>({conectado:false}));
      set('microsoft', m.conectado, m.email||m.nome);
      const a = await api.invoke('auth:adapta:status').catch(()=>({conectado:false}));
      set('adapta', a.conectado, a.email||a.nome);
      const gh = await api.invoke('auth:github:status').catch(()=>({conectado:false}));
      set('github', gh.conectado, gh.email||gh.usuario);
    }catch(e){}
  }
  function set(svc, con, who){
    const st = document.getElementById('st-'+svc); const c=document.getElementById('btn-'+svc); const d=document.getElementById('btn-'+svc+'-disc');
    if(con){ st.innerHTML='Conectado' + (who?'  '+who:''); c.style.display='none'; d.style.display='inline-block'; } else { st.innerHTML='No conectado'; c.style.display='inline-block'; d.style.display='none'; }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', criarSecao); else criarSecao();
})();
