const API_BASE = '/api';

async function loadBackups(){ 
  try{ 
    const q = document.getElementById('searchBackup').value; 
    const res = await axios.get(`${API_BASE}/backups?search=${encodeURIComponent(q)}`); 
    const items = res.data.data || res.data || []; 
    const c = document.getElementById('backupList'); 
    
    if(!items.length){ 
      c.innerHTML = `<div class="text-center py-5 text-muted"><i class="fa fa-folder-open fa-4x"></i><p>Nenhum backup disponível</p></div>`; 
      return;
    } 
    
    c.innerHTML = items.map(it => {
      const size = it.size ? (it.size / 1024 / 1024).toFixed(2) + ' MB' : '-';
      const date = it.created_at || it.createdAt || '-';
      return `
        <div class="card list-card mb-2">
          <div class="card-body d-flex justify-content-between align-items-center">
            <div>
              <div class="font-weight-bold"><i class="fa fa-database mr-2 text-primary"></i>${it.filename}</div>
              <div class="text-muted">Tamanho: ${size} • ${date} • <span class="badge badge-${it.status === 'completo' ? 'success' : 'warning'}">${it.status || 'completo'}</span></div>
            </div>
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-success" onclick="downloadBackup('${it.id}')"><i class="fa fa-download"></i> Download</button>
              <button class="btn btn-sm btn-outline-danger" onclick="deleteBackup('${it.id}')"><i class="fa fa-trash"></i></button>
            </div>
          </div>
        </div>`;
    }).join(''); 
  } catch(e) {
    console.error(e); 
    document.getElementById('backupList').innerHTML = '<div class="alert alert-warning">Erro ao carregar backups.</div>';
  } 
}

async function generateBackup(){ 
  try {
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Gerando...';
    
    const res = await axios.post(`${API_BASE}/backups`);
    
    btn.disabled = false;
    btn.innerHTML = originalText;
    
    alert('Backup gerado com sucesso: ' + res.data.filename);
    loadBackups();
  } catch(e) {
    console.error(e);
    alert('Erro ao gerar backup');
    if(event && event.target) {
      event.target.disabled = false;
      event.target.innerHTML = '<i class="fa fa-cloud-download-alt"></i> Gerar Backup Agora';
    }
  }
}

function downloadBackup(id){ 
  window.open(`${API_BASE}/backups/${id}/download`, '_blank');
}

async function deleteBackup(id){ 
  if(!confirm('Deseja realmente excluir este backup?')) return; 
  try { 
    await axios.delete(`${API_BASE}/backups/${id}`); 
    loadBackups(); 
  } catch(e) { 
    alert('Erro ao excluir backup'); 
  } 
}

document.addEventListener('DOMContentLoaded', () => { 
  document.getElementById('searchBackup').addEventListener('input', debounce(loadBackups, 300)); 
  loadBackups(); 
}); 

function debounce(fn, t) { 
  let timer; 
  return (...a) => { 
    clearTimeout(timer); 
    timer = setTimeout(() => fn(...a), t); 
  }; 
}