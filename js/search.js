// Ensure Supabase is initialized before client call 
// Global operational state for filtering and sorting
let fetchedProducts = [];
let activeSortFilter = 'default';
let activeCampaignFilter = 'all';

// --- PRICE UTILITIES (Sourced directly from your system rules) ---
function calculateVariantPrice(product, variant) {
  const basePrice = variant?.price || 0;
  const percentage = variant?.campaigns?.discount_percentage ?? product?.campaigns?.discount_percentage;
  
  if (percentage && percentage > 0) {
    const discountAmount = basePrice * (percentage / 100);
    return {
      isOnSale: true,
      originalPrice: basePrice,
      currentPrice: Math.round(basePrice - discountAmount)
    };
  }
  return { isOnSale: false, originalPrice: basePrice, currentPrice: basePrice };
}

function getCheapestPriceDetails(product) {
  const variants = product.product_variants;
  if (!variants || variants.length === 0) {
    return { isOnSale: false, originalPrice: 0, currentPrice: 0 };
  }
  const calculatedPrices = variants.map(v => calculateVariantPrice(product, v));
  return calculatedPrices.reduce((cheapest, current) => {
    return current.currentPrice < cheapest.currentPrice ? current : cheapest;
  }, calculatedPrices[0]);
}

// --- DROPDOWN EVENT LISTENERS ---
function setupFilterListeners() {
  const sortWrapper = document.getElementById('sort-dropdown-wrapper');
  const sortToggle = document.getElementById('sort-dropdown-toggle');
  const sortPills = document.querySelectorAll('.sort-pill');

  const campaignWrapper = document.getElementById('campaign-dropdown-wrapper');
  const campaignToggle = document.getElementById('campaign-dropdown-toggle');

  if (sortToggle && sortWrapper) {
    sortToggle.onclick = (e) => {
      e.stopPropagation();
      if (campaignWrapper) campaignWrapper.classList.remove('menu-open');
      sortWrapper.classList.toggle('menu-open');
    };
  }

  if (campaignToggle && campaignWrapper) {
    campaignToggle.onclick = (e) => {
      e.stopPropagation();
      if (sortWrapper) sortWrapper.classList.remove('menu-open');
      campaignWrapper.classList.toggle('menu-open');
    };
  }

  document.addEventListener('click', () => {
    if (sortWrapper) sortWrapper.classList.remove('menu-open');
    if (campaignWrapper) campaignWrapper.classList.remove('menu-open');
  });

  sortPills.forEach(pill => {
    pill.onclick = (e) => {
      e.stopPropagation();
      sortPills.forEach(p => p.classList.remove('active-pill'));
      
      activeSortFilter = pill.getAttribute('data-sort');
      pill.classList.add('active-pill');
      
      if (sortToggle) sortToggle.innerHTML = `${pill.textContent} <i class="fa fa-chevron-down"></i>`;
      if (sortWrapper) sortWrapper.classList.remove('menu-open');
      applyFiltersAndSort();
    };
  });

  if (campaignWrapper) {
    campaignWrapper.onclick = (e) => {
      const pill = e.target.closest('.campaign-pill');
      if (!pill) return;

      e.stopPropagation();
      const campaignPills = campaignWrapper.querySelectorAll('.campaign-pill');
      campaignPills.forEach(p => p.classList.remove('active-pill'));
      
      activeCampaignFilter = pill.getAttribute('data-campaign');
      pill.classList.add('active-pill');
      
      if (campaignToggle) {
        const labelText = activeCampaignFilter === 'all' ? 'Kampanjer' : pill.textContent;
        campaignToggle.innerHTML = `${labelText} <i class="fa fa-chevron-down"></i>`;
      }
      campaignWrapper.classList.remove('menu-open');
      applyFiltersAndSort();
    };
  }
}

async function loadAndRenderCampaignDropdown() {
  const menuPanel = document.getElementById('campaign-menu-panel');
  if (!menuPanel) return;

  try {
    const { data: campaigns, error } = await supabaseClient.from('campaigns').select('name');
    if (error) throw error;

    let panelHTML = `<button type="button" class="campaign-pill active-pill" data-campaign="all">Visa alla</button>`;
    if (campaigns && campaigns.length > 0) {
      panelHTML += campaigns.map(camp => `
        <button type="button" class="campaign-pill" data-campaign="${camp.name}">${camp.name}</button>
      `).join('');
    }
    menuPanel.innerHTML = panelHTML;
  } catch (err) {
    console.error('Fel vid laddning av kampanjer:', err.message);
  }
}

