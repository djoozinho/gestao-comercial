const API_BASE = '/api';

async function loadComissoes(){
  try{
    const q = (document.getElementById('searchCom')||{}).value || '';
    const period = (document.getElementById('periodFilter')||{}).value || '';
    let url = `${API_BASE}/comissoes?search=${encodeURIComponent(q)}`;
    if(period) url += `&period=${encodeURIComponent(period)}`;
    const res = await axios.get(url);
    const items = res.data.data || [];

    // stats
    const vendors = new Set(items.map(i=>i.vendorName).filter(Boolean));
    const totalVendors = vendors.size;
    const totalTargets = items.filter(i=>i.target && i.target>0).length;
    const totalCommissions = items.filter(i=>i.paid).length;
    const vendorSums = {};
    items.forEach(i=>{ if(i.vendorName){ vendorSums[i.vendorName] = (vendorSums[i.vendorName]||0) + (Number(i.target)||0); }});
    const topVendor = Object.keys(vendorSums).sort((a,b)=>vendorSums[b]-vendorSums[a])[0] || '-';
    const setIf = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent = val; };
    setIf('totalVendors', totalVendors);
    setIf('totalTargets', totalTargets);
    setIf('totalCommissions', totalCommissions);
    setIf('topVendor', topVendor);

    const container = document.getElementById('comissoesList');
    if(!items.length){ container.innerHTML = `<div class="text-center py-5 text-muted"><i class="fa fa-folder-open fa-4x"></i><p>Nenhuma meta/comissão encontrada</p></div>`; return; }

    container.innerHTML = items.map(it => `
      <div class="card list-card mb-2">
        <div class="card-body d-flex justify-content-between align-items-center">
          <div>
            <div class="font-weight-bold">${escapeHtml(it.vendorName || '')} <small class="text-muted">• ${it.period || ''}</small></div>
            <div class="text-muted">% ${it.percent} • Bônus R$ ${it.bonus} • Meta R$ ${it.target} ${it.paid? '• <span class="badge badge-success">Pago</span>' : ''}</div>
            <div class="small text-muted">${escapeHtml(it.description||'')}</div>
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" onclick="editComissao('${it.id}')"><i class="fa fa-edit"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteComissao('${it.id}')"><i class="fa fa-trash"></i></button>
          </div>
        </div>
      </div>
    `).join('');

  }catch(e){
    console.error(e);
    const container = document.getElementById('comissoesList');
    container.innerHTML = '<div class="alert alert-warning">Erro ao carregar comissões.</div>';
  }
}

function openComissaoModal(item=null){
  document.getElementById('comForm').reset();
  document.getElementById('comId').value='';
  document.getElementById('comissaoModalTitle').textContent='Nova Meta/Comissão';
  if(item){
    document.getElementById('comId').value=item.id;
    document.getElementById('comVendor').value=item.vendorName||'';
    document.getElementById('comPercent').value=item.percent||0;
    document.getElementById('comBonus').value=item.bonus||0;
    document.getElementById('comTarget').value=item.target||0;
    document.getElementById('comPeriod').value=item.period||'monthly';
    document.getElementById('comPaid').value=item.paid? '1':'0';
    document.getElementById('comDesc').value=item.description||'';
    document.getElementById('comissaoModalTitle').textContent='Editar Meta/Comissão';
  }
  $('#comissaoModal').modal('show');
}

async function editComissao(id){ try{ const res = await axios.get(`${API_BASE}/comissoes/${id}`); openComissaoModal(res.data); }catch(e){ alert('Erro ao obter comissão'); } }

async function saveComissao(){
  const id = document.getElementById('comId').value;
  const data = {
    vendorName: document.getElementById('comVendor').value,
    percent: Number(document.getElementById('comPercent').value)||0,
    bonus: Number(document.getElementById('comBonus').value)||0,
    target: Number(document.getElementById('comTarget').value)||0,
    period: document.getElementById('comPeriod').value,
    paid: document.getElementById('comPaid').value === '1',
    description: document.getElementById('comDesc').value
  };
  try{
    if(id) await axios.put(`${API_BASE}/comissoes/${id}`, data);
    else await axios.post(`${API_BASE}/comissoes`, data);
    $('#comissaoModal').modal('hide');
    loadComissoes();
  }catch(e){ console.error(e); alert('Erro ao salvar'); }
}

async function deleteComissao(id){ if(!confirm('Excluir?')) return; try{ await axios.delete(`${API_BASE}/comissoes/${id}`); loadComissoes(); }catch(e){alert('Erro ao excluir');} }

function openRankingModal(){
  // simples: compute top vendors by target sum
  (async ()=>{
    document.getElementById('rankingBody').innerHTML = 'Carregando...';
    try{
      const res = await axios.get(`${API_BASE}/comissoes`);
      const items = res.data.data||[];
      const vendorSums = {};
      items.forEach(i=>{ if(i.vendorName) vendorSums[i.vendorName] = (vendorSums[i.vendorName]||0) + (Number(i.target)||0); });
      const ranking = Object.keys(vendorSums).map(v=>({ vendor: v, total: vendorSums[v]})).sort((a,b)=>b.total-a.total);
      if(!ranking.length) { document.getElementById('rankingBody').innerHTML = '<p class="text-muted">Sem dados</p>'; $('#rankingModal').modal('show'); return; }
      document.getElementById('rankingBody').innerHTML = '<ol>' + ranking.map(r=>`<li>${escapeHtml(r.vendor)} — R$ ${Number(r.total).toFixed(2)}</li>`).join('') + '</ol>';
      $('#rankingModal').modal('show');
    }catch(e){ console.error(e); document.getElementById('rankingBody').innerHTML = '<div class="alert alert-warning">Erro ao carregar ranking</div>'; $('#rankingModal').modal('show'); }
  })();
}

// Helpers
function escapeHtml(str){ return String(str||'').replace(/[&<>"]+/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[s]||s)); }

// Init
document.addEventListener('DOMContentLoaded', ()=>{
  const searchEl = document.getElementById('searchCom'); if(searchEl) searchEl.addEventListener('input', debounce(loadComissoes,300));
  const periodEl = document.getElementById('periodFilter'); if(periodEl) periodEl.addEventListener('change', loadComissoes);
  document.addEventListener('keydown', (e)=>{ if(e.key === 'F2') openComissaoModal(); });
  loadComissoes();
});

function debounce(fn,t){ let timer; return (...a)=>{ clearTimeout(timer); timer=setTimeout(()=>fn(...a), t); }; }