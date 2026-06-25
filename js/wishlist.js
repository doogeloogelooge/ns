// Global storage access match rule
function getWishlistSlugs() {
  return JSON.parse(localStorage.getItem('ns_wishlist')) || [];
}

async function loadWishlistPage() {
  const grid = document.getElementById('wishlist-grid');
  if (!grid) return;

  const slugs = getWishlistSlugs();

  if (slugs.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 0;">
        <p style="font-size: 1.1rem; color: #555; margin-bottom: 20px;">Du har inga produkter i din önskelista ännu.</p>
        <a href="/homepage" style="display: inline-block; background: #2b2b2b; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: 500;">Utforska sortimentet</a>
      </div>
    `;
    return;
  }

  // 1. Show layout skeletons while loading items
  grid.innerHTML = Array(slugs.length).fill(`
    <div class="product-card1 skeleton-card" style="background: #eee; height: 300px; border-radius:8px;"></div>
  `).join('');

  try {
    // 2. Load explicitly matched data sets matching saved wishlist records
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
      .in('slug', slugs);

    if (error) throw error;

    if (!products || products.length === 0) {
      grid.innerHTML = `<p>Kunde inte hitta dina sparade produkter.</p>`;
      return;
    }

    // 3. Render out identical reusable cards layout elements block
    renderWishlistProducts(products);

  } catch (err) {
    console.error('Wishlist error loading:', err);
    grid.innerHTML = `<p>Ett fel uppstod när önskelistan laddades. Vänligen försök igen.</p>`;
  }
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

function renderWishlistProducts(products) {
  const grid = document.getElementById('wishlist-grid');
  if (!grid) return;

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

    return `
      <div class="product-card1" id="wishlist-card-${product.slug}">
        <div class="image-wrapper">
          <a href="/product.html?slug=${product.slug}">
            <img src="${firstVariant?.image_url || '/images/placeholder.png'}" alt="${product.title || ''}">
          </a>
          ${badgeHTML}
          
          <button type="button" class="wishlist-btn" onclick="event.stopPropagation(); handleWishlistPageToggle('${product.slug}', this.querySelector('img'))">
            <img src="/images/heart-filled.png" class="active-heart" alt="Wishlist">
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

// Specific toggle function handler designed to drop out records dynamically if un-hearted
function handleWishlistPageToggle(slug, heartImg) {
  // Execute the shared global toggler core engine logic
  if (typeof toggleWishlist === 'function') {
    toggleWishlist(slug, heartImg);
  } else {
    // Fallback if missing external global scopes script linking logic bounds
    let wishlist = JSON.parse(localStorage.getItem('ns_wishlist')) || [];
    wishlist = wishlist.filter(s => s !== slug);
    localStorage.setItem('ns_wishlist', JSON.stringify(wishlist));
    if (typeof updateWishlistNavCount === 'function') updateWishlistNavCount();
  }

  // Fade out and remove the specific interface HTML card directly without requiring a hard reload loop
  const targetCard = document.getElementById(`wishlist-card-${slug}`);
  if (targetCard) {
    targetCard.style.opacity = '0';
    targetCard.style.transform = 'scale(0.9)';
    targetCard.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      targetCard.remove();
      // If zero remaining slots left, re-trigger initial page setup loop view for empty conditional notification block layouts
      if (getWishlistSlugs().length === 0) {
        loadWishlistPage();
      }
    }, 300);
  }
}

document.addEventListener('DOMContentLoaded', loadWishlistPage);