// --- FILTER & SORT RUNNER ---
function applyFiltersAndSort() {
  let displayedProducts = [...fetchedProducts];

  // A. Campaign Filter
  if (activeCampaignFilter !== 'all') {
    displayedProducts = displayedProducts.filter(product => {
      const prodCampName = product.campaigns?.name || '';
      if (prodCampName === activeCampaignFilter) return true;

      return product.product_variants?.some(variant => {
        const variantCampName = variant.campaigns?.name || '';
        return variantCampName === activeCampaignFilter;
      });
    });
  }

  // B. Sorting
  displayedProducts.sort((a, b) => {
    const priceA = getCheapestPriceDetails(a).currentPrice;
    const priceB = getCheapestPriceDetails(b).currentPrice;
    const titleA = (a.title || "").toLowerCase();
    const titleB = (b.title || "").toLowerCase();

    if (activeSortFilter === 'price-asc') return priceA - priceB;
    if (activeSortFilter === 'price-desc') return priceB - priceA;
    if (activeSortFilter === 'title-asc') return titleA.localeCompare(titleB);
    return 0; 
  });

  // C. Counter update
  const counterSpan = document.getElementById('product-counter');
  if (counterSpan) {
    counterSpan.textContent = `${displayedProducts.length} ${displayedProducts.length === 1 ? 'Produkt' : 'Produkter'}`;
  }

  renderProducts(displayedProducts);
}

// --- PRESENTATION RENDERING ---
function renderProducts(products) {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  if (!products || !products.length) {
    grid.innerHTML = `<p style="grid-column: 1/-1; padding: 20px 0;">Inga produkter matchar dina filterval.</p>`;
    return;
  }

  const wishlist = JSON.parse(localStorage.getItem('ns_wishlist')) || [];

  grid.innerHTML = products.map(product => {
    const priceDetails = getCheapestPriceDetails(product);
    const firstVariant = product.product_variants?.[0]; 
    const campaignName = firstVariant?.campaigns?.name || product.campaigns?.name || '';
    const percentage = firstVariant?.campaigns?.discount_percentage ?? product.campaigns?.discount_percentage;
    
    const priceHTML = priceDetails.isOnSale 
      ? `<span style="text-decoration: line-through; color: #888; font-size: 0.9rem; margin-right: 5px;">${priceDetails.originalPrice} kr</span>
         <span style="color: #e53935; font-weight: bold;">fr. ${priceDetails.currentPrice} kr</span>`
      : `fr. ${priceDetails.originalPrice} kr`;

    const badgeHTML = (priceDetails.isOnSale && campaignName) 
      ? `<div class="product-badge-row">
           <span class="badge-campaign-name">${campaignName}</span>
           <span class="badge-percentage">-${percentage}%</span>
         </div>`
      : '';

    const isLiked = wishlist.includes(product.slug);
    const heartIconSrc = isLiked ? '/images/heart-filled.png' : '/images/heart.png';
    const activeClass = isLiked ? 'active-heart' : '';

    return `
      <div class="product-card1">
        <div class="image-wrapper">
          <a href="/product.html?slug=${product.slug}">
            <img src="${firstVariant?.image_url || '/images/placeholder.png'}" alt="${product.title || ''}">
          </a>
          ${badgeHTML}
          
          <button type="button" class="wishlist-btn" onclick="event.stopPropagation(); toggleWishlist('${product.slug}', this.querySelector('img'))">
            <img src="${heartIconSrc}" class="${activeClass}" alt="Wishlist">
          </button>
        </div>
        <div class="product-info">
          <a href="/product.html?slug=${product.slug}">
            <h3 class="product-title">
              <strong>${product.brand || ''}</strong> ${product.title || ''}
            </h3>
          </a>
          <p class="product-price red-text">${priceHTML}</p>
        </div>
      </div>
    `;
  }).join('');
}

// --- CORE Search LOAD INITIALIZATION ---
async function loadSearchResults() {
  const params = new URLSearchParams(window.location.search);
  const query = params.get('q');
  const titleSpan = document.getElementById('search-term-title');
  const grid = document.getElementById('products-grid');

  // Om vi inte har ett sökord, eller om sidan saknar ett produkt-grid, avbryt direkt.
  if (!query || !grid) {
    if (titleSpan && !query) titleSpan.textContent = 'Ingen sökning angiven';
    return;
  }

  if (titleSpan) titleSpan.textContent = `"${query}"`;

  // Render unified framework loading design templates
  grid.innerHTML = Array(4).fill(`
    <div class="product-card1 skeleton-card" style="background: #eee; height: 300px; border-radius:8px;"></div>
  `).join('');

  await loadAndRenderCampaignDropdown();

  try {
    const { data: products, error } = await supabaseClient
      .from('products')
      .select(`
        *,
        campaigns ( id, name, discount_percentage ),
        product_variants (
          id,
          price,
          image_url,
          campaigns ( id, name, discount_percentage )
        )
      `)
      .or(`title.ilike.%${query}%,brand.ilike.%${query}%`);

    if (error) throw error;

    fetchedProducts = products || [];

    setupFilterListeners();
    applyFiltersAndSort();

  } catch (err) {
    console.error('Sökfel:', err);
    grid.innerHTML = `<p>Ett fel uppstod när sökningen kördes. Försök igen.</p>`;
  }
}

document.addEventListener('DOMContentLoaded', loadSearchResults);