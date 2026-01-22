/**
 * Sidebar Menu - Injeta o menu padrão em todas as páginas
 * Este script padroniza o header/navbar em todas as páginas do sistema
 */

(function() {
  'use strict';

  // Menu padrão do sistema
  const menuItems = [
    { href: 'index.html', icon: 'fa-home', label: 'Início' },
    { href: 'pdv.html', icon: 'fa-cash-register', label: 'PDV' },
    { href: 'dashboard.html', icon: 'fa-chart-pie', label: 'Painel' },
    { href: 'nfe-emissao.html', icon: 'fa-file-invoice', label: 'Notas Fiscais' },
    { href: 'movimentos.html', icon: 'fa-exchange-alt', label: 'Movimentos' },
    { href: 'relatorios.html', icon: 'fa-chart-bar', label: 'Relatórios' },
    { href: 'pessoas.html', icon: 'fa-users', label: 'Clientes' },
    { href: 'produtos.html', icon: 'fa-boxes', label: 'Produtos' },
    { href: 'agenda.html', icon: 'fa-calendar', label: 'Agenda' },
    { href: 'admin.html', icon: 'fa-cogs', label: 'Admin' }
  ];

  // Detecta a página atual
  function getCurrentPage() {
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    return filename;
  }

  // Gera o HTML do menu
  function generateMenuHTML() {
    const currentPage = getCurrentPage();
    
    return menuItems.map(item => {
      const isActive = item.href === currentPage ? ' class="active"' : '';
      return `<li><a href="${item.href}"${isActive}><span class="menu-icon"><i class="fa ${item.icon}"></i></span><span class="menu-label">${item.label}</span></a></li>`;
    }).join('\n        ');
  }

  // Inicializa a sidebar
  function initSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Preserva o h4 (título/branding)
    let h4 = sidebar.querySelector('h4');
    const brandText = h4 ? h4.textContent : 'SISTEMA';
    
    // Sempre reconstrói o menu para garantir atualização
    h4 = document.createElement('h4');
    h4.id = 'brandName';
    h4.textContent = brandText;

    // Cria o menu
    const menuHTML = `
      <ul class="sidebar-menu">
        ${generateMenuHTML()}
      </ul>
    `;

    // Reconstrói a sidebar
    sidebar.innerHTML = '';
    sidebar.appendChild(h4);
    sidebar.insertAdjacentHTML('beforeend', menuHTML);
  }

  // Atualiza o estado ativo do menu
  function updateActiveState(menu) {
    const currentPage = getCurrentPage();
    const links = menu.querySelectorAll('a');
    
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href === currentPage) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  // Executa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
  } else {
    initSidebar();
  }

})();
