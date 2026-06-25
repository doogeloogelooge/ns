// Ensure Supabase is available globally before creating the client instance
const supabaseClient = supabase.createClient(
  'https://oqhkidahpkhrhayxgeum.supabase.co',
  'sb_publishable_X99T3SQDpC5WT3Df8K8V_Q_2zDICoRx'
);

// Global operational state
let fetchedProducts = [];
let activeSortFilter = 'default';
let activeCampaignFilter = 'all';

async function resolveCategory(slugs) {
  let parentId = null;
  let currentCategory = null;

  for (const slug of slugs) {
    let query = supabaseClient
      .from('categories')
      .select('*')
      .eq('slug', slug);

    if (parentId) {
      query = query.eq('parent_id', parentId);
    } else {
      query = query.is('parent_id', null);
    }

    const { data, error } = await query.maybeSingle();

    if (error || !data) {
      console.error('Category not found for slug:', slug);
      return null;
    }

    currentCategory = data;
    parentId = data.id;
  }

  return currentCategory;
}

async function getCategoryPath(category) {
  const path = [category];
  let current = category;

  while (current.parent_id) {
    const { data, error } = await supabaseClient
      .from('categories')
      .select('*')
      .eq('id', current.parent_id)
      .maybeSingle();

    if (error || !data) {
      break;
    }

    path.unshift(data);
    current = data;
  }

  return path;
}

async function loadProducts(categoryId) {
  const categoryIds = await getAllChildCategoryIds(categoryId);

  try {
    const { data, error } = await supabaseClient
      .from('products')
      .select(`
        *,
        campaigns ( id, name, discount_percentage ), 
        product_variants (
          id,
          price,
          image_url,
          campaign_id,
          campaigns ( id, name, discount_percentage )
        )
      `)
      .in('category_id', categoryIds);

    if (error) throw error;
    return data || [];
  } catch (dbError) {
    console.warn("⚠️ Database query falling back to basic layout mode. Check campaigns table:", dbError.message);
    
    const { data } = await supabaseClient
      .from('products')
      .select(`*, product_variants(*)`)
      .in('category_id', categoryIds);
      
    return data || [];
  }
}

// 🌟 FIX: Hardened price calculator that properly references joined campaign tables
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

// Scans ALL variants of a product to find the absolute cheapest option
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

function applyFiltersAndSort() {
  let displayedProducts = [...fetchedProducts];

  // --- A. CAMPAIGN FILTER ---
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

  // --- B. SORTING (USING CHEAPEST VARIANT) ---
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

  // --- C. COUNTER UPDATE ---
  const counterSpan = document.getElementById('product-counter');
  if (counterSpan) {
    counterSpan.textContent = `${displayedProducts.length} ${displayedProducts.length === 1 ? 'Produkt' : 'Produkter'}`;
  }

  renderProducts(displayedProducts);
}

function renderLoadingCards() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  
  grid.innerHTML = Array(12).fill(`
    <div class="product-card1 skeleton-card">
      <div class="image-wrapper">
        <div class="skeleton-img"></div>
        <button class="wishlist-btn"><img src="/images/heart.png" alt=""></button>
      </div>
      <div class="product-info">
        <div class="skeleton-title"></div>
        <div class="skeleton-title short"></div>
        <div class="skeleton-price"></div>
      </div>
    </div>
  `).join('');
}

function renderProducts(products) {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  if (!products || !products.length) {
    grid.innerHTML = `<p style="grid-column: 1/-1; padding: 20px 0;">Inga produkter matchar dina filterval.</p>`;
    return;
  }

  grid.innerHTML = products.map(product => {
    const priceDetails = getCheapestPriceDetails(product);
    const firstVariant = product.product_variants?.[0]; 
    
    // Find active campaign name if it exists on variant or product
    const campaignName = firstVariant?.campaigns?.name || product.campaigns?.name || '';
    // Find active campaign percentage
    const percentage = firstVariant?.campaigns?.discount_percentage ?? product.campaigns?.discount_percentage;
    
    const priceHTML = priceDetails.isOnSale 
      ? `<span style="text-decoration: line-through; color: #888; font-size: 0.9rem; margin-right: 5px;">${priceDetails.originalPrice} kr</span>
         <span style="color: #e53935; font-weight: bold;">fr. ${priceDetails.currentPrice} kr</span>`
      : `fr. ${priceDetails.originalPrice} kr`;

    // Generate badge markup conditionally if product is on sale
    const badgeHTML = (priceDetails.isOnSale && campaignName) 
      ? `<div class="product-badge-row">
           <span class="badge-campaign-name">${campaignName}</span>
           <span class="badge-percentage">-${percentage}%</span>
         </div>`
      : '';

    const wishlist = getWishlist(); // Pull current list

    const isLiked = wishlist.includes(product.slug);
    const heartIconSrc = isLiked ? '/images/heart-filled.png' : '/images/heart.png';
    const activeClass = isLiked ? 'active-heart' : '';

    return `
      <div class="product-card1">
        <div class="image-wrapper">
          <a href="/product.html?slug=${product.slug}">
            <img src="${firstVariant?.image_url || ''}" alt="${product.title || ''}">
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
          <p class="product-price red-text">
            ${priceHTML}
          </p>
        </div>
      </div>
    `;
  }).join('');
}

