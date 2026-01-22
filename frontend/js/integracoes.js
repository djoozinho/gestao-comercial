const API_BASE = '/api';
async function loadIntegracoes(){ 
  try{ 
    const q=document.getElementById('searchInt').value; 
    const res=await axios.get(`${API_BASE}/integracoes?search=${encodeURIComponent(q)}`); 
    const items=res.data.data||res.data||[]; 
    const c=document.getElementById('integracoesList'); 
    
    // Atualizar contadores
    document.getElementById('totalIntegracoes').textContent = items.length;
    document.getElementById('activeIntegracoes').textContent = items.filter(i => i.active).length;
    
    if(!items.length){ 
      c.innerHTML=`<div class="text-center py-5 text-muted"><i class="fa fa-folder-open fa-4x"></i><p>Nenhuma integração cadastrada</p></div>`; 
      return;
    } 
    
    c.innerHTML=items.map(it=>{
      const statusBadge = it.active 
        ? '<span class="badge badge-success ml-2">Ativa</span>' 
        : '<span class="badge badge-secondary ml-2">Inativa</span>';
      
      // Verificar se tem credenciais
      let hasCredentials = false;
      try {
        const cfg = it.config ? (typeof it.config === 'string' ? JSON.parse(it.config) : it.config) : {};
        hasCredentials = !!(cfg.accessToken || cfg.access_token);
      } catch(e) {}
      
      const credBadge = hasCredentials 
        ? '<span class="badge badge-info ml-1"><i class="fa fa-key"></i> Credenciais OK</span>' 
        : '<span class="badge badge-warning ml-1"><i class="fa fa-exclamation-triangle"></i> Sem credenciais</span>';
      
      return `<div class="card list-card mb-2">
        <div class="card-body d-flex justify-content-between align-items-center">
          <div>
            <div class="font-weight-bold">${it.name} ${statusBadge}</div>
            <div class="text-muted">Tipo: ${it.type} ${credBadge}</div>
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" onclick="editIntegracao('${it.id}')"><i class="fa fa-edit"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteIntegracao('${it.id}')"><i class="fa fa-trash"></i></button>
          </div>
        </div>
      </div>`;
    }).join(''); 
  }catch(e){
    console.error(e); 
    document.getElementById('integracoesList').innerHTML='<div class="alert alert-warning">Erro ao carregar.</div>';
  } 
}
function openIntegracaoModal(item=null){ 
    // Reset form and MP fields
    document.getElementById('integracaoForm').reset();
    document.getElementById('intId').value='';
    document.getElementById('mpPublicKey').value='';
    document.getElementById('mpAccessToken').value='';
    document.getElementById('mpClientId').value='';
    document.getElementById('mpClientSecret').value='';
    document.getElementById('intActive').value='1'; // Ativo por padrão
    document.getElementById('integracaoModalTitle').textContent='Nova Integração';
    if(item){ 
        document.getElementById('intId').value=item.id; 
        document.getElementById('intName').value=item.name||''; 
        document.getElementById('intType').value=item.type||''; 
        document.getElementById('intActive').value = item.active ? '1' : '0';
        // item.config is expected to be JSON string with mp keys
        try{
            const cfg = item.config ? (typeof item.config === 'string' ? JSON.parse(item.config) : item.config) : {};
            document.getElementById('mpPublicKey').value = cfg.publicKey || cfg.public_key || '';
            document.getElementById('mpAccessToken').value = cfg.accessToken || cfg.access_token || '';
            document.getElementById('mpClientId').value = cfg.clientId || cfg.client_id || '';
            document.getElementById('mpClientSecret').value = cfg.clientSecret || cfg.client_secret || '';
        }catch(e){
            // Fallback: config not JSON — leave fields empty
            console.warn('Integracao config parse failed:', e);
        }
        document.getElementById('integracaoModalTitle').textContent='Editar Integração'; 
    } 
    $('#integracaoModal').modal('show'); }
async function editIntegracao(id){ try{ const res=await axios.get(`${API_BASE}/integracoes/${id}`); openIntegracaoModal(res.data); }catch(e){alert('Erro ao obter');} }
async function saveIntegracao(){ 
    const id=document.getElementById('intId').value; 
    const cfg = {
        publicKey: (document.getElementById('mpPublicKey')||{}).value || '',
        accessToken: (document.getElementById('mpAccessToken')||{}).value || '',
        clientId: (document.getElementById('mpClientId')||{}).value || '',
        clientSecret: (document.getElementById('mpClientSecret')||{}).value || ''
    };
    const activeVal = document.getElementById('intActive').value;
    const data={ 
        name:document.getElementById('intName').value, 
        type:document.getElementById('intType').value, 
        config: JSON.stringify(cfg),
        active: activeVal === '1' || activeVal === 1 || activeVal === true
    };
    console.log('[Integracoes] Salvando:', data);
    try{ 
        if(id) await axios.put(`${API_BASE}/integracoes/${id}`, data); else await axios.post(`${API_BASE}/integracoes`, data); 
        $('#integracaoModal').modal('hide'); 
        loadIntegracoes(); 
        alert('Integração salva com sucesso!');
    }catch(e){alert('Erro ao salvar: ' + (e.response?.data?.error || e.message));} }
async function deleteIntegracao(id){ if(!confirm('Excluir?')) return; try{ await axios.delete(`${API_BASE}/integracoes/${id}`); loadIntegracoes(); }catch(e){alert('Erro ao excluir');} }

document.addEventListener('DOMContentLoaded', ()=>{ document.getElementById('searchInt').addEventListener('input', debounce(loadIntegracoes,300)); loadIntegracoes(); }); function debounce(fn,t){ let timer; return (...a)=>{ clearTimeout(timer); timer=setTimeout(()=>fn(...a), t); }; }