async function loadProductPage() {
  const scopeWrapper = document.querySelector('.product-page-scope');
  
  // 1. Immediately turn on the skeletons
  if (scopeWrapper) {
    scopeWrapper.classList.add('loading');
  }

  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');

  if (!slug) {
    console.error("No product slug found in URL parameters.");
    return;
  }

  try {
    // 2. Fetch primary product data WITH campaigns relation joined 🌟
    const { data: product, error: productError } = await supabaseClient
      .from('products')
      .select(`
          *,
          campaigns ( id, name, discount_percentage ),
          categories (
            id,
            name,
            slug,
            parent_id
          )
      `)
      .eq('slug', slug)
      .single();

    if (productError || !product) {
      throw new Error(productError?.message || "Product not found");
    }

    // 3. Fetch its associated item variants WITH campaigns relation joined 🌟
    const { data: variants, error: variantError } = await supabaseClient
      .from('product_variants')
      .select(`
        *,
        campaigns ( id, name, discount_percentage )
      `)
      .eq('product_id', product.id);

    if (variantError || !variants || variants.length === 0) {
      throw new Error(variantError?.message || "No variants found for this product");
    }

    // Temporarily attach variants array to the product object so getCheapestVariant utility can read it
    product.product_variants = variants;

    // Automatically find and select the absolute cheapest variant as default on page load 🌟
    const selectedVariant = getCheapestVariant(product) || variants[0];

    // Load sub-addons asynchronously 
    await loadAddons(selectedVariant.id);

    // 4. Update the core DOM nodes with database strings
    document.getElementById('product-brand').textContent = product.brand;
    document.getElementById('product-sku').textContent = selectedVariant.sku;
    document.getElementById('product-title').textContent = `${product.brand} ${product.title}`;
    document.getElementById('product-main-img').src = selectedVariant.image_url || '/images/placeholder.png';
    document.getElementById('product-thumb-img').src = selectedVariant.image_url || '/images/placeholder.png';

    // Inside your product page load function after fetching 'product' data from Supabase:
    const heartImg = document.querySelector('#product-page-wishlist-btn img');
    const wishlist = getWishlist();

    // Set initial visual state on load
    if (wishlist.includes(product.slug)) {
      heartImg.src = '/images/heart-filled.png';
    }

    // Bind click event
    document.getElementById('product-page-wishlist-btn').addEventListener('click', function() {
      toggleWishlist(product.slug, this.querySelector('img'));
    });

    // Build functional breadcrumbs path
    const categoryPath = await getCategoryPath(product.categories);
    document.getElementById('breadcrumbs').innerHTML = categoryPath.map((cat, index) => {
      const url = '/' + categoryPath.slice(0, index + 1).map(c => c.slug).join('/');
      return `<a href="${url}">${cat.name}</a>`;
    }).join(' / ') + ` / <span class="current">${product.title}</span>`;

    // Initialize Select Dropdown options
    const sizeSelect = document.getElementById('size-select');
    sizeSelect.innerHTML = variants.map(variant => {
      // Show the cheapest variant as selected by default 🌟
      const isSelected = variant.id === selectedVariant.id ? 'selected' : '';
      return `
        <option value="${variant.id}" ${isSelected}>
          ${variant.variant_name}
        </option>
      `;
    }).join('');

    // Establish defaults for initial configuration using the dynamic price updater 🌟
    updatePriceDisplay(product, selectedVariant);
    
    // Add the badge for the initial product load right here
    updateProductBadge(product, selectedVariant);

    document.getElementById('stock-count').textContent = selectedVariant.stock;

    // 🔥 FIXED: Check stock balance on initial page load to grey out if needed
    toggleBuyButtonState(selectedVariant);

    // Initialize the shopping cart controls now that the product has completely finished rendering!
    initProductPageCart(product);

    // 5. Track variant modifications & swap image/price instantly
    sizeSelect.addEventListener('change', async event => {
      const selectedVariantId = event.target.value;
      const match = variants.find(v => String(v.id) === String(selectedVariantId));

      if (match) {
        // Update the price dynamically using our sale calculations 🌟
        updatePriceDisplay(product, match);
        
        // Update the badge when a user switches options
        updateProductBadge(product, match);

        document.getElementById('stock-count').textContent = match.stock;
        document.getElementById('product-main-img').src = match.image_url || '/images/placeholder.png';
        document.getElementById('product-thumb-img').src = match.image_url || '/images/placeholder.png';
        document.getElementById('product-sku').textContent = match.sku;

        // 🔥 FIXED: Re-check stock balance every single time the variant selection changes
        toggleBuyButtonState(match);

        await loadAddons(match.id);
      }
    });

  } catch (err) {
    console.error("Initialization Failed:", err);
    const container = document.querySelector('.product-container');
    if (container) {
      container.innerHTML = `<p style="padding: 40px; text-align: center; width: 100%;">Kunde inte ladda produkten. Vänligen försök igen senare.</p>`;
    }
  } finally {
    // 6. Kill off the skeleton style layers whether code succeeds or throws an error
    if (scopeWrapper) {
      scopeWrapper.classList.remove('loading');
    }
  }
}

