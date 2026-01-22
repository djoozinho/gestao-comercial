const API_BASE = '/api';

async function loadEstoque(){
  try{
    const q = document.getElementById('searchEstoque').value || '';
    const res = await axios.get(`${API_BASE}/estoque?search=${encodeURIComponent(q)}`);
    let items = res.data.data || res.data || [];

    // Apply inventory filter if present
    const inventoryFilter = document.getElementById('inventoryFilter')?.value || '';
    if (inventoryFilter) {
      items = items.filter(i => (i.inventory || '').toString() === inventoryFilter);
    }

    // atualizar estatísticas
    document.getElementById('totalRules').textContent = items.length;
    document.getElementById('alertsActive').textContent = items.filter(i => i.alertEnabled).length;
    // turnover: média de turnover definido nas regras
    const turnoverVals = items.map(i => parseFloat(i.turnover || 0)).filter(v => v>0);
    const avgTurn = turnoverVals.length ? Math.round(turnoverVals.reduce((a,b)=>a+b,0)/turnoverVals.length) : 0;
    document.getElementById('turnoverPeriod').textContent = avgTurn;

    const c = document.getElementById('estoqueTree');
    if(!items.length){
      c.innerHTML = `<div class="text-center py-5 text-muted"><i class="fa fa-folder-open fa-4x"></i><p>Nenhuma regra cadastrada</p></div>`;
      return;
    }

    // Render as simple list inside the tree container (keeps compatibility with departamentos layout)
    c.innerHTML = items.map(it => `
      <div class="dept-item">
        <div class="dept-header">
          <div class="dept-info">
            <div class="dept-icon" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);"><i class="fa fa-warehouse"></i></div>
            <div>
              <div class="dept-name">${it.name}</div>
              <div class="dept-code text-muted">Min: ${it.min ?? '-'} • Max: ${it.max ?? '-'} • Reorder: ${it.reorder ?? '-'}</div>
            </div>
          </div>
          <div class="dept-actions">
            <button class="btn btn-sm btn-outline-primary" onclick="editEstoque('${it.id}')"><i class="fa fa-edit"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteEstoque('${it.id}')"><i class="fa fa-trash"></i></button>
          </div>
        </div>
        <div class="dept-children">
          <div class="detail-item">Giro: ${it.turnover || '-'} dias</div>
          <div class="detail-item">Inventário: ${it.inventory || '-'}</div>
          <div class="detail-item">Alerta: ${it.alertEnabled ? 'Sim' : 'Não'}</div>
          <div class="detail-item">${it.desc || ''}</div>
        </div>
      </div>
    `).join('');

  }catch(e){
    console.error(e);
    const el = document.getElementById('estoqueTree') || document.getElementById('estoqueList');
    if (el) el.innerHTML = '<div class="alert alert-warning">Erro ao carregar regras de estoque.</div>';
  }
}

function openEstoqueModal(item=null){
  document.getElementById('estoqueFormDoc').reset();
  document.getElementById('estoqueId').value = '';
  document.getElementById('estoqueModalTitle').textContent = 'Nova Regra de Estoque';

  if(item){
    document.getElementById('estoqueId').value = item.id || '';
    document.getElementById('estoqueName').value = item.name || '';
    document.getElementById('estoqueMin').value = item.min || '';
    document.getElementById('estoqueMax').value = item.max || '';
    document.getElementById('estoqueReorder').value = item.reorder || '';
    document.getElementById('estoqueTurnover').value = item.turnover || '';
    document.getElementById('estoqueInventory').value = item.inventory || 'monthly';
    document.getElementById('estoqueAlertEnabled').checked = !!item.alertEnabled;
    document.getElementById('estoqueDesc').value = item.desc || '';
    document.getElementById('estoqueModalTitle').textContent = 'Editar Regra de Estoque';
  }

  $('#estoqueModal').modal('show');
}

async function editEstoque(id){
  try{
    const res = await axios.get(`${API_BASE}/estoque/${id}`);
    openEstoqueModal(res.data);
  }catch(e){
    console.error(e);
    alert('Erro ao obter regra');
  }
}

async function saveEstoque(){
  const id = document.getElementById('estoqueId').value;
  const data = {
    name: document.getElementById('estoqueName').value,
    min: parseFloat(document.getElementById('estoqueMin').value) || 0,
    max: parseFloat(document.getElementById('estoqueMax').value) || 0,
    reorder: parseFloat(document.getElementById('estoqueReorder').value) || 0,
    turnover: parseFloat(document.getElementById('estoqueTurnover').value) || 0,
    inventory: document.getElementById('estoqueInventory').value,
    alertEnabled: !!document.getElementById('estoqueAlertEnabled').checked,
    desc: document.getElementById('estoqueDesc').value
  };

  try{
    if(id) await axios.put(`${API_BASE}/estoque/${id}`, data);
    else await axios.post(`${API_BASE}/estoque`, data);
    $('#estoqueModal').modal('hide');
    loadEstoque();
  }catch(e){
    console.error(e);
    alert('Erro ao salvar regra');
  }
}

async function deleteEstoque(id){
  if(!confirm('Deseja realmente excluir esta regra?')) return;
  try{
    await axios.delete(`${API_BASE}/estoque/${id}`);
    loadEstoque();
  }catch(e){
    console.error(e);
    alert('Erro ao excluir regra');
  }
}

// Init
document.addEventListener('DOMContentLoaded', ()=>{
  const searchEl = document.getElementById('searchEstoque');
  if (searchEl) searchEl.addEventListener('input', debounce(loadEstoque,300));
  const invEl = document.getElementById('inventoryFilter');
  if (invEl) invEl.addEventListener('change', () => loadEstoque());
  loadEstoque();
});

function debounce(fn,t){ let timer; return (...a)=>{ clearTimeout(timer); timer=setTimeout(()=>fn(...a), t); }; }