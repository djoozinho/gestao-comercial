
      document.addEventListener('DOMContentLoaded', function() {
        const state = {
          products: [],
          cart: [],
          categories: [],
          allProducts: [],
          activeCategory: 'Todos',
          discount: 0,
          addition: 0,
          pendingSales: [],
          currentClient: null,
          saleNumber: 1,
        };

        const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
        const formatMoney = (v) => currency.format(Number(v || 0));

        // Simple sound helper using Web Audio API
        let _audioCtx = null;
        function getAudioCtx() {
          try { if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return _audioCtx; } catch(e){ console.warn('AudioContext not available', e); return null; }
        }
        function playSound(type='click') {
          const ctx = getAudioCtx();
          if (!ctx) return;
          try {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            const now = ctx.currentTime;
            // frequency mapping per event
            const map = { add: 880, remove: 440, success: 960, error: 220, hold: 660, low: 560 };
            o.type = 'sine';
            o.frequency.value = map[type] || 600;
            g.gain.setValueAtTime(0.0001, now);
            g.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
            o.start(now);
            g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
            o.stop(now + 0.19);
          } catch (err) { console.warn('sound error', err); }
        }

        // --- Elementos da UI ---
        const productListEl = document.getElementById('productList');
        const categoryListEl = document.getElementById('category-list');
        const cartItemsEl = document.getElementById('cartItems');
        const cartTableEl = document.getElementById('cartTable');
        const cartTableBodyEl = document.getElementById('cartTableBody');
        const emptyCartMessageEl = document.getElementById('emptyCartMessage');
        const searchInput = document.getElementById('searchProd');
        const barcodeInput = document.getElementById('barcodeInput');
        const prodCountEl = document.getElementById('prodCount');
        const subtotalEl = document.getElementById('subtotalVal');
        const discountEl = document.getElementById('discountVal');
        const additionEl = document.getElementById('additionVal');
        const totalEl = document.getElementById('totalVal');
        const totalQtyEl = document.getElementById('totalQty');
        const itemCountEl = document.getElementById('itemCount');
        const btnCheckout = document.getElementById('btnCheckout');
        const btnCancel = document.getElementById('btnCancel');
        const btnHold = document.getElementById('btnHold');
        // Robust payModal wrapper: support jQuery object when available, otherwise provide minimal API over Bootstrap Modal
        const payModalEl = document.getElementById('payModal');
        let payModalInstance = null;
        function ensurePayModalInstance() {
          try {
            if (window.bootstrap && payModalEl) {
              payModalInstance = window.bootstrap.Modal.getOrCreateInstance(payModalEl);
              // flush pending actions
              if (payModal._pending && payModal._pending.length) {
                payModal._pending.forEach(a => { try { payModal.modal(a); } catch(e){} });
                payModal._pending.length = 0;
              }
            }
          } catch(e) { /* ignore */ }
        }
        const payModal = (function(){
          if (window.jQuery) return window.jQuery('#payModal');
          const obj = {
            el: payModalEl,
            _pending: [],
            modal(action){
              ensurePayModalInstance();
              if (!payModalInstance) { obj._pending.push(action); return; }
              if (action === 'show') payModalInstance.show();
              if (action === 'hide') payModalInstance.hide();
            },
            one(eventName, handler){ if (!payModalEl) return; const wrapper = function(e){ handler(e); payModalEl.removeEventListener(eventName, wrapper); }; payModalEl.addEventListener(eventName, wrapper); },
            hasClass(cls){ return payModalEl && payModalEl.classList.contains(cls); }
          };
          return obj;
        })();

        const modalTotalEl = document.getElementById('modalTotal');
        const payAmountInput = document.getElementById('payAmount');
        const changeValEl = document.getElementById('changeVal');
        const confirmPayBtn = document.getElementById('confirmPay');
        const pendingSalesSection = document.getElementById('pendingSalesSection');
        const pendingSalesList = document.getElementById('pendingSalesList');
        const pendingSalesCount = document.getElementById('pendingSalesCount');
        const saleStatusEl = document.getElementById('saleStatus');

        // --- Funções de Renderização ---
        function renderProducts() {
          productListEl.innerHTML = '';
          const query = searchInput.value.toLowerCase();
          
          const filteredProducts = state.allProducts.filter(p => {
            const inCategory = state.activeCategory === 'Todos' || p.category === state.activeCategory;
            const matchesQuery = !query || p.name.toLowerCase().includes(query) || (p.sku || '').toLowerCase().includes(query) || (p.code || '').toString().includes(query);
            return inCategory && matchesQuery;
          });

          prodCountEl.textContent = filteredProducts.length;

          if (filteredProducts.length === 0) {
            productListEl.innerHTML = '<div class="text-muted p-3 text-center">Nenhum produto encontrado.</div>';
            return;
          }

          filteredProducts.forEach(p => {
            const item = document.createElement('div');
            item.className = 'prod-item';
            
            // Gerar imagem ou ícone baseado na categoria
            const getProductIcon = (category) => {
              const icons = {
                'Bebidas': 'fa-wine-bottle',
                'Comidas': 'fa-utensils',
                'Eletrônicos': 'fa-mobile-alt',
                'Roupas': 'fa-tshirt',
                'Livros': 'fa-book',
                'Casa': 'fa-home',
                'Esportes': 'fa-dumbbell',
                'Beleza': 'fa-spa',
                'Farmácia': 'fa-pills'
              };
              return icons[category] || 'fa-box';
            };
            
            const stockStatus = (stock) => {
              if (stock <= 0) return 'out-of-stock';
              if (stock <= 5) return 'low-stock';
              return '';
            };
            
            const stockText = (stock) => {
              if (stock <= 0) return 'Sem estoque';
              if (stock <= 5) return `Baixo: ${stock} un`;
              return `Estoque: ${stock} un`;
            };
            
            const stockVal = (typeof p.stock === 'number') ? p.stock : 0;
            item.innerHTML = `
              <div class="prod-image">
                ${p.image ? `<img src="${p.image}" alt="${p.name}">` : `<i class="fas ${getProductIcon(p.category || 'Outros')}"></i>`}
              </div>
              <div class="prod-code">#${p.code || p.id}</div>
              <div class="prod-category">${p.category || 'Produto'}</div>
              <div class="prod-name">${p.name}</div>
              <div class="prod-price">${formatMoney(p.price)}</div>
              <div class="prod-stock ${stockStatus(stockVal)}">${stockText(stockVal)}</div>
            `;
            item.onclick = () => addToCart(p.id);
            productListEl.appendChild(item);
          });
        }

        function renderCategories() {
          categoryListEl.innerHTML = '';
          const categories = ['Todos', ...new Set(state.allProducts.map(p => p.category || 'Outros'))];
          state.categories = categories;

          categories.forEach(cat => {
            const btn = document.createElement('div');
            btn.className = 'category-btn' + (cat === state.activeCategory ? ' active' : '');
            btn.textContent = cat;
            btn.onclick = () => {
              state.activeCategory = cat;
              document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              renderProducts();
            };
            categoryListEl.appendChild(btn);
          });
        }

        function renderCart() {
          const totalQty = state.cart.reduce((s, it) => s + it.qty, 0);
          itemCountEl.textContent = totalQty;
          totalQtyEl.textContent = totalQty;

          if (state.cart.length === 0) {
            cartTableEl.style.display = 'none';
            emptyCartMessageEl.style.display = 'block';
            updateSaleStatus('open');
          } else {
            cartTableEl.style.display = 'table';
            emptyCartMessageEl.style.display = 'none';
            updateSaleStatus('pending');
            
            cartTableBodyEl.innerHTML = '';
            state.cart.forEach((item, index) => {
              const row = document.createElement('tr');
              row.style.cssText = 'transition: all 0.2s ease;';
              row.innerHTML = `
                <td style="padding: 10px 8px; font-size: 12px; font-weight: 600; color: var(--muted);">${String(index + 1).padStart(2, '0')}</td>
                <td style="padding: 10px 8px;">
                  <div style="font-size: 13px; font-weight: 600; color: var(--text-color);">${item.name}</div>
                  <div style="font-size: 11px; color: var(--muted);">#${item.code || item.id}</div>
                </td>
                <td style="padding: 10px 8px; text-align: center;">
                  <div class="d-flex align-items-center justify-content-center" style="gap: 4px;">
                    <button class="btn btn-sm btn-outline-secondary qty-btn" data-act="dec" data-id="${item.id}" style="width: 24px; height: 24px; padding: 0; font-size: 12px; border-radius: 6px;">-</button>
                    <span style="font-weight: 700; min-width: 24px; text-align: center;">${item.qty}</span>
                    <button class="btn btn-sm btn-outline-secondary qty-btn" data-act="inc" data-id="${item.id}" style="width: 24px; height: 24px; padding: 0; font-size: 12px; border-radius: 6px;">+</button>
                  </div>
                </td>
                <td style="padding: 10px 8px; text-align: right; font-size: 12px; color: var(--muted);">${formatMoney(item.price)}</td>
                <td style="padding: 10px 8px; text-align: right; font-size: 13px; font-weight: 700; color: var(--brand);">${formatMoney(item.price * item.qty)}</td>
                <td style="padding: 10px 8px; text-align: center;">
                  <button class="btn btn-sm btn-link text-danger p-0" data-act="rem" data-id="${item.id}" style="font-size: 14px;"><i class="fa fa-trash"></i></button>
                </td>
              `;
              row.onmouseenter = () => row.style.background = 'rgba(37, 99, 235, 0.05)';
              row.onmouseleave = () => row.style.background = '';
              cartTableBodyEl.appendChild(row);
            });
          }
          updateTotals();
        }

        function updateSaleStatus(status) {
          if (status === 'open') {
            saleStatusEl.className = 'sale-status open';
            saleStatusEl.innerHTML = '<i class="fa fa-circle"></i><span>Venda Aberta</span>';
          } else if (status === 'pending') {
            saleStatusEl.className = 'sale-status pending';
            saleStatusEl.innerHTML = '<i class="fa fa-circle"></i><span>Em Andamento</span>';
          }
        }

        function updateTotals() {
          const subtotal = state.cart.reduce((s, it) => s + (it.price * it.qty), 0);
          const total = subtotal - state.discount + state.addition;
          subtotalEl.textContent = formatMoney(subtotal);
          discountEl.textContent = formatMoney(state.discount);
          additionEl.textContent = formatMoney(state.addition);
          totalEl.textContent = formatMoney(total);
        }

        function renderPendingSales() {
          if (state.pendingSales.length === 0) {
            pendingSalesSection.style.display = 'none';
            return;
          }

          pendingSalesSection.style.display = 'block';
          pendingSalesCount.textContent = state.pendingSales.length;
          pendingSalesList.innerHTML = '';

          state.pendingSales.forEach((sale, index) => {
            const item = document.createElement('div');
            item.className = 'pending-sale-item';
            item.innerHTML = `
              <div class="sale-client">${sale.client || 'Cliente não informado'}</div>
              <div class="sale-value">${formatMoney(sale.total)}</div>
              <div class="sale-time">${sale.time}</div>
            `;
            item.onclick = () => restorePendingSale(index);
            pendingSalesList.appendChild(item);
          });
        }

        // --- Lógica do Carrinho ---
        function addToCart(productId) {
          const product = state.allProducts.find(p => p.id === productId);
          if (!product) return;

          const available = (typeof product.stock === 'number') ? product.stock : 0;
          const cartItem = state.cart.find(item => item.id === productId);
          const currentQty = cartItem ? cartItem.qty : 0;

          if (available <= currentQty) {
            showToast(`Estoque insuficiente para ${product.name}. Disponível: ${available}`, 'warning');
            playSound('low');
            return;
          }

          if (cartItem) {
            cartItem.qty++;
          } else {
            state.cart.push({ ...product, qty: 1 });
          }
          renderCart();
          
          // Feedback visual
          showToast(`${product.name} adicionado`, 'success');
          // Sound feedback
          playSound('add');
        }

        function addToCartByBarcode(code) {
          const product = state.allProducts.find(p => 
            (p.code && p.code.toString() === code) || 
            (p.sku && p.sku === code) ||
            (p.barcode && p.barcode === code) ||
            (p.id && p.id.toString() === code)
          );
          
          if (product) {
            addToCart(product.id);
            barcodeInput.value = '';
            barcodeInput.focus();
          } else {
            showToast('Produto não encontrado!', 'danger');
            playSound('error');
            barcodeInput.select();
          }
        }

        function updateCartItem(productId, action) {
          const cartItem = state.cart.find(item => String(item.id) === String(productId));
          if (!cartItem) return;

          if (action === 'inc') {
            const prod = state.allProducts.find(p => String(p.id) === String(productId));
            const available = (prod && typeof prod.stock === 'number') ? prod.stock : 0;
            if (cartItem.qty + 1 > available) {
              showToast(`Estoque insuficiente para ${cartItem.name}. Disponível: ${available}`, 'warning');
              playSound('low');
            } else {
              cartItem.qty++;
            }
          } else if (action === 'dec') {
            cartItem.qty--;
            if (cartItem.qty <= 0) {
              state.cart = state.cart.filter(item => String(item.id) !== String(productId));
              playSound('remove');
            }
          } else if (action === 'rem') {
            state.cart = state.cart.filter(item => String(item.id) !== String(productId));
            playSound('remove');
          }
          renderCart();
        }
        
        function clearCart() {
            state.cart = [];
            state.discount = 0;
            state.addition = 0;
            state.currentClient = null;
            renderCart();
        }

        // --- Vendas em Espera ---
        function holdSale() {
          if (state.cart.length === 0) {
            showToast('Carrinho vazio!', 'warning');
            return;
          }

          const subtotal = state.cart.reduce((s, it) => s + (it.price * it.qty), 0);
          const total = subtotal - state.discount + state.addition;

          const pendingSale = {
            cart: [...state.cart],
            discount: state.discount,
            addition: state.addition,
            client: state.currentClient,
            total: total,
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          };

          state.pendingSales.push(pendingSale);
          clearCart();
          renderPendingSales();
          showToast('Venda colocada em espera!', 'info');
          playSound('hold');
        }

        function restorePendingSale(index) {
          const sale = state.pendingSales[index];
          if (!sale) return;

          // Se há itens no carrinho atual, perguntar
          if (state.cart.length > 0) {
            if (!confirm('Há itens no carrinho atual. Deseja substituir pela venda em espera?')) {
              return;
            }
          }

          state.cart = [...sale.cart];
          state.discount = sale.discount;
          state.addition = sale.addition;
          state.currentClient = sale.client;
          state.pendingSales.splice(index, 1);
          
          renderCart();
          renderPendingSales();
          showToast('Venda restaurada!', 'success');
        }

        // --- Toast notifications ---
        function showToast(message, type = 'info') {
          const colors = {
            success: 'var(--success)',
            danger: 'var(--danger)',
            warning: 'var(--warning)',
            info: 'var(--brand)'
          };

          const toast = document.createElement('div');
          toast.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: ${colors[type]};
            color: white;
            padding: 12px 20px;
            border-radius: 10px;
            font-weight: 600;
            font-size: 14px;
            z-index: 9999;
            box-shadow: 0 8px 25px rgba(0,0,0,0.2);
            animation: slideIn 0.3s ease;
          `;
          toast.textContent = message;
          document.body.appendChild(toast);

          setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
          }, 2000);
        }

        // CSS para animações
        const style = document.createElement('style');
        style.textContent = `
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
          }
        `;
        document.head.appendChild(style);

        // --- Lógica de Pagamento ---
        function openCheckout() {
            if (state.cart.length === 0) {
                alert('O carrinho está vazio.');
                return;
            }
            const subtotal = state.cart.reduce((s, it) => s + (it.price * it.qty), 0);
            const total = subtotal - state.discount + state.addition;
            
            // Atualizar valores no modal
            document.getElementById('modalSubtotal').textContent = formatMoney(subtotal);
            document.getElementById('modalDiscount').textContent = formatMoney(state.discount);
            modalTotalEl.textContent = formatMoney(total);
            payAmountInput.value = total.toFixed(2);
            calculateChange();
            
            // Reset para dinheiro e esconder parcelas
            const cashRadio = document.querySelector('input[name="payMethod"][value="cash"]');
            if (cashRadio) {
                cashRadio.checked = true;
                
                // Remover active de todos os labels
                document.querySelectorAll('.btn-group-toggle label').forEach(label => {
                    label.classList.remove('active');
                });
                
                // Adicionar active no label do dinheiro
                cashRadio.parentElement.classList.add('active');
            }
            
            document.getElementById('installmentsGroup').style.display = 'none';
            
            // Resetar seletor de parcelas
            document.getElementById('installments').value = '1';
            updateInstallmentInfo();
            
            payModal.modal('show');
        }

        function calculateChange() {
            const total = state.cart.reduce((s, it) => s + (it.price * it.qty), 0) - state.discount + state.addition;
            const received = parseFloat(payAmountInput.value) || 0;
            const change = received - total;
            changeValEl.textContent = formatMoney(Math.max(0, change));
        }

        function updateInstallmentInfo() {
            const total = state.cart.reduce((s, it) => s + (it.price * it.qty), 0) - state.discount + state.addition;
            const installments = parseInt(document.getElementById('installments').value) || 1;
            const payMethod = document.querySelector('input[name="payMethod"]:checked')?.value;
            const installmentInfo = document.getElementById('installmentInfo');
            
            if (installments > 1) {
                const valuePerInstallment = total / installments;
                const methodText = payMethod === 'card' ? 'crédito' : 'a prazo';
                const dueDateInfo = payMethod === 'prazo' ? ' (1ª parcela em 30 dias)' : '';
                installmentInfo.innerHTML = `<i class="fa fa-calculator mr-1"></i>${installments}x de ${formatMoney(valuePerInstallment)} ${methodText}${dueDateInfo}`;
                installmentInfo.className = 'text-info mt-2 font-weight-bold';
            } else {
                installmentInfo.textContent = 'Pagamento à vista';
                installmentInfo.className = 'text-muted mt-2';
            }
        }

        async function finalizeSale() {
            // Validações básicas
            const subtotal = state.cart.reduce((s, it) => s + (it.price * it.qty), 0);
            const total = subtotal - state.discount + state.addition;
            const payMethod = document.querySelector('input[name="payMethod"]:checked')?.value;
            const client = document.getElementById('payClient').value || 'Cliente Padrão';
            const receivedAmount = parseFloat(payAmountInput.value) || 0;
            const installments = parseInt(document.getElementById('installments').value) || 1;
            
            if (!payMethod) {
                alert('Selecione um método de pagamento.');
                return;
            }
            
            if (payMethod === 'cash' && receivedAmount < total) {
                alert('Valor recebido é menor que o total da venda.');
                return;
            }
            
            const now = new Date();
            const itemsDescription = `Itens: ${state.cart.map(item => `${item.name} (${item.qty}x)`).join(', ')}`;
            
            try {
                // Evita envios duplicados
                if (confirmPayBtn) confirmPayBtn.disabled = true;

                // Se for parcelado (crédito ou a prazo com mais de 1x)
                if ((payMethod === 'card' || payMethod === 'prazo') && installments > 1) {
                    const valuePerInstallment = total / installments;
                    
                    // Criar uma transação para cada parcela
                    for (let i = 1; i <= installments; i++) {
                        const dueDate = new Date(now);
                        
                        if (payMethod === 'card') {
                            // Crédito: todas as parcelas são consideradas pagas (já debitadas do cartão)
                            dueDate.setDate(now.getDate() + (i * 30)); // Parcelas mensais
                        } else {
                            // A prazo: primeira parcela 30 dias, demais mensais
                            dueDate.setDate(now.getDate() + (i * 30));
                        }
                        
                        // sanitize cart to avoid large payloads (strip images and large fields)
                        const cartForNotes = state.cart.map(item => ({ id: item.id, code: item.code, name: item.name, price: item.price, qty: item.qty }));
                        const itemsJson = JSON.stringify(cartForNotes);
                        const itemsJsonLimited = itemsJson.length > 2000 ? itemsJson.slice(0, 2000) + '...' : itemsJson;

                        const transaction = {
                            category: 'Vendas',
                            dueDate: dueDate.toISOString().split('T')[0],
                            description: `Venda PDV - Parcela ${i}/${installments} - ${payMethod === 'card' ? 'Crédito' : 'A Prazo'}`,
                            person: client,
                            value: valuePerInstallment,
                            amount: valuePerInstallment,
                            type: 'venda',
                            valueDue: payMethod === 'card' ? 0 : valuePerInstallment, // Crédito já está pago
                            paid: payMethod === 'card', // Crédito já está pago
                            status: payMethod === 'card' ? 'pago' : 'pendente',
                            paymentDate: payMethod === 'card' ? now.toISOString() : null,
                            paymentMethod: payMethod,
                            installments: installments,
                            installmentNumber: i,
                            notes: `ITEMS_JSON:${itemsJsonLimited} | ${itemsDescription} - Parcela ${i} de ${installments}`
                        };

                        await axios.post('/api/transactions', transaction);
                    }
                } else {
                    // Pagamento à vista ou única parcela
                    // sanitize cart to avoid large payloads (strip images and large fields)
                    const cartForNotes = state.cart.map(item => ({ id: item.id, code: item.code, name: item.name, price: item.price, qty: item.qty }));
                    const itemsJson = JSON.stringify(cartForNotes);
                    const itemsJsonLimited = itemsJson.length > 2000 ? itemsJson.slice(0, 2000) + '...' : itemsJson;

                    const transaction = {
                        category: 'Vendas',
                        dueDate: now.toISOString().split('T')[0],
                        description: `Venda PDV - ${state.cart.length} item(ns) - ${payMethod}`,
                        person: client,
                        value: total,
                        amount: total,
                        type: 'venda',
                        // Se for 'a prazo' (única parcela), registrar como pendente/fiado; caso contrário marcar como pago
                        valueDue: (payMethod === 'prazo') ? total : 0,
                        paid: (payMethod === 'prazo') ? false : true,
                        status: (payMethod === 'prazo') ? 'pendente' : 'pago',
                        paymentDate: (payMethod === 'prazo') ? null : now.toISOString(),
                        paymentMethod: payMethod,
                        installments: 1,
                        notes: `ITEMS_JSON:${itemsJsonLimited} | ${itemsDescription}`
                    };

                    await axios.post('/api/transactions', transaction);
                }
                
                // Atualizar estoque dos produtos
                for (const item of state.cart) {
                    try {
                        const product = state.allProducts.find(p => p.id === item.id);
                        if (product && product.stock !== undefined) {
                            const newStock = Math.max(0, (product.stock || 0) - item.qty);
                            // Send only the minimal payload (stock) to avoid large requests (images)
                            await axios.put(`/api/products/${item.id}`, { stock: newStock });
                            console.log(`Estoque atualizado: ${product.name} - ${product.stock} -> ${newStock}`);
                        }
                    } catch (stockError) {
                        console.error('Erro ao atualizar estoque do produto:', item.name, stockError);
                    }
                }
                
                // Sucesso
                const successMessage = installments > 1 ? 
                    `Venda parcelada em ${installments}x de ${formatMoney(total/installments)} realizada com sucesso!` :
                    'Venda finalizada com sucesso!';
                    
                // Sinaliza para outras abas/páginas que o dashboard deve ser recarregado
                try { localStorage.setItem('dashboard_refresh', Date.now()); } catch(e) { /* ignore */ }

                alert(successMessage);
                playSound('success');
                clearCart();
                payModal.modal('hide');
                
                // Recarregar produtos para atualizar estoque na tela
                init();
                
            } catch (error) {
                console.error('Erro ao salvar venda:', error);
                playSound('error');
                alert('Falha ao salvar a venda. Verifique o console para mais detalhes.');
            } finally {
                if (confirmPayBtn) confirmPayBtn.disabled = false;
            }
        }

        // --- Inicialização e Eventos ---
        async function init() {
          try {
            // Carregar produtos
            const response = await axios.get('/api/products');
            // Mapear field 'photo' do backend para 'image' usado no frontend
            state.allProducts = (response.data.data || []).map(p => (Object.assign({}, p, { image: p.photo || p.image || null })));
            renderCategories();
            renderProducts();
            renderPendingSales();
            
            // Carregar clientes para o datalist
            try {
              const clientsResponse = await axios.get('/api/people');
              const clients = clientsResponse.data.data || [];
              const clientsList = document.getElementById('clientsList');
              clientsList.innerHTML = '';
              clients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.name;
                option.textContent = `${client.name} - ${client.phone || 'Sem telefone'}`;
                clientsList.appendChild(option);
              });
            } catch (clientError) {
              console.warn('Erro ao carregar clientes:', clientError);
            }
            // Bind client-search modal controls
            try { attachClientSearchBindings(); } catch(e){}
          } catch (error) { console.error('Erro na inicialização do PDV:', error); }

          // Event Listeners
          searchInput.addEventListener('input', renderProducts);
          btnCheckout.addEventListener('click', openCheckout);
          btnCancel.addEventListener('click', () => {
            if (state.cart.length > 0 && confirm('Deseja cancelar a venda atual?')) {
              clearCart();
              showToast('Venda cancelada!', 'danger');
            }
          });
          btnHold.addEventListener('click', holdSale);
          payAmountInput.addEventListener('input', calculateChange);
          confirmPayBtn.addEventListener('click', finalizeSale);

          // Código de barras - Enter para adicionar
          barcodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const code = barcodeInput.value.trim();
              if (code) {
                addToCartByBarcode(code);
              }
            }
          });

          // Botões rápidos
          document.getElementById('btnHelp')?.addEventListener('click', () => showHelp());
          document.getElementById('btnClient')?.addEventListener('click', () => {
            openCheckout();
            payModal.one('shown.bs.modal', () => document.getElementById('payClient')?.focus());
          });
          document.getElementById('btnSearch')?.addEventListener('click', () => searchInput.focus());
          document.getElementById('btnDiscount')?.addEventListener('click', () => applyDiscount());


          // Event listener para formas de pagamento e parcelas
          document.addEventListener('change', function(e) {
            if (e.target && e.target.name === 'payMethod') {
              const installmentsGroup = document.getElementById('installmentsGroup');
              
              // Remover classe active de todos os labels
              document.querySelectorAll('.btn-group-toggle label').forEach(label => {
                label.classList.remove('active');
              });
              
              // Adicionar classe active no label do radio selecionado
              if (e.target.checked) {
                e.target.parentElement.classList.add('active');
              }
              
              // Mostrar/esconder campo de parcelas para Crédito e A Prazo
              if (e.target.value === 'card' || e.target.value === 'prazo') {
                installmentsGroup.style.display = 'block';
                updateInstallmentInfo();
              } else {
                installmentsGroup.style.display = 'none';
              }
            }
            
            // Atualizar info das parcelas quando mudar o número
            if (e.target && e.target.id === 'installments') {
              updateInstallmentInfo();
            }
          });

          // Event listener para clicks nos labels dos botões
          document.addEventListener('click', function(e) {
            if (e.target.closest('.btn-group-toggle label')) {
              const label = e.target.closest('label');
              const radio = label.querySelector('input[type="radio"]');
              
              if (radio) {
                // Disparar evento change manualmente
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          });

          cartItemsEl.addEventListener('click', (e) => {
            const target = e.target.closest('button[data-act]');
            if (target) {
              const action = target.dataset.act;
              const productId = target.dataset.id;
              updateCartItem(productId, action);
            }
          });

          // Atalhos de teclado
          document.addEventListener('keydown', (e) => {
            const isPayModalOpen = !!(payModal && payModal.hasClass && payModal.hasClass('show'));
            const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

            if (e.key === 'F1') {
              e.preventDefault();
              showHelp();
            }
            if (e.key === 'F2') {
              e.preventDefault();
              if (!isPayModalOpen) {
                openCheckout();
                if (payModal && payModal.one) {
                  payModal.one('shown.bs.modal', () => {
                    document.getElementById('payClient')?.focus();
                  });
                }
              } else {
                document.getElementById('payClient')?.focus();
              }
            }
            if (e.key === 'F3') {
              e.preventDefault();
              searchInput.focus();
            }
            if (e.key === 'F4') {
              e.preventDefault();
              openCheckout();
            }
            if (e.key === 'F5') {
                e.preventDefault();
                applyDiscount();
            }
            if (e.key === 'F6') {
              e.preventDefault();
              const selectCard = () => {
                const cardRadio = document.querySelector('input[name="payMethod"][value="card"]');
                if (!cardRadio) return;
                cardRadio.checked = true;
                cardRadio.dispatchEvent(new Event('change', { bubbles: true }));
              };

              if (!isPayModalOpen) {
                openCheckout();
                if (payModal && payModal.one) {
                  payModal.one('shown.bs.modal', () => {
                    selectCard();
                    document.getElementById('payAmount')?.focus();
                  });
                }
              } else {
                selectCard();
                document.getElementById('payAmount')?.focus();
              }
            }
            if (e.key === 'F7') {
              e.preventDefault();
              barcodeInput.focus();
              barcodeInput.select();
            }
            if (e.key === 'F8') {
              e.preventDefault();
              holdSale();
            }
            if (e.key === 'F9') {
              e.preventDefault();
              if (state.cart.length > 0 && confirm('Deseja cancelar a venda atual?')) {
                clearCart();
                showToast('Venda cancelada!', 'danger');
              }
            }
            if (e.key === 'F10') {
              e.preventDefault();
              const selectPix = () => {
                const pixRadio = document.querySelector('input[name="payMethod"][value="pix"]');
                if (!pixRadio) return;
                pixRadio.checked = true;
                pixRadio.dispatchEvent(new Event('change', { bubbles: true }));
              };

              if (!isPayModalOpen) {
                openCheckout();
                if (payModal && payModal.one) {
                  payModal.one('shown.bs.modal', () => {
                    selectPix();
                  });
                }
              } else {
                selectPix();
              }
            }
            if (e.key === 'F11') {
              e.preventDefault();
              const selectCash = () => {
                const cashRadio = document.querySelector('input[name="payMethod"][value="cash"]');
                if (!cashRadio) return;
                cashRadio.checked = true;
                cashRadio.dispatchEvent(new Event('change', { bubbles: true }));
              };

              if (!isPayModalOpen) {
                openCheckout();
                if (payModal && payModal.one) {
                  payModal.one('shown.bs.modal', () => {
                    selectCash();
                    document.getElementById('payAmount')?.focus();
                  });
                }
              } else {
                selectCash();
                document.getElementById('payAmount')?.focus();
              }
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              if (isPayModalOpen) {
                payModal.modal('hide');
              } else if (confirm('Deseja sair do PDV?')) {
                window.location.href = 'dashboard.html';
              }
            }
          });

          // Relógio e data
          function updateDateTime() {
            const now = new Date();
            document.getElementById('currentTime').textContent = now.toLocaleTimeString('pt-BR');
            document.getElementById('currentDate').textContent = now.toLocaleDateString('pt-BR');
          }
          updateDateTime();
          setInterval(updateDateTime, 1000);

          // Focar no campo de código de barras ao carregar
          setTimeout(() => barcodeInput.focus(), 100);
        }
      } catch (error) {
        console.error('Erro na inicialização do PDV:', error);
      }

        function showHelp() {
          alert(
            [
              '═══════════════════════════════════',
              '        ATALHOS DO PDV',
              '═══════════════════════════════════',
              '',
              'F1  - Ajuda (esta tela)',
              'F2  - Selecionar cliente',
              'F3  - Buscar produto',
              'F4  - Finalizar venda',
              'F5  - Aplicar desconto',
              'F6  - Pagamento com cartão',
              'F7  - Foco no código de barras',
              'F8  - Colocar venda em espera',
              'F9  - Cancelar venda',
              'F10 - Pagamento PIX',
              'F11 - Pagamento em dinheiro',
              'ESC - Sair do PDV',
              '',
              '═══════════════════════════════════'
            ].join('\n')
          );
        }

        function applyDiscount() {
          const discountValue = parseFloat(prompt("Digite o valor do desconto:", state.discount.toString()));
          if (!isNaN(discountValue) && discountValue >= 0) {
            state.discount = discountValue;
            updateTotals();
            showToast(`Desconto de ${formatMoney(discountValue)} aplicado!`, 'success');
          }
        }

        // Funções para pagar contas em aberto do cliente (suporta pagamento parcial)
        async function openAccountsModal() {
          const client = document.getElementById('payClient').value.trim();
          if (!client) { alert('Informe o cliente para buscar contas em aberto.'); return; }
          try {
            const res = await axios.get('/api/transactions?search=' + encodeURIComponent(client));
            const list = res.data && res.data.data ? res.data.data : res.data;
            const open = (list || []).filter(t => !t.paid && parseFloat(t.valueDue) > 0);
            if (!open.length) { alert('Nenhuma conta em aberto para este cliente.'); return; }

            const tbody = document.getElementById('openAccountsTbody');
            tbody.innerHTML = '';
            open.forEach(tx => {
              const tr = document.createElement('tr');
              // campo de pagamento parcial: se vazio, considera quitar integralmente
              tr.innerHTML = `<td>${tx.description || ''}</td>
                              <td>${tx.dueDate || ''}</td>
                              <td class="text-right current-due">${formatMoney(tx.valueDue)}</td>
                              <td><input type="number" step="0.01" class="form-control form-control-sm pay-value" placeholder="0.00" style="width: 120px;" data-max="${tx.valueDue}"></td>
                              <td class="text-right"><button class="btn btn-sm btn-success pay-account-btn" data-id="${tx.id}" data-value="${tx.valueDue}"><i class="fa fa-check mr-1"></i>Pagar</button></td>`;
              // store tx id on the row for easy lookup
              tr.setAttribute('data-tx-id', tx.id);
              tbody.appendChild(tr);
            });

            tbody.querySelectorAll('.pay-account-btn').forEach(btn => {
              btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const row = e.currentTarget.closest('tr');
                const input = row.querySelector('.pay-value');
                const rawVal = parseFloat(input.value || '0');
                const originalDue = parseFloat(input.getAttribute('data-max') || '0');
                const payAmount = isNaN(rawVal) || rawVal <= 0 ? originalDue : rawVal; // default = full payment if empty or invalid
                if (payAmount <= 0) { alert('Informe um valor válido para pagamento.'); return; }
                if (payAmount > originalDue + 0.0001) { alert('Valor informado maior que o saldo em aberto.'); return; }
                if (!confirm(`Confirmar pagamento de ${formatMoney(payAmount)}?`)) return;

                try {
                  const payMethod = document.querySelector('input[name="payMethod"]:checked')?.value || 'cash';
                  const now = new Date().toISOString();
                  const newDue = Math.max(0, (originalDue - payAmount));

                  // 1) Atualiza a transação original com o novo saldo/estado
                  await axios.put('/api/transactions/' + id, { valueDue: newDue, paid: newDue === 0, status: newDue === 0 ? 'pago' : 'parcial', paymentDate: now, paymentMethod: payMethod });

                  // 2) Registra um lançamento de recebimento para refletir o dinheiro no caixa (categoria 'Recebimentos')
                  const receipt = {
                    category: 'Recebimentos',
                    dueDate: now.split('T')[0],
                    description: `Recebimento PDV - ${payMethod}`,
                    person: document.getElementById('payClient').value || '',
                    value: payAmount,
                    amount: payAmount,
                    type: 'entrada',
                    valueDue: 0,
                    paid: true,
                    status: 'pago',
                    paymentDate: now,
                    paymentMethod: payMethod,
                    notes: `Pagamento da transação ${id}`
                  };

                  await axios.post('/api/transactions', receipt);

                  showToast('Pagamento registrado com sucesso!', 'success');
                  // atualizar badge de contas em aberto
                  try { updateOpenAccountsBadge(); } catch(e){}

                  if (newDue === 0) {
                    row.remove();
                  } else {
                    row.querySelector('.current-due').textContent = formatMoney(newDue);
                    input.setAttribute('data-max', newDue);
                    input.value = '';
                  }

                  // Fecha modal se não houver mais contas
                  if (!document.getElementById('openAccountsTbody').querySelector('tr')) {
                    if (window.jQuery) jQuery('#payAccountModal').modal('hide'); else if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById('payAccountModal')).hide();
                  }
                } catch (err) {
                  console.error(err);
                  alert('Erro ao processar pagamento da conta.');
                }
              });
            });

            if (window.jQuery) jQuery('#payAccountModal').modal('show'); else if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById('payAccountModal')).show();
          } catch (err) {
            console.error(err);
            alert('Erro ao buscar contas do cliente.');
          }
        }

        // Cliente-search modal + helper functions
        function openClientAccountModal() {
          const modalEl = document.getElementById('clientAccountModal');
          if (!modalEl) return;
          // reset
          document.getElementById('client-search-stage').style.display = '';
          document.getElementById('client-accounts-stage').style.display = 'none';
          document.getElementById('clientSearchInput').value = '';
          document.getElementById('clientSearchResults').innerHTML = '';
          if (window.jQuery) jQuery('#clientAccountModal').modal('show'); else if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modalEl).show();
          setTimeout(() => document.getElementById('clientSearchInput')?.focus(), 200);
        }

        // --- DEBUG INSTRUMENTATION (ativar com ?debug=1) ---
        (function(){
          const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1';
          if (!debugEnabled) { try{ const btn = document.getElementById('debugToggleBtn'); if (btn) btn.style.display='none'; } catch(e){}; return; }
          try {
            const dbgState = { logs: [], max: 2000 };
            function appendDebug(level, msg, meta){
              try{
                dbgState.logs.unshift({ts: new Date().toISOString(), level, msg, meta});
                if (dbgState.logs.length > dbgState.max) dbgState.logs.length = dbgState.max;
                const dbgContainer = document.getElementById('debugLogs');
                if (!dbgContainer) return;
                const el = document.createElement('div');
                el.className = 'debug-log ' + (level||'info');
                el.innerHTML = `<div style="display:flex;justify-content:space-between"><div><strong>[${level}]</strong> ${msg}</div><div style="font-size:0.9rem;color:#666">${new Date().toLocaleTimeString()}</div></div>`;
                el.onclick = () => { if (meta && meta.el) try{ meta.el.style.outline='3px solid #f39'; setTimeout(()=>meta.el.style.outline='none',2000);}catch(e){} };
                dbgContainer.insertBefore(el, dbgContainer.firstChild);
                document.getElementById('dbgCount').textContent = dbgState.logs.length;
              }catch(e){ console.error('debug append failed', e); }
            }

            // Override console
            ['log','info','warn','error'].forEach(fn => {
              const orig = console[fn];
              console[fn] = function(...args){
                try{ appendDebug(fn, args.map(a=> (typeof a==='object'? JSON.stringify(a): String(a))).join(' '), {}); }catch(e){}
                orig.apply(console, args);
              }
            });

            // Global error handlers
            window.addEventListener('error', function(ev){ appendDebug('error', ev.message + ' @ ' + (ev.filename||'') + ':'+(ev.lineno||'') , {evt:ev}); });
            window.addEventListener('unhandledrejection', function(ev){ appendDebug('error', 'UnhandledPromiseRejection: ' + (ev.reason && (ev.reason.message||JSON.stringify(ev.reason))||ev.reason), {evt:ev}); });

            // Wrap addEventListener to catch errors inside handlers and log element info
            const origAdd = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function(type, listener, options){
              const wrapped = function(e){
                try{ return listener.call(this, e); }
                catch(err){
                  const desc = (this && this.tagName) ? `${this.tagName}${this.id?('#'+this.id):''}${this.className?('.'+this.className.split(' ').join('.')):''}` : String(this);
                  appendDebug('error', `Error in handler for '${type}' on ${desc}: ${err && err.message ? err.message : err}`, {el:this, err});
                  throw err; // rethrow to preserve original behavior
                }
              };
              // keep reference so removeEventListener may still work in most cases
              try{ listener.__debug_wrapped = wrapped; }catch(e){}
              return origAdd.call(this, type, wrapped, options);
            };

            // Axios interceptors (network)
            if (window.axios) {
              axios.interceptors.request.use(req => { appendDebug('info','XHR -> ' + req.method.toUpperCase() + ' ' + req.url, {req}); return req; }, err=>{ appendDebug('error','XHR request error: '+(err && err.message||err)); return Promise.reject(err); });
              axios.interceptors.response.use(resp => { appendDebug('info','XHR <- ' + resp.status + ' ' + (resp.config && resp.config.url), {resp}); return resp; }, err=>{ appendDebug('error','XHR response error: '+(err && err.message||err)); return Promise.reject(err); });
            }

            // XHR fallback
            try{
              const XHR = XMLHttpRequest.prototype;
              const origSend = XHR.send;
              const origOpen = XHR.open;
              XHR.open = function(method,url){ this.__dbg_method = method; this.__dbg_url = url; return origOpen.apply(this, arguments); };
              XHR.send = function(){
                this.addEventListener('load', ()=>{ appendDebug('info', `XHR ${this.__dbg_method} ${this.__dbg_url} -> ${this.status}`, {status:this.status,url:this.__dbg_url}); });
                this.addEventListener('error', ()=>{ appendDebug('error', `XHR ${this.__dbg_method} ${this.__dbg_url} error`, {}); });
                return origSend.apply(this, arguments);
              };
            }catch(e){}

            // localStorage wrapper to detect blocked storage
            const safeLocal = {
              setItem(k,v){ try{ localStorage.setItem(k,v); } catch(e){ appendDebug('warn','localStorage.setItem blocked: '+(e && e.message || e),{}); } },
              getItem(k){ try{ return localStorage.getItem(k); } catch(e){ appendDebug('warn','localStorage.getItem blocked: '+(e && e.message || e),{}); return null; } }
            };
            window._safeLocal = safeLocal;

            // UI bindings
            document.getElementById('debugToggleBtn')?.addEventListener('click', ()=>{ if (window.jQuery) jQuery('#debugPanelModal').modal('show'); else if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById('debugPanelModal')).show(); });
            document.getElementById('dbgClear')?.addEventListener('click', ()=>{ document.getElementById('debugLogs').innerHTML=''; document.getElementById('dbgCount').textContent = '0'; dbgState.logs.length = 0; });
            document.getElementById('dbgDownload')?.addEventListener('click', ()=>{ const data = JSON.stringify(dbgState.logs, null, 2); const blob = new Blob([data], {type: 'application/json'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='pdv-debug-log.json'; a.click(); URL.revokeObjectURL(url); });

            // Allow toggles (they are cosmetic here; logic can be extended)
            ['dbgConsole','dbgErrors','dbgEvents','dbgNetwork'].forEach(id=>{
              const el = document.getElementById(id); if (!el) return; el.addEventListener('change', ()=> appendDebug('info','Debug toggle '+id+' -> '+(el.checked),{}));
            });

            appendDebug('info','Debug instrumentation loaded');
          } catch(e){ console.error('Failed to initialize debug instrumentation', e); }
        })();

        let clientSearchTimer = null;
        async function searchClients(q) {
          try {
            const query = (q || '').trim();
            if (!query) {
              document.getElementById('clientSearchResults').innerHTML = '';
              return;
            }
            const res = await axios.get('/api/people?search=' + encodeURIComponent(query));
            const list = res.data && res.data.data ? res.data.data : res.data;
            const tbody = document.getElementById('clientSearchResults');
            tbody.innerHTML = '';
            (list || []).forEach(p => {
              const tr = document.createElement('tr');
              tr.innerHTML = `<td>${p.name || ''}</td><td>${p.phone || ''}</td><td class="text-right"><button class="btn btn-sm btn-primary select-client-btn" data-name="${p.name}">Selecionar</button></td>`;
              tbody.appendChild(tr);
            });
            tbody.querySelectorAll('.select-client-btn').forEach(btn => btn.addEventListener('click', (e) => {
              const name = e.currentTarget.getAttribute('data-name');
              selectClientForAccounts(name);
            }));
          } catch (err) {
            console.error(err);
            alert('Erro ao buscar clientes.');
          }
        }

        function attachClientSearchBindings() {
          const input = document.getElementById('clientSearchInput');
          const btn = document.getElementById('clientSearchBtn');
          input?.addEventListener('input', () => { clearTimeout(clientSearchTimer); clientSearchTimer = setTimeout(() => searchClients(input.value), 300); });
          btn?.addEventListener('click', () => searchClients(document.getElementById('clientSearchInput').value));
          document.getElementById('clientBackToSearch')?.addEventListener('click', () => {
            document.getElementById('client-accounts-stage').style.display = 'none';
            document.getElementById('client-search-stage').style.display = '';
            document.getElementById('clientSearchInput').value = '';
            document.getElementById('clientSearchResults').innerHTML = '';
          });
        }

        async function selectClientForAccounts(name) {
          document.getElementById('selectedClientName').textContent = name;
          // keep main payClient in sync for convenience
          try { document.getElementById('payClient').value = name; } catch(e){}
          document.getElementById('client-search-stage').style.display = 'none';
          document.getElementById('client-accounts-stage').style.display = '';
          await fetchAndRenderOpenAccounts(name, 'clientAccountsTbody', true);
        }

        async function fetchAndRenderOpenAccounts(client, tbodyId = 'openAccountsTbody', focusOnModal = false) {
          try {
            const res = await axios.get('/api/transactions?search=' + encodeURIComponent(client));
            const list = res.data && res.data.data ? res.data.data : res.data;
            const open = (list || []).filter(t => !t.paid && parseFloat(t.valueDue) > 0);
            const tbody = document.getElementById(tbodyId);
            tbody.innerHTML = '';
            open.forEach(tx => {
              const tr = document.createElement('tr');
              tr.innerHTML = `<td>${tx.description || ''}</td>
                              <td>${tx.dueDate || ''}</td>
                              <td class="text-right current-due">${formatMoney(tx.valueDue)}</td>
                              <td><input type="number" step="0.01" class="form-control form-control-sm pay-value" placeholder="0.00" style="width: 120px;" data-max="${tx.valueDue}"></td>
                              <td class="text-right"><button class="btn btn-sm btn-success pay-account-btn" data-id="${tx.id}" data-value="${tx.valueDue}"><i class="fa fa-check mr-1"></i>Pagar</button></td>`;
              tbody.appendChild(tr);
            });

            tbody.querySelectorAll('.pay-account-btn').forEach(btn => {
              btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const row = e.currentTarget.closest('tr');
                const input = row.querySelector('.pay-value');
                const rawVal = parseFloat(input.value || '0');
                const originalDue = parseFloat(input.getAttribute('data-max') || '0');
                const payAmount = isNaN(rawVal) || rawVal <= 0 ? originalDue : rawVal;
                if (payAmount <= 0) { alert('Informe um valor válido para pagamento.'); return; }
                if (payAmount > originalDue + 0.0001) { alert('Valor informado maior que o saldo em aberto.'); return; }
                if (!confirm(`Confirmar pagamento de ${formatMoney(payAmount)}?`)) return;

                try {
                  const payMethod = document.querySelector('input[name="payMethod"]:checked')?.value || 'cash';
                  const now = new Date().toISOString();
                  const newDue = Math.max(0, (originalDue - payAmount));

                  // atualizar transação original
                  await axios.put('/api/transactions/' + id, { valueDue: newDue, paid: newDue === 0, status: newDue === 0 ? 'pago' : 'parcial', paymentDate: now, paymentMethod: payMethod });

                  // registrar recebimento
                  const receipt = {
                    category: 'Recebimentos',
                    dueDate: now.split('T')[0],
                    description: `Recebimento PDV - ${payMethod}`,
                    person: client,
                    value: payAmount,
                    amount: payAmount,
                    type: 'entrada',
                    valueDue: 0,
                    paid: true,
                    status: 'pago',
                    paymentDate: now,
                    paymentMethod: payMethod,
                    notes: `Pagamento da transação ${id}`
                  };

                  await axios.post('/api/transactions', receipt);

                  showToast('Pagamento registrado com sucesso!', 'success');
                  try { updateOpenAccountsBadge(); } catch(e){}

                  if (newDue === 0) {
                    row.remove();
                  } else {
                    row.querySelector('.current-due').textContent = formatMoney(newDue);
                    input.setAttribute('data-max', newDue);
                    input.value = '';
                  }

                  // fechar modal se não houver mais contas no stage atual
                  const any = document.getElementById(tbodyId).querySelector('tr');
                  if (!any) {
                    if (tbodyId === 'clientAccountsTbody') {
                      // voltar para busca
                      document.getElementById('client-accounts-stage').style.display = 'none';
                      document.getElementById('client-search-stage').style.display = '';
                      document.getElementById('clientSearchInput').value = '';
                      document.getElementById('clientSearchResults').innerHTML = '';
                    } else {
                      if (window.jQuery) jQuery('#payAccountModal').modal('hide'); else if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById('payAccountModal')).hide();
                    }
                  }
                } catch (err) {
                  console.error(err);
                  alert('Erro ao processar pagamento da conta.');
                }
              });
            });

            // optionally focus
            if (focusOnModal) document.querySelector('#clientAccountsTbody .pay-value')?.focus();
          } catch (err) {
            console.error(err);
            alert('Erro ao buscar contas do cliente.');
          }
        }

        // Vincular botão (modal and main button)
        document.getElementById('btnPayAccount')?.addEventListener('click', openAccountsModal);
        document.getElementById('btnPayAccountMain')?.addEventListener('click', openClientAccountModal);

        // Badge: mostra número de contas em aberto para o cliente selecionado (debounced)
        let openCountTimer = null;
        async function updateOpenAccountsBadge() {
          const client = document.getElementById('payClient').value.trim();
          const badge = document.getElementById('payAccountBadge');
          if (!client) { if (badge) badge.style.display = 'none'; return; }
          try {
            const res = await axios.get('/api/transactions?search=' + encodeURIComponent(client));
            const list = res.data && res.data.data ? res.data.data : res.data;
            const open = (list || []).filter(t => !t.paid && parseFloat(t.valueDue) > 0);
            const total = open.length;
            if (badge) {
              if (total > 0) { badge.textContent = total; badge.style.display = 'inline-block'; }
              else { badge.style.display = 'none'; }
            }
          } catch (err) { console.error(err); if (badge) badge.style.display = 'none'; }
        }
        document.getElementById('payClient')?.addEventListener('input', () => { clearTimeout(openCountTimer); openCountTimer = setTimeout(updateOpenAccountsBadge, 400); });

        // (debug utilities removed)

        init();
      });
    