function renderBreadcrumbs(categories) {
  const breadcrumbs = document.getElementById('breadcrumbs');
  if (!breadcrumbs) return;

  breadcrumbs.innerHTML = categories.map((category, index) => {
    const isActive = index === categories.length - 1;
    const url = '/' + categories.slice(0, index + 1).map(c => c.slug).join('/');
    return `<a href="${url}" class="${isActive ? 'active' : ''}">${category.name}</a>`;
  }).join(' / ');
}

async function getAllChildCategoryIds(categoryId) {
  const { data: allCategories, error } = await supabaseClient
    .from('categories')
    .select('id, parent_id');

  if (error) {
    console.error(error);
    return [categoryId];
  }

  const ids = [];
  function collectIds(currentId) {
    ids.push(currentId);
    const children = allCategories.filter(c => c.parent_id === currentId);
    for (const child of children) {
      collectIds(child.id);
    }
  }

  collectIds(categoryId);
  return ids;
}

function renderSidebar(currentCategory, allCategories, currentSlugs) {
  const sidebarContainer = document.getElementById('category-sidebar');
  const mobileContainer = document.getElementById('mobile-subcategory-container'); // Ny behållare för mobil placering
  
  // Hitta underkategorier
  const subCategories = allCategories.filter(cat => cat.parent_id === currentCategory.id);

  if (subCategories.length === 0) {
    if (sidebarContainer) sidebarContainer.innerHTML = '';
    if (mobileContainer) mobileContainer.innerHTML = '';
    return;
  }

  // 1. Desktop-vyn (Visas bara på desktop via CSS)
  if (sidebarContainer) {
    let desktopHtml = `<div class="desktop-subcategories"><h3>Underkategorier</h3><ul>`;
    subCategories.forEach(sub => {
      const url = `/${currentSlugs.join('/')}/${sub.slug}`;
      desktopHtml += `<li><a href="${url}">${sub.name}</a></li>`;
    });
    desktopHtml += `</ul></div>`;
    sidebarContainer.innerHTML = desktopHtml;
  }

  // 2. Mobil-vyn (Kompakt dropdown som placeras under beskrivningen)
  if (mobileContainer) {
    let mobileHtml = `
      <div class="mobile-subcategories-dropdown">
        <select id="subcategory-select" onchange="window.location.href=this.value;">
          <option value="" disabled selected>Välj underkategori...</option>
    `;
    
    subCategories.forEach(sub => {
      const url = `/${currentSlugs.join('/')}/${sub.slug}`;
      mobileHtml += `<option value="${url}">${sub.name}</option>`;
    });
    
    mobileHtml += `
        </select>
      </div>
    `;
    mobileContainer.innerHTML = mobileHtml;
  }
}

// 🌟 FIX: Dynamic Campaign Dropdown Renderer from Supabase
async function loadAndRenderCampaignDropdown() {
  const menuPanel = document.getElementById('campaign-menu-panel');
  if (!menuPanel) return;

  try {
    const { data: campaigns, error } = await supabaseClient
      .from('campaigns')
      .select('name');

    if (error) throw error;

    // Keep the "Visa alla" option at the top
    let panelHTML = `<button type="button" class="campaign-pill active-pill" data-campaign="all">Visa alla</button>`;

    if (campaigns && campaigns.length > 0) {
      panelHTML += campaigns.map(camp => `
        <button type="button" class="campaign-pill" data-campaign="${camp.name}">${camp.name}</button>
      `).join('');
    }

    menuPanel.innerHTML = panelHTML;
  } catch (err) {
    console.error('Error loading campaigns table:', err.message);
  }
}

