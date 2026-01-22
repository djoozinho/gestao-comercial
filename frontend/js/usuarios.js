const API_BASE = '/api';

async function loadUsers(){
  try{
    const q = document.getElementById('searchUser').value || '';
    const res = await axios.get(`${API_BASE}/users?search=${encodeURIComponent(q)}`);
    const items = res.data.data || res.data || [];

    // Atualizar estatísticas
    document.getElementById('totalUsers').textContent = items.length;
    document.getElementById('activeUsers').textContent = items.filter(u => u.active).length;
    const roles = new Set(items.map(u => u.role).filter(Boolean));
    document.getElementById('totalRoles').textContent = roles.size;

    const c = document.getElementById('userList');
    if(!items.length){
      c.innerHTML = `<div class="text-center py-5 text-muted"><i class="fa fa-folder-open fa-4x"></i><p>Nenhum usuário cadastrado</p></div>`;
      return;
    }

    c.innerHTML = items.map(it => `
      <div class="card list-card user-card">
        <div class="card-body d-flex justify-content-between align-items-center">
          <div>
            <div class="font-weight-bold">${it.name}</div>
            <div class="text-muted">${it.email || '—'} • ${it.role||'—'}</div>
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" onclick="fetchAndEditUser('${it.id}')"><i class="fa fa-edit"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteUser('${it.id}')"><i class="fa fa-trash"></i></button>
          </div>
        </div>
      </div>
    `).join('');

  }catch(e){
    console.error(e);
    document.getElementById('userList').innerHTML = '<div class="alert alert-warning">Erro ao carregar usuários.</div>';
  }
}

async function fetchAndEditUser(id){
  try{
    const res = await axios.get(`${API_BASE}/users/${id}`);
    openUserModal(res.data);
  }catch(e){
    console.error(e);
    alert('Erro ao obter usuário');
  }
}

function openUserModal(item=null){
  document.getElementById('userForm').reset();
  document.getElementById('userId').value = '';
  document.getElementById('userModalTitle').textContent = 'Novo Usuário';

  // limpar permissões
  ['permCancel','permChangePrice','permReports'].forEach(id => { const el = document.getElementById(id); if(el) el.checked = false; });

  if(item){
    document.getElementById('userId').value = item.id || '';
    document.getElementById('userName').value = item.name || '';
    document.getElementById('userEmail').value = item.email || '';
    document.getElementById('userRole').value = item.role || 'Admin';
    document.getElementById('userActive').value = item.active ? '1' : '0';

    const perms = item.permissions || {};
    if(perms.cancel) document.getElementById('permCancel').checked = true;
    if(perms.changePrice) document.getElementById('permChangePrice').checked = true;
    if(perms.reports) document.getElementById('permReports').checked = true;

    document.getElementById('userModalTitle').textContent = 'Editar Usuário';
  }

  $('#userModal').modal('show');
}

async function saveUser(){
  const id = document.getElementById('userId').value;
  const data = {
    name: document.getElementById('userName').value.trim(),
    email: document.getElementById('userEmail').value.trim(),
    role: document.getElementById('userRole').value,
    active: document.getElementById('userActive').value === '1',
    permissions: {
      cancel: !!document.getElementById('permCancel').checked,
      changePrice: !!document.getElementById('permChangePrice').checked,
      reports: !!document.getElementById('permReports').checked
    }
  };

  try{
    if(id){
      await axios.put(`${API_BASE}/users/${id}`, data);
    } else {
      await axios.post(`${API_BASE}/users`, data);
    }
    $('#userModal').modal('hide');
    loadUsers();
  }catch(e){
    console.error(e);
    alert('Erro ao salvar usuário');
  }
}

async function deleteUser(id){
  if(!confirm('Deseja realmente excluir este usuário?')) return;
  try{
    await axios.delete(`${API_BASE}/users/${id}`);
    loadUsers();
  }catch(e){
    console.error(e);
    alert('Erro ao excluir usuário');
  }
}

// Init
document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('searchUser').addEventListener('input', debounce(loadUsers,300));
  loadUsers();
});

function debounce(fn,t){ let timer; return (...a)=>{ clearTimeout(timer); timer=setTimeout(()=>fn(...a), t); }; }