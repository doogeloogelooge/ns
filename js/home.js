// --- HOMEPAGE DYNAMIC CONTROLLER ---

let allLoadedProducts = [];

// Optional: Fill these with your top-level category UUIDs from Supabase later.
// If left blank or unmatched, the code automatically falls back to clean slug string matching!
const CATEGORY_MAP = {
  'spinnfiske': 'REPLACE_WITH_YOUR_SPINNFISKE_CATEGORY_UUID',
  'flugfiske': 'REPLACE_WITH_YOUR_FLUGFISKE_CATEGORY_UUID',
  'marinelektronik': 'REPLACE_WITH_YOUR_MARINELEKTRONIK_CATEGORY_UUID'
};

async function initHomepage() {
  const grid = document.getElementById('home-new-in-stock-grid');
  if (!grid) return;

  try {
    const { data: products, error } = await supabaseClient
      .from('products')
      .select(`
        *,
        categories(id, name, slug, parent_id), 
        campaigns(id, name, discount_percentage),
        product_variants(
          id,
          price,
          image_url,
          campaigns(id, name, discount_percentage)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    allLoadedProducts = products || [];
    
    // Render initial view and initialize tab event listeners
    renderHomeCategory('spinnfiske');
    setupTabListeners();

  } catch (err) {
    console.error('Error fetching homepage items:', err);
    grid.innerHTML = `<p>Kunde inte ladda produkter just nu.</p>`;
  }
}

function setupTabListeners() {
  const tabs = document.querySelectorAll('.tabs-container .tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      tabs.forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      
      const targetCategory = e.target.getAttribute('data-target');
      renderHomeCategory(targetCategory);
    });
  });
}

// Pricing calculation utilities matching store logic core mechanics
function calculateVariantPrice(product, variant) {
  const basePrice = variant?.price || 0;
  const percentage = variant?.campaigns?.discount_percentage ?? product?.campaigns?.discount_percentage;
  
  if (percentage && percentage > 0) {
    const discountAmount = basePrice * (percentage / 100);
    return { isOnSale: true, originalPrice: basePrice, currentPrice: Math.round(basePrice - discountAmount) };
  }
  return { isOnSale: false, originalPrice: basePrice, currentPrice: basePrice };
}

function getCheapestPriceDetails(product) {
  const variants = product.product_variants;
  if (!variants || variants.length === 0) return { isOnSale: false, originalPrice: 0, currentPrice: 0 };
  const calculatedPrices = variants.map(v => calculateVariantPrice(product, v));
  return calculatedPrices.reduce((cheapest, current) => current.currentPrice < cheapest.currentPrice ? current : cheapest, calculatedPrices[0]);
}

function renderHomeCategory(categoryTag) {
  const grid = document.getElementById('home-new-in-stock-grid');
  if (!grid) return;

  const targetId = CATEGORY_MAP[categoryTag];

  const filtered = allLoadedProducts.filter(product => {
    if (!product.categories) return false;

    const itemParentId = product.categories.parent_id;
    const itemCategoryId = product.categories.id;
    const categorySlug = (product.categories.slug || '').toLowerCase();
    const categoryName = (product.categories.name || '').toLowerCase();

    // 1. Direct UUID match
    if (targetId && (itemParentId === targetId || itemCategoryId === targetId)) {
      return true;
    }

    // 2. Strict text fallback mapping based on common search/category terms
    if (categoryTag === 'spinnfiske') {
      const spinnKeywords = ['stingers', 'tafsar', 'jiggskallar', 'krokar', 'smaplock', 'gear', 'spin', 'spinnfiske'];
      return spinnKeywords.some(word => categorySlug.includes(word) || categoryName.includes(word));
    } 
    
    if (categoryTag === 'flugfiske') {
      return categorySlug.includes('fly') || categorySlug.includes('flug') || categoryName.includes('flugfiske');
    } 
    
    if (categoryTag === 'marinelektronik') {
      return categorySlug.includes('elektronik') || categorySlug.includes('vagar') || categorySlug.includes('scale') || categoryName.includes('marine');
    }

    return false;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<p style="padding: 20px; color:#666; grid-column: 1/-1;">Inga nya produkter tillgängliga i denna kategori just nu.</p>`;
    return;
  }

  // Fetch current wishlist array states safely
  const wishlist = typeof getWishlist === 'function' ? getWishlist() : [];

  grid.innerHTML = filtered.map(product => {
    const priceDetails = getCheapestPriceDetails(product);
    const firstVariant = product.product_variants?.[0]; 
    const campaignName = firstVariant?.campaigns?.name || product.campaigns?.name || '';
    const percentage = firstVariant?.campaigns?.discount_percentage ?? product.campaigns?.discount_percentage;
    
    // Dynamic price string compilation matching sale conditions
    const priceHTML = priceDetails.isOnSale 
      ? `<span style="text-decoration: line-through; color: #888; font-size: 0.9rem; margin-right: 5px;">${priceDetails.originalPrice} kr</span>
         <span style="color: #e53935; font-weight: bold;">fr. ${priceDetails.currentPrice} kr</span>`
      : `fr. ${priceDetails.originalPrice} kr`;

    // Campaign badge rendering conditions block
    const badgeHTML = (priceDetails.isOnSale && campaignName) 
      ? `<div class="product-badge-row" style="position: absolute; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 4px; z-index: 5; align-items: flex-start;">
           <span class="badge-campaign-name" style="background: #e53935; color: white; padding: 2px 8px; font-size: 0.75rem; font-weight: bold; border-radius: 4px; text-transform: uppercase;">${campaignName}</span>
           <span class="badge-percentage" style="background: #000; color: white; padding: 2px 6px; font-size: 0.7rem; font-weight: bold; width: max-content; border-radius: 4px;">-${percentage}%</span>
         </div>`
      : '';

    const isLiked = wishlist.includes(product.slug);
    const heartIconSrc = isLiked ? '/images/heart-filled.png' : '/images/heart.png';
    const activeClass = isLiked ? 'active-heart' : '';

    return `
      <div class="product-card">
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
            <h3 class="product-title"><strong>${product.brand || 'NS'}</strong> ${product.title || ''}</h3>
          </a>
          <p class="product-price red-text">${priceHTML}</p>
        </div>
      </div>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  const swedenPopup = document.getElementById('sweden-only-popup');
  
  // 1. Kolla om de redan har bekräftat att de bor/handlar i Sverige
  const isSwedenResident = localStorage.getItem('sweden_resident_confirmed');

  if (!isSwedenResident) {
      // 2. Kolla upp besökarens land via IP-API
      try {
          const response = await fetch('https://ipapi.co/json/');
          const geoData = await response.json();
          
          // Om landskoden INTE är "SE" (Sverige), visa popupen
          if (geoData.country_code == 'SE') {
              swedenPopup.classList.remove('hidden');
          }
      } catch (error) {
          console.log("Kunde inte verifiera land via IP, blockerar ej:", error);
      }
  }
});

// Funktion som körs när man klickar sig vidare
function confirmSwedenResident() {
  // Spara i localStorage så de slipper se rutan på nästa sida eller vid reload
  localStorage.setItem('sweden_resident_confirmed', 'true');
  
  // Göm popupen
  const swedenPopup = document.getElementById('sweden-only-popup');
  swedenPopup.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', initHomepage);