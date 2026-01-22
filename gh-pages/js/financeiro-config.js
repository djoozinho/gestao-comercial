const API_BASE = '/api';
async function loadFinanceiro(){
  try{
    const q = document.getElementById('searchFin').value;
    const resource = (document.getElementById('finFilterType') || {}).value || '';
    let url = `${API_BASE}/financeiro?search=${encodeURIComponent(q)}`;
    if(resource) url += `&resource=${encodeURIComponent(resource)}`;
    const res = await axios.get(url);
    const items = res.data.data||res.data||[];

    // atualizar estatísticas locais pelo resource
    const totalPlanos = items.filter(i=>i.resource==='plano').length;
    const totalCategorias = items.filter(i=>i.resource==='categoria').length;
    const totalBankAccounts = items.filter(i=>i.resource==='bancaria').length;
    const totalCostCenters = items.filter(i=>i.resource==='centro').length;
    const setIf = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent = val; };
    setIf('totalPlanos', totalPlanos);
    setIf('totalCategorias', totalCategorias);
    setIf('totalBankAccounts', totalBankAccounts);
    setIf('totalCostCenters', totalCostCenters);

    const c=document.getElementById('financeiroList');
    if(!items.length){
      c.innerHTML = `<div class="text-center py-5 text-muted"><i class="fa fa-folder-open fa-4x"></i><p>Nenhuma conta cadastrada</p></div>`;
      return;
    }

    c.innerHTML = items.map(it=>`<div class="card list-card"><div class="card-body d-flex justify-content-between align-items-center"><div><div class="font-weight-bold">${it.name}</div><div class="text-muted">Tipo: ${it.type}${it.resource? ' • Recurso: '+it.resource : ''}</div></div><div class="btn-group"><button class="btn btn-sm btn-outline-primary" onclick="editFinanceiro('${it.id}')"><i class="fa fa-edit"></i></button><button class="btn btn-sm btn-outline-danger" onclick="deleteFinanceiro('${it.id}')"><i class="fa fa-trash"></i></button></div></div></div>`).join('');
  }catch(e){
    console.error(e);
    document.getElementById('financeiroList').innerHTML='<div class="alert alert-warning">Erro ao carregar.</div>';
  }
}

function openFinanceiroModal(item=null){
  document.getElementById('financeiroForm').reset();
  document.getElementById('finId').value='';
  document.getElementById('financeiroModalTitle').textContent='Nova Conta/Categoria';
  if(document.getElementById('finResource')) document.getElementById('finResource').value='plano';
  if(item){
    document.getElementById('finId').value=item.id;
    document.getElementById('finName').value=item.name||'';
    document.getElementById('finType').value=item.type||'Receita';
    document.getElementById('finDesc').value=item.desc||'';
    if(document.getElementById('finResource')) document.getElementById('finResource').value=item.resource||'plano';
    document.getElementById('financeiroModalTitle').textContent='Editar Conta/Categoria';
  }
  $('#financeiroModal').modal('show');
}

async function editFinanceiro(id){ try{ const res=await axios.get(`${API_BASE}/financeiro/${id}`); openFinanceiroModal(res.data); }catch(e){alert('Erro ao obter');} }

async function saveFinanceiro(){
  const id=document.getElementById('finId').value;
  const data={
    name:document.getElementById('finName').value,
    type:document.getElementById('finType').value,
    desc:document.getElementById('finDesc').value,
    resource: (document.getElementById('finResource')||{}).value || ''
  };
  try{ if(id) await axios.put(`${API_BASE}/financeiro/${id}`, data); else await axios.post(`${API_BASE}/financeiro`, data); $('#financeiroModal').modal('hide'); loadFinanceiro(); }catch(e){alert('Erro ao salvar');} }
async function deleteFinanceiro(id){ if(!confirm('Excluir?')) return; try{ await axios.delete(`${API_BASE}/financeiro/${id}`); loadFinanceiro(); }catch(e){alert('Erro ao excluir');} }

document.addEventListener('DOMContentLoaded', ()=>{
  const searchEl = document.getElementById('searchFin');
  if(searchEl) searchEl.addEventListener('input', debounce(loadFinanceiro,300));
  const filterEl = document.getElementById('finFilterType');
  if(filterEl) filterEl.addEventListener('change', loadFinanceiro);
  loadFinanceiro();
});

function debounce(fn,t){ let timer; return (...a)=>{ clearTimeout(timer); timer=setTimeout(()=>fn(...a), t); }; }