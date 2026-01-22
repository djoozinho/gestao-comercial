/**
 * Toast & Modal Notifications - Sistema Elegante
 * Substitui os alerts nativos do navegador
 */

(function() {
  'use strict';

  // ==========================================
  // TOAST SYSTEM
  // ==========================================

  // Container dos toasts
  let toastContainer = null;
  let miniToastContainer = null;

  function getToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  function getMiniToastContainer() {
    if (!miniToastContainer) {
      miniToastContainer = document.createElement('div');
      miniToastContainer.className = 'mini-toast-container';
      document.body.appendChild(miniToastContainer);
    }
    return miniToastContainer;
  }

  // Ícones por tipo
  const TOAST_ICONS = {
    success: '<i class="fas fa-check"></i>',
    error: '<i class="fas fa-times"></i>',
    warning: '<i class="fas fa-exclamation"></i>',
    info: '<i class="fas fa-info"></i>'
  };

  // Títulos padrão por tipo
  const TOAST_TITLES = {
    success: 'Sucesso!',
    error: 'Erro!',
    warning: 'Atenção!',
    info: 'Informação'
  };

  /**
   * Mini Toast - Notificação compacta e rápida (estilo antigo melhorado)
   * Ideal para feedback de ações rápidas como adicionar item
   */
  function showMiniToast(message, type = 'success') {
    const container = getMiniToastContainer();
    
    const colors = {
      success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      error: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      info: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
    };

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = 'mini-toast';
    toast.innerHTML = `
      <span class="mini-toast-icon">${icons[type] || icons.info}</span>
      <span class="mini-toast-message">${escapeHtml(message)}</span>
    `;
    toast.style.background = colors[type] || colors.info;

    container.appendChild(toast);

    // Auto-remove após 2 segundos
    setTimeout(() => {
      toast.classList.add('mini-toast-exit');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 2000);

    return toast;
  }

  /**
   * Exibe um toast notification completo
   * @param {Object} options - Configurações do toast
   * @param {string} options.message - Mensagem do toast
   * @param {string} [options.type='info'] - Tipo: success, error, warning, info
   * @param {string} [options.title] - Título (opcional, usa padrão por tipo)
   * @param {number} [options.duration=4000] - Duração em ms (0 = não fecha automaticamente)
   */
  function showToast(options) {
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    const {
      message,
      type = 'info',
      title = TOAST_TITLES[type],
      duration = 4000,
      compact = (('compact' in opts) ? opts.compact : ((String(opts.message || '').length < 60) && type !== 'error'))
    } = opts;

    const container = getToastContainer();

    // Prevent duplicate identical toasts: if same type+title+message exists, refresh its timer and progress
    const key = `${type}|${title}|${message}`;
    const existing = Array.from(container.children).find(c => c.dataset && c.dataset.toastKey === key && !c.classList.contains('toast-exit'));
    if (existing) {
      // Refresh progress bar animation
      const bar = existing.querySelector('.toast-progress-bar');
      if (bar) {
        bar.style.animation = 'none';
        // Force reflow
        void bar.offsetWidth;
        bar.style.animation = `toastProgress ${duration}ms linear forwards`;
      }
      // Clear previous timeout and set a new one
      if (existing._timeoutId) clearTimeout(existing._timeoutId);
      if (duration > 0) existing._timeoutId = setTimeout(() => removeToast(existing), duration);
      return existing;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}` + (compact ? ' toast-compact' : '');
    toast.dataset.toastKey = key;

    if (compact) {
      toast.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;min-width:220px;padding:10px 14px;">
          <div class="toast-icon" style="width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;">${TOAST_ICONS[type] || TOAST_ICONS.info}</div>
          <div style="flex:1;min-width:0;">
            <div class="toast-title" style="font-size:14px;font-weight:700;margin-bottom:2px;">${escapeHtml(title)}</div>
            <div class="toast-message" style="font-size:13px;color:var(--gray-600);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(message)}</div>
          </div>
          <button class="toast-close" aria-label="Fechar" style="background:transparent;border:none;color:var(--gray-500);width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;"> <i class="fas fa-times"></i></button>
        </div>
      `;
    } else {
      toast.innerHTML = `
        <div class="toast-icon">
          ${TOAST_ICONS[type] || TOAST_ICONS.info}
        </div>
        <div class="toast-content">
          <div class="toast-title">${escapeHtml(title)}</div>
          <div class="toast-message">${escapeHtml(message)}</div>
        </div>
        <button class="toast-close" aria-label="Fechar">
          <i class="fas fa-times"></i>
        </button>
        ${duration > 0 ? `
          <div class="toast-progress">
            <div class="toast-progress-bar" style="animation-duration: ${duration}ms"></div>
          </div>
        ` : ''}
      `;
    }

    // Botão de fechar
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) closeBtn.addEventListener('click', () => removeToast(toast));

    container.appendChild(toast);

    // Auto-remove
    if (duration > 0) {
      toast._timeoutId = setTimeout(() => removeToast(toast), duration);
    }

    return toast;
  }

  function removeToast(toast) {
    if (!toast || toast.classList.contains('toast-exit')) return;
    
    toast.classList.add('toast-exit');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  // Helpers para cada tipo
  function toastSuccess(message, title) {
    return showToast({ message, type: 'success', title });
  }

  function toastError(message, title) {
    return showToast({ message, type: 'error', title, duration: 6000 });
  }

  function toastWarning(message, title) {
    return showToast({ message, type: 'warning', title, duration: 5000 });
  }

  function toastInfo(message, title) {
    return showToast({ message, type: 'info', title });
  }

  // ==========================================
  // MODAL SYSTEM
  // ==========================================

  const MODAL_ICONS = {
    success: '<i class="fas fa-check"></i>',
    error: '<i class="fas fa-times"></i>',
    warning: '<i class="fas fa-exclamation-triangle"></i>',
    info: '<i class="fas fa-info-circle"></i>',
    question: '<i class="fas fa-question"></i>'
  };

  /**
   * Exibe um modal elegante (substituto do alert)
   * @param {Object} options - Configurações do modal
   * @returns {Promise} - Resolve quando o modal é fechado
   */
  function showModal(options) {
    const {
      message,
      title = '',
      type = 'info',
      confirmText = 'OK',
      showCancel = false,
      cancelText = 'Cancelar',
      confirmClass = 'elegant-modal-btn-primary'
    } = typeof options === 'string' ? { message: options } : options;

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'elegant-modal-overlay';
      
      overlay.innerHTML = `
        <div class="elegant-modal">
          <div class="elegant-modal-header">
            <div class="elegant-modal-icon icon-${type}">
              ${MODAL_ICONS[type] || MODAL_ICONS.info}
            </div>
            ${title ? `<h3 class="elegant-modal-title">${escapeHtml(title)}</h3>` : ''}
          </div>
          <div class="elegant-modal-body">
            <p class="elegant-modal-message">${escapeHtml(message)}</p>
          </div>
          <div class="elegant-modal-footer">
            ${showCancel ? `
              <button class="elegant-modal-btn elegant-modal-btn-secondary" data-action="cancel">
                ${escapeHtml(cancelText)}
              </button>
            ` : ''}
            <button class="elegant-modal-btn ${confirmClass}" data-action="confirm">
              ${escapeHtml(confirmText)}
            </button>
          </div>
        </div>
      `;

      function closeModal(result) {
        overlay.classList.add('modal-exit');
        setTimeout(() => {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
          resolve(result);
        }, 250);
      }

      // Event listeners
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeModal(false);
        }
      });

      const confirmBtn = overlay.querySelector('[data-action="confirm"]');
      const cancelBtn = overlay.querySelector('[data-action="cancel"]');

      confirmBtn.addEventListener('click', () => closeModal(true));
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => closeModal(false));
      }

      // ESC para fechar
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          closeModal(false);
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);

      document.body.appendChild(overlay);

      // Focus no botão de confirmar
      setTimeout(() => confirmBtn.focus(), 100);
    });
  }

  /**
   * Modal de sucesso
   */
  function modalSuccess(message, title = 'Sucesso!') {
    return showModal({
      message,
      title,
      type: 'success',
      confirmText: 'OK',
      confirmClass: 'elegant-modal-btn-success'
    });
  }

  /**
   * Modal de erro
   */
  function modalError(message, title = 'Erro!') {
    return showModal({
      message,
      title,
      type: 'error',
      confirmText: 'OK',
      confirmClass: 'elegant-modal-btn-danger'
    });
  }

  /**
   * Modal de aviso
   */
  function modalWarning(message, title = 'Atenção!') {
    return showModal({
      message,
      title,
      type: 'warning',
      confirmText: 'Entendi'
    });
  }

  /**
   * Modal de informação
   */
  function modalInfo(message, title = 'Informação') {
    return showModal({
      message,
      title,
      type: 'info',
      confirmText: 'OK'
    });
  }

  /**
   * Modal de confirmação (substituto do confirm)
   */
  function modalConfirm(message, title = 'Confirmar') {
    return showModal({
      message,
      title,
      type: 'question',
      showCancel: true,
      confirmText: 'Sim',
      cancelText: 'Não'
    });
  }

  /**
   * Modal de confirmação de exclusão
   */
  function modalDelete(message = 'Tem certeza que deseja excluir este item?', title = 'Excluir') {
    return showModal({
      message,
      title,
      type: 'warning',
      showCancel: true,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      confirmClass: 'elegant-modal-btn-danger'
    });
  }

  // ==========================================
  // HELPERS
  // ==========================================

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==========================================
  // EXPORT GLOBAL
  // ==========================================

  // Namespace Toast
  window.Toast = {
    show: showToast,
    success: toastSuccess,
    error: toastError,
    warning: toastWarning,
    info: toastInfo,
    mini: showMiniToast,  // Mini toast compacto para ações rápidas
    compact: function(message, type = 'info', title) { return showToast({ message, type, title, compact: true, duration: 2000 }); }
  };

  // Namespace Modal
  window.Modal = {
    show: showModal,
    success: modalSuccess,
    error: modalError,
    warning: modalWarning,
    info: modalInfo,
    confirm: modalConfirm,
    delete: modalDelete
  };

  // Sobrescreve alert padrão (opcional - descomente se quiser)
  // window.nativeAlert = window.alert;
  // window.alert = function(message) {
  //   return Modal.info(message);
  // };

})();