// 🌟 Renders proper crossed-out original prices if a campaign discount applies
function updatePriceDisplay(product, selectedVariant) {
  const priceDisplay = document.getElementById('price-display');
  if (!priceDisplay) return;

  const priceDetails = calculateVariantPrice(product, selectedVariant);

  if (priceDetails.isOnSale) {
    priceDisplay.innerHTML = `
      <span style="text-decoration: line-through; color: #888; font-size: 1.1rem; margin-right: 10px;">
        ${priceDetails.originalPrice} kr
      </span>
      <span style="color: #e53935; font-weight: bold;">
        ${priceDetails.currentPrice} kr
      </span>
    `;
  } else {
    priceDisplay.textContent = `${priceDetails.originalPrice} kr`;
  }
}

// Calculates the pricing details for a single specific variant
function calculateVariantPrice(product, variant) {
  const basePrice = variant?.price || 0;
  
  // Look for discount percentage on the variant campaign first, then fallback to product campaign
  const percentage = variant?.campaigns?.discount_percentage ?? product?.campaigns?.discount_percentage;
  
  if (percentage && percentage > 0) {
    const discountAmount = basePrice * (percentage / 100);
    return {
      isOnSale: true,
      originalPrice: basePrice,
      currentPrice: Math.round(basePrice - discountAmount)
    };
  }
  
  return {
    isOnSale: false,
    originalPrice: basePrice,
    currentPrice: basePrice
  };
}

// Scans ALL variants to find the entry with the absolute lowest price
function getCheapestVariant(product) {
  const variants = product.product_variants;
  if (!variants || variants.length === 0) return null;

  return variants.reduce((cheapest, current) => {
    const cheapestPrice = calculateVariantPrice(product, cheapest).currentPrice;
    const currentPrice = calculateVariantPrice(product, current).currentPrice;
    return currentPrice < cheapestPrice ? current : cheapest;
  }, variants[0]);
}

async function loadAddons(selectedVariantId) {
  const container = document.getElementById('addons-container');
  if (!container) return;
  container.innerHTML = ''; // Fresh cleanup cycle

  const { data: addonRelations, error: relationError } = await supabaseClient
    .from('variant_addons')
    .select('*')
    .eq('variant_id', selectedVariantId);

  if (relationError) {
    container.innerHTML = `<p>Error loading addons</p>`;
    return;
  }

  if (!addonRelations || addonRelations.length === 0) {
    container.innerHTML = `<p>Inga tillval tillgängliga för denna variant.</p>`;
    return;
  }

  const addonVariantIds = addonRelations.map(r => r.addon_variant_id);

  const { data: addonVariants, error } = await supabaseClient
    .from('product_variants') 
    .select(`
      id,
      price,
      image_url,
      variant_name,
      products (
        brand,
        title,
        slug
      )
    `)
    .in('id', addonVariantIds);

  if (error) {
    container.innerHTML = `<p>Error loading addon details</p>`;
    return;
  }

  container.innerHTML = addonVariants.map(addon => {
    const slug = addon.products?.slug;
    const productUrl = slug ? `/product.html?slug=${slug}` : '#';
    
    return `
      <div class="addon-card">
        <a href="${productUrl}" class="addon-link" ${!slug ? 'style="pointer-events: none;"' : ''}>
          <img src="${addon.image_url || '/images/placeholder.png'}" class="addon-img" alt="${addon.variant_name}">
        </a>
        <div class="addon-info">
          <a href="${productUrl}" class="addon-link" ${!slug ? 'style="pointer-events: none;"' : ''}>
            <span class="addon-name">${addon.products?.brand || ''} ${addon.products?.title || ''} ${addon.variant_name}</span>
          </a>
          <span class="addon-price">${addon.price} kr</span>
        </div>
        <input type="checkbox" class="addon-checkbox" value="${addon.id}">
      </div>
    `;
  }).join('');
}

async function getCategoryPath(category) {
  if (!category) return [];
  const path = [category];
  let current = category;

  while (current.parent_id) {
    const { data, error } = await supabaseClient
      .from('categories')
      .select('id, name, slug, parent_id')
      .eq('id', current.parent_id)
      .single();

    if (error || !data) break;

    path.unshift(data);
    current = data;
  }

  return path;
}

function updateProductBadge(product, selectedVariant) {
  const container = document.querySelector('.main-image-wrapper');
  if (!container) return;

  const oldBadge = container.querySelector('.product-badge-row');
  if (oldBadge) oldBadge.remove();

  const priceDetails = calculateVariantPrice(product, selectedVariant);
  const campaignName = selectedVariant?.campaigns?.name || product.campaigns?.name || '';
  const percentage = selectedVariant?.campaigns?.discount_percentage ?? product.campaigns?.discount_percentage;

  if (priceDetails.isOnSale && campaignName) {
    const badgeElement = document.createElement('div');
    badgeElement.className = 'product-badge-row';
    badgeElement.innerHTML = `
      <span class="badge-campaign-name">${campaignName}</span>
      <span class="badge-percentage">-${percentage}%</span>
    `;
    container.appendChild(badgeElement);
  }
}

