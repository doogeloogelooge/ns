// --- CART VIEW PAGE CONTROLLER ---

async function initCartPage() {
  const container = document.getElementById('cart-items-container');
  if (!container) return;

  const cart = typeof getCart === 'function' ? getCart() : [];
  const checkoutBtn = document.querySelector('.checkout-proceed-btn');

  // Kontrollera om varukorgen är helt tom vid sidladdning
  if (cart.length === 0) {
    container.innerHTML = `<p style="padding: 20px 0; color: #666;">Din varukorg är tom.</p>`;
    updateSummaryTotals(0);
    if (checkoutBtn) checkoutBtn.style.display = 'none';
    return;
  } else {
    if (checkoutBtn) checkoutBtn.style.display = 'inline-block';
  }

  const variantIds = cart.map(item => item.variantId);

  try {
    const { data: variants, error } = await supabaseClient
      .from('product_variants')
      .select(`
        id,
        price,
        stock,
        image_url,
        variant_name,
        products ( title, brand, slug, campaigns(id, name, discount_percentage) ),
        campaigns ( id, name, discount_percentage )
      `)
      .in('id', variantIds);

    if (error) throw error;

    renderCartList(variants, cart);

  } catch (err) {
    console.error('Error loading cart views items:', err);
    container.innerHTML = `<p>Det gick inte att ladda din varukorg. Försök igen.</p>`;
  }
}

function renderCartList(dbVariants, storageCart) {
  const container = document.getElementById('cart-items-container');
  let runningSubtotal = 0;

  container.innerHTML = storageCart.map(item => {
    const variantData = dbVariants.find(v => v.id === item.variantId);
    if (!variantData) return ''; 

    const basePrice = variantData.price || 0;
    const maxStock = parseInt(variantData.stock) || 0;
    const parentProduct = variantData.products;
    const percentage = variantData.campaigns?.discount_percentage ?? parentProduct?.campaigns?.discount_percentage;
    
    let finalUnitPrice = basePrice;
    if (percentage && percentage > 0) {
      finalUnitPrice = Math.round(basePrice - (basePrice * (percentage / 100)));
    }

    // Justera om antalet i varukorgen råkar vara högre än lagersaldot
    if (item.quantity > maxStock) {
      item.quantity = maxStock;
      let cart = getCart();
      let localItem = cart.find(i => i.variantId === item.variantId);
      if (localItem) { localItem.quantity = maxStock; saveCart(cart); }
    }

    const lineTotal = finalUnitPrice * item.quantity;
    runningSubtotal += lineTotal;

    // Här är den rena HTML-strukturen utan inline-styles:
    return `
      <div class="cart-item-row" data-variant-id="${item.variantId}">
        <img class="cart-item-img" src="${variantData.image_url || '/images/placeholder.png'}" alt="${parentProduct?.title || ''}">
        
        <div class="cart-item-info">
          <h4 class="cart-item-title"><strong>${parentProduct?.brand || 'NS'}</strong> ${parentProduct?.title || ''}</h4>
          <span class="cart-item-variant">Variant: ${variantData.variant_name || 'Standard'}</span>
          <span class="cart-item-stock">Enhetspris: ${finalUnitPrice} kr <small class="stock-warning">(${maxStock} kvar i lager)</small></span>
        </div>

        <div class="quantity-selector">
          <button type="button" class="qty-btn minus"
            onclick="adjustCartQtyInline('${item.variantId}', -1, ${maxStock})">−</button>
          
          <input type="text" class="qty-input" value="${item.quantity}" readonly>
          
          <button type="button" class="qty-btn plus"
            onclick="adjustCartQtyInline('${item.variantId}', 1, ${maxStock})">+</button>
        </div>

        <div class="cart-item-total-price">
          ${lineTotal} kr
        </div>

        <button class="remove-cart-item" onclick="removeCartItemDirect('${item.variantId}')">
          <i class="fa fa-trash-o"></i>
        </button>
      </div>
    `;
  }).join('');

  updateSummaryTotals(runningSubtotal);
}

function adjustCartQtyInline(variantId, change, maxStock) {
  let cart = getCart();
  const target = cart.find(item => item.variantId === variantId);
  
  if (target) {
    const newQty = target.quantity + change;
    
    if (newQty < 1) return; 
    if (newQty > maxStock) {
      alert(`Det finns tyvärr inte fler varor i lager än ${maxStock} st.`);
      return;
    }
    
    target.quantity = newQty;
    saveCart(cart);
  }
}

function removeCartItemDirect(variantId) {
  let cart = getCart();
  cart = cart.filter(item => item.variantId !== variantId);
  saveCart(cart);
}

function updateSummaryTotals(subtotal) {
  const subtotalEl = document.getElementById('summary-subtotal');
  const shippingEl = document.getElementById('summary-shipping');
  const totalEl = document.getElementById('summary-total');
  const trackerEl = document.getElementById('shipping-tracker-banner');
  const checkoutBtn = document.querySelector('.checkout-proceed-btn'); 

  if (!subtotalEl || !totalEl) return;

  // Göm Swish-knappen direkt om varukorgen blir helt tom live
  if (subtotal === 0) {
    if (checkoutBtn) checkoutBtn.style.display = 'none';
  }

  let shippingCost = 61; 
  const threshold = 399;

  subtotalEl.textContent = `${subtotal} kr`;

  if (subtotal >= threshold || subtotal === 0) {
    shippingCost = 0;
    if (shippingEl) shippingEl.textContent = 'Gratis';
    if (trackerEl && subtotal > 0) {
      trackerEl.style.borderLeftColor = '#4caf50';
      trackerEl.innerHTML = `<strong>Grattis!</strong> Din order är över 399 kr. Du har kvalificerat dig för <strong>fri frakt</strong>!`;
    }
  } else {
    if (shippingEl) shippingEl.textContent = `${shippingCost} kr`;
    if (trackerEl) {
      const remaining = threshold - subtotal;
      trackerEl.style.borderLeftColor = '#ffcc00';
      trackerEl.innerHTML = `Handla för <strong>${remaining} kr</strong> till för att få <strong>fri frakt</strong>!`;
    }
  }

  if (subtotal === 0 && trackerEl) {
    trackerEl.style.borderLeftColor = '#000';
    trackerEl.innerHTML = `Lägg till produkter i varukorgen för att se din fraktstatus.`;
  }

  totalEl.textContent = `${subtotal + shippingCost} kr`;
}

// Eventlisteners för att hålla allt synkat live
window.addEventListener('cartUpdated', initCartPage);
document.addEventListener('DOMContentLoaded', initCartPage);