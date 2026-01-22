const API_BASE = '/api';

async function loadNfe() {
  try {
    const q = document.getElementById('searchNfe').value;
    const res = await axios.get(`${API_BASE}/nfe?search=${encodeURIComponent(q)}`);
    const items = res.data.data || res.data || [];
    const container = document.getElementById('nfeList');
    if (!items.length) {
      container.innerHTML = `<div class="text-center py-5 text-muted"><i class="fa fa-folder-open fa-4x"></i><p>Nenhuma configuração cadastrada</p></div>`;
      return;
    }
    container.innerHTML = items.map(i => `
      <div class="card list-card"><div class="card-body d-flex justify-content-between align-items-center">
        <div><div class="font-weight-bold">Ambiente: ${i.ambiente}</div><div class="text-muted">Série: ${i.serie || '-'}</div></div>
        <div class="btn-group"><button class="btn btn-sm btn-outline-primary" onclick="editNfe('${i.id}')"><i class="fa fa-edit"></i></button><button class="btn btn-sm btn-outline-danger" onclick="deleteNfe('${i.id}')"><i class="fa fa-trash"></i></button></div>
      </div></div>
    `).join('');
  } catch (err) {
    console.error(err);
    document.getElementById('nfeList').innerHTML = '<div class="alert alert-warning">Erro ao carregar configurações.</div>';
  }
}

function openNfeModal(item=null){
  document.getElementById('nfeForm').reset(); document.getElementById('nfeId').value=''; document.getElementById('nfeModalTitle').textContent='Nova Configuração NF-e';
  if(item){ document.getElementById('nfeId').value=item.id; document.getElementById('nfeAmbiente').value=item.ambiente; document.getElementById('nfeSerie').value=item.serie||''; document.getElementById('nfeObs').value=item.obs||''; document.getElementById('nfeModalTitle').textContent='Editar Configuração NF-e'; }
  $('#nfeModal').modal('show');
}
async function editNfe(id){ try{ const res=await axios.get(`${API_BASE}/nfe/${id}`); openNfeModal(res.data); }catch(e){alert('Erro ao obter item');} }
async function saveNfe(){ const id=document.getElementById('nfeId').value; const data={ ambiente:document.getElementById('nfeAmbiente').value, serie:document.getElementById('nfeSerie').value, obs:document.getElementById('nfeObs').value };
  try{ if(id) await axios.put(`${API_BASE}/nfe/${id}`, data); else await axios.post(`${API_BASE}/nfe`, data); $('#nfeModal').modal('hide'); loadNfe(); }catch(e){alert('Erro ao salvar');}}
async function deleteNfe(id){ if(!confirm('Excluir?')) return; try{ await axios.delete(`${API_BASE}/nfe/${id}`); loadNfe(); }catch(e){alert('Erro ao excluir');} }

document.addEventListener('DOMContentLoaded', ()=>{ document.getElementById('searchNfe').addEventListener('input', debounce(loadNfe,300)); loadNfe(); });

function debounce(fn, t){ let timer; return (...a)=>{ clearTimeout(timer); timer=setTimeout(()=>fn(...a), t); }; }