// 🔥 NEW: Dynamic Button State Toggle Engine
function toggleBuyButtonState(variant) {
  const buyBtn = document.getElementById('dynamic-buy-btn');
  if (!buyBtn) return;

  const stock = parseInt(variant?.stock) || 0;

  if (stock <= 0) {
    buyBtn.disabled = true;
    buyBtn.style.backgroundColor = '#ccc';
    buyBtn.style.color = '#666';
    buyBtn.style.cursor = 'not-allowed';
    buyBtn.innerHTML = '<i class="fa fa-times"></i> Slutsåld';
  } else {
    buyBtn.disabled = false;
    buyBtn.style.backgroundColor = ''; // Restores standard CSS styling rules
    buyBtn.style.color = '';
    buyBtn.style.cursor = '';
    buyBtn.innerHTML = '<i class="fa fa-cart-plus"></i> Köp nu!';
  }
}

// --- PRODUCT PAGE CART ATTACHMENT CONTROLLER ---

function initProductPageCart(currentProductData) {
  const buyBtn = document.getElementById('dynamic-buy-btn');
  const variantDropdown = document.getElementById('size-select');
  const qtyInput = document.querySelector('.qty-input');
  
  if (!buyBtn || !variantDropdown) return;

  // Clone button to sweep away old event listeners cleanly
  const newBuyBtn = buyBtn.cloneNode(true);
  buyBtn.parentNode.replaceChild(newBuyBtn, buyBtn);

  // Helper to get maximum available stock right now for the active choice
  function getAvailableStock() {
    const selectedVariantId = variantDropdown.value;
    const match = currentProductData.product_variants.find(v => String(v.id) === String(selectedVariantId));
    return match ? (parseInt(match.stock) || 0) : 0;
  }

  // Enforce stock ceilings immediately if a user manual types numbers
  if (qtyInput) {
    qtyInput.addEventListener('input', () => {
      const maxStock = getAvailableStock();
      let val = parseInt(qtyInput.value) || 1;
      if (val < 1) qtyInput.value = 1;
      if (val > maxStock && maxStock > 0) {
        qtyInput.value = maxStock;
        alert(`Tyvärr, vi har bara ${maxStock} stycken av denna variant i lager.`);
      }
    });
  }

  // 1. Hook primary buy button click event
  newBuyBtn.addEventListener('click', () => {
    if (newBuyBtn.disabled) return;

    const selectedVariantId = variantDropdown.value;
    const quantity = qtyInput ? parseInt(qtyInput.value) : 1;
    const maxStock = getAvailableStock();

    if (!selectedVariantId) {
      alert('Vänligen välj en variant innan du lägger till i varukorgen.');
      return;
    }

    if (quantity > maxStock) {
      alert(`Du kan inte köpa mer än tillgängligt lager (${maxStock} st).`);
      return;
    }

    // 🌟 HÄR ÄR FIXEN: Hämta namnet och den valda variantens text för din webhook
    const productName = currentProductData.title || "Produkt";
    
    // Hitta variant-objektet som matchar det valda id:t i dropdownen för att få dess namn (t.ex. "UV")
    const activeVariant = currentProductData.product_variants.find(v => String(v.id) === String(selectedVariantId));
    const variantName = activeVariant ? activeVariant.variant_name : "";

    // 2. Dispatch data payload straight to your global localStorage engine variables
    if (typeof addToCart === 'function') {
      // 🔥 Skicka med de 2 nya parametrarna (productName, variantName) till din uppdaterade addToCart!
      addToCart(selectedVariantId, currentProductData.slug, quantity, productName, variantName);
      
      // 3. Provide visual button confirmation states
      const originalHTML = newBuyBtn.innerHTML;
      newBuyBtn.style.backgroundColor = '#4caf50'; 
      newBuyBtn.innerHTML = '<i class="fa fa-check"></i> Tillagd!';
      
      setTimeout(() => {
        if (getAvailableStock() > 0) {
          newBuyBtn.style.backgroundColor = ''; 
          newBuyBtn.innerHTML = originalHTML;
        } else {
          const match = currentProductData.product_variants.find(v => String(v.id) === String(selectedVariantId));
          toggleBuyButtonState(match);
        }
      }, 2000);
    }
  });

  // 4. Hook internal quantity increment controls with stock guards
  const minusBtn = document.querySelector('.qty-btn.minus');
  const plusBtn = document.querySelector('.qty-btn.plus');

  if (minusBtn && qtyInput) {
    minusBtn.onclick = () => {
      let currentVal = parseInt(qtyInput.value) || 1;
      if (currentVal > 1) qtyInput.value = currentVal - 1;
    };
  }

  if (plusBtn && qtyInput) {
    plusBtn.onclick = () => {
      let currentVal = parseInt(qtyInput.value) || 1;
      const maxStock = getAvailableStock();
      if (currentVal < maxStock) {
        qtyInput.value = currentVal + 1;
      } else {
        if (maxStock > 0) alert(`Högsta lagersaldo uppnått (${maxStock} st).`);
      }
    };
  }
}

// Fire execution loop when markup structure is ready
document.addEventListener('DOMContentLoaded', loadProductPage);