/**
 * Sistema de Branding/Personalização
 * Carrega nome da empresa e configurações visuais do localStorage
 * Aplica automaticamente em todas as páginas do sistema
 */
(function() {
  'use strict';

  // Função para obter configurações da empresa
  function getCompanySettings() {
    try {
      const saved = localStorage.getItem('companySettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          name: parsed.name || parsed.companyName || 'Gestão Comercial',
          fantasyName: parsed.fantasyName || parsed.fantasy_name || parsed.name || 'Minha Empresa',
          primaryColor: parsed.primaryColor || parsed.primary_color || '#6366f1',
          secondaryColor: parsed.secondaryColor || parsed.secondary_color || '#10b981',
          logo: parsed.logo || null,
          slogan: parsed.slogan || 'Sistema de Gestão Comercial'
        };
      }
    } catch(e) {
      console.warn('Erro ao carregar configurações da empresa:', e);
    }
    return {
      name: 'Gestão Comercial',
      fantasyName: 'Minha Empresa',
      primaryColor: '#6366f1',
      secondaryColor: '#10b981',
      logo: null,
      slogan: 'Sistema de Gestão Comercial'
    };
  }

  // Salvar configurações da empresa
  function saveCompanySettings(settings) {
    try {
      localStorage.setItem('companySettings', JSON.stringify(settings));
      applyBranding();
      return true;
    } catch(e) {
      console.error('Erro ao salvar configurações:', e);
      return false;
    }
  }

  // Aplicar branding em toda a página
  function applyBranding() {
    const settings = getCompanySettings();
    const companyName = settings.fantasyName || settings.name || 'Sistema';

    // 1. Atualizar título da sidebar
    const sidebarTitles = document.querySelectorAll('.sidebar h4');
    sidebarTitles.forEach(el => {
      if (el.textContent === 'SISTEMA' || el.textContent.includes('Sistema') || el.id === 'brandName') {
        el.textContent = companyName.toUpperCase();
        el.id = 'brandName';
      }
    });

    // 2. Atualizar título da página (document.title)
    const pageTitle = document.title;
    if (pageTitle) {
      // Remove qualquer nome antigo e adiciona o novo
      const parts = pageTitle.split(' - ');
      if (parts.length > 1) {
        document.title = `${parts[0]} - ${companyName}`;
      } else if (pageTitle.includes('Sistema')) {
        document.title = pageTitle.replace('Sistema', companyName);
      }
    }

    // 3. Atualizar textos de boas-vindas (welcome-title, etc)
    // .welcome-title deve mostrar: "Bem Vindo a <Nome da Empresa>"
    const welcomeTitleEls = document.querySelectorAll('.welcome-title');
    welcomeTitleEls.forEach(el => {
      el.textContent = `Bem Vindo a ${companyName}`;
    });

    // Elementos que apenas exibem o nome da empresa
    const companyNameEls = document.querySelectorAll('.company-name, #companyName');
    companyNameEls.forEach(el => {
      el.textContent = companyName;
    });

    // 4. Aplicar cores personalizadas como variáveis CSS
    if (settings.primaryColor) {
      const root = document.documentElement;
      root.style.setProperty('--brand', settings.primaryColor);
      root.style.setProperty('--brand-dark', adjustColor(settings.primaryColor, -20));
      root.style.setProperty('--brand-light', adjustColor(settings.primaryColor, 40));
      root.style.setProperty('--brand-gradient', `linear-gradient(135deg, ${settings.primaryColor}, ${settings.secondaryColor || '#818cf8'})`);
    }

    // 5. Aplicar logo como favicon (ou usar SVG dinâmico)
    applyFavicon(settings);

    // 6. Disparar evento customizado para outras partes do sistema
    window.dispatchEvent(new CustomEvent('brandingApplied', { detail: settings }));
  }

  // Aplicar favicon
  function applyFavicon(settings) {
    // Remover favicons existentes para evitar conflitos
    const existingFavicons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
    
    if (settings.logo && settings.logo.startsWith('data:image')) {
      // Usar logo da empresa como favicon
      existingFavicons.forEach(f => f.remove());
      const favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.href = settings.logo;
      document.head.appendChild(favicon);
    } else {
      // Criar favicon SVG dinâmico com a cor da marca
      setDynamicFavicon(settings.primaryColor || '#6366f1');
    }
  }

  // Criar favicon SVG dinâmico com a cor da marca
  function setDynamicFavicon(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${adjustColor(color, 30)};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="12" fill="url(#brandGrad)"/>
      <path d="M18 22h28l-5 16H24z" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="26" cy="44" r="3" fill="white"/>
      <circle cx="42" cy="44" r="3" fill="white"/>
    </svg>`;
    
    const encoded = btoa(unescape(encodeURIComponent(svg)));
    
    // Remover favicons existentes
    document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(f => f.remove());
    
    // Adicionar novo favicon
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/svg+xml';
    favicon.href = `data:image/svg+xml;base64,${encoded}`;
    document.head.appendChild(favicon);
  }

  // Função auxiliar para ajustar cores (clarear/escurecer)
  function adjustColor(hex, percent) {
    // Remover # se existir
    hex = hex.replace('#', '');
    
    // Converter para RGB
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    
    // Ajustar
    r = Math.min(255, Math.max(0, r + percent));
    g = Math.min(255, Math.max(0, g + percent));
    b = Math.min(255, Math.max(0, b + percent));
    
    // Converter de volta para hex
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Executar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBranding);
  } else {
    applyBranding();
  }

  // Re-aplicar após um pequeno delay (para páginas que carregam conteúdo dinamicamente)
  setTimeout(applyBranding, 500);

  // Expor globalmente para atualização dinâmica
  window.applyBranding = applyBranding;
  window.getCompanySettings = getCompanySettings;
  window.saveCompanySettings = saveCompanySettings;
  window.setDynamicFavicon = setDynamicFavicon;
})();
