const API_BASE = '/api';

async function loadFiscal() {
  try {
    const q = document.getElementById('searchFiscal').value;
    const res = await axios.get(`${API_BASE}/fiscal?search=${encodeURIComponent(q)}`);
    const items = res.data.data || res.data || [];
    document.getElementById('totalFiscal').textContent = items.length;
    const container = document.getElementById('fiscalList');
    if (items.length === 0) {
      container.innerHTML = `<div class="text-center py-5 text-muted"><i class="fa fa-folder-open fa-4x"></i><p>Nenhuma regra fiscal encontrada</p></div>`;
      return;
    }
    container.innerHTML = items.map(it => `
      <div class="card list-card">
        <div class="card-body d-flex justify-content-between align-items-center">
          <div>
            <div class="font-weight-bold">${it.description || ''}</div>
            <div class="text-muted">ICMS: ${it.icms_percent || it.icms || '-'}%  •  PIS: ${it.pis_percent || '-'}%  •  COFINS: ${it.cofins_percent || '-'}%</div>
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" onclick="editFiscal('${it.id}')"><i class="fa fa-edit"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteFiscal('${it.id}')"><i class="fa fa-trash"></i></button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Erro ao carregar fiscal:', err);
    document.getElementById('fiscalList').innerHTML = `<div class="alert alert-warning">Erro ao carregar regras fiscais.</div>`;
  }
}

function openFiscalModal(item = null) {
  document.getElementById('fiscalForm').reset();
  document.getElementById('fiscalId').value = '';
  document.getElementById('fiscalModalTitle').textContent = 'Novo Parâmetro Fiscal';
  if (item) {
    document.getElementById('fiscalId').value = item.id;
    document.getElementById('fiscalDesc').value = item.description || '';
    document.getElementById('fiscalIcms').value = item.icms_percent || item.icms || '';
    document.getElementById('fiscalPisCofins').value = (item.pis_percent || 0) + '/' + (item.cofins_percent || 0);
    document.getElementById('fiscalModalTitle').textContent = 'Editar Parâmetro Fiscal';
  }
  $('#fiscalModal').modal('show');
}

async function editFiscal(id) {
  try {
    const res = await axios.get(`${API_BASE}/fiscal/${id}`);
    openFiscalModal(res.data);
  } catch (err) {
    console.error('Erro ao obter item:', err);
    alert('Erro ao obter o parâmetro');
  }
}

async function saveFiscal() {
  const id = document.getElementById('fiscalId').value;
  const data = {
    description: document.getElementById('fiscalDesc').value,
    icms: parseFloat(document.getElementById('fiscalIcms').value) || 0,
    pisCofins: document.getElementById('fiscalPisCofins').value
  };
  try {
    if (id) await axios.put(`${API_BASE}/fiscal/${id}`, data);
    else await axios.post(`${API_BASE}/fiscal`, data);
    $('#fiscalModal').modal('hide');
    loadFiscal();
  } catch (err) {
    console.error('Erro ao salvar:', err);
    alert('Erro ao salvar regra fiscal');
  }
}

async function deleteFiscal(id) {
  if (!confirm('Deseja realmente excluir esta regra fiscal?')) return;
  try {
    await axios.delete(`${API_BASE}/fiscal/${id}`);
    loadFiscal();
  } catch (err) {
    console.error('Erro ao excluir:', err);
    alert('Erro ao excluir');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('searchFiscal').addEventListener('input', debounce(loadFiscal, 300));
  loadFiscal();
});

function debounce(fn, t) { let timer; return (...a) => { clearTimeout(timer); timer = setTimeout(() => fn(...a), t); }; }