function setupFilterListeners() {
  const sortWrapper = document.getElementById('sort-dropdown-wrapper');
  const sortToggle = document.getElementById('sort-dropdown-toggle');
  const sortPills = document.querySelectorAll('.sort-pill');

  const campaignWrapper = document.getElementById('campaign-dropdown-wrapper');
  const campaignToggle = document.getElementById('campaign-dropdown-toggle');

  if (sortToggle && sortWrapper) {
    sortToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (campaignWrapper) campaignWrapper.classList.remove('menu-open');
      sortWrapper.classList.toggle('menu-open');
    });
  }

  if (campaignToggle && campaignWrapper) {
    campaignToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sortWrapper) sortWrapper.classList.remove('menu-open');
      campaignWrapper.classList.toggle('menu-open');
    });
  }

  document.addEventListener('click', () => {
    if (sortWrapper) sortWrapper.classList.remove('menu-open');
    if (campaignWrapper) campaignWrapper.classList.remove('menu-open');
  });

  sortPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      sortPills.forEach(p => p.classList.remove('active-pill'));
      
      activeSortFilter = pill.getAttribute('data-sort');
      pill.classList.add('active-pill');
      
      if (sortToggle) sortToggle.innerHTML = `${pill.textContent} <i class="fa fa-chevron-down"></i>`;
      if (sortWrapper) sortWrapper.classList.remove('menu-open');
      applyFiltersAndSort();
    });
  });

  // Delegate click listeners to the dynamically rendered campaign pills
  if (campaignWrapper) {
    campaignWrapper.addEventListener('click', (e) => {
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
    });
  }
}

async function loadCategoryPage() {
  renderLoadingCards();

  // Populate dynamic campaigns from table structure first
  await loadAndRenderCampaignDropdown();

  const slugs = window.location.pathname.split('/').filter(Boolean);
  const category = await resolveCategory(slugs);

  if (!category) {
    console.error('Category not found processing URL mapping.');
    const grid = document.getElementById('products-grid');
    if (grid) grid.innerHTML = '<p>Kategorin hittades inte.</p>';
    return;
  }

  // --- DESCRIPTION & HEADER SETTINGS ---
  const titleEl = document.getElementById('category-title');
  if (titleEl) titleEl.textContent = category.name;
  
  const descEl = document.getElementById('category-description');
  const toggleBtn = document.getElementById('toggle-desc-btn');

  if (descEl && category.description) {
    descEl.textContent = category.description;

    // Wait a brief frame to measure layout rendering heights accurately
    requestAnimationFrame(() => {
      const lineHeight = parseFloat(window.getComputedStyle(descEl).lineHeight);
      const fullHeight = descEl.scrollHeight;

      // If text height is greater than roughly 3 lines of content
      if (fullHeight > lineHeight * 3.2) {
        descEl.classList.add('truncated');
        if (toggleBtn) {
          toggleBtn.style.display = 'inline-flex';
          
          // Click handler to toggle open/close states
          toggleBtn.onclick = () => {
            const isTruncated = descEl.classList.toggle('truncated');
            if (isTruncated) {
              toggleBtn.innerHTML = 'Visa mer <i class="fa fa-chevron-down"></i>';
              descEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
              toggleBtn.innerHTML = 'Visa mindre <i class="fa fa-chevron-up"></i>';
            }
          };
        }
      } else {
        if (toggleBtn) toggleBtn.style.display = 'none';
      }
    });
  }

  // --- 🔥 THE MISSING PIECES THAT TURN ON YOUR PRODUCTS GRID: ---
  const { data: allCategories, error: catError } = await supabaseClient
    .from('categories')
    .select('id, name, slug, parent_id');

  if (!catError && allCategories) {
    renderSidebar(category, allCategories, slugs);
  }

  const categoryPath = await getCategoryPath(category);
  renderBreadcrumbs(categoryPath);

  // Download all valid items mapped to this category view container
  fetchedProducts = await loadProducts(category.id);

  setupFilterListeners();
  applyFiltersAndSort();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadCategoryPage);
} else {
  loadCategoryPage();
}