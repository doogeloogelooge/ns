document.addEventListener("DOMContentLoaded", function () {
  
  // ==========================================
  // 1. PRODUCT FILTERING LOGIC
  // ==========================================
  const tabs = document.querySelectorAll(".tab");
  const products = document.querySelectorAll(".product-card");

  filterProducts("spinnfiske");

  tabs.forEach(tab => {
    tab.addEventListener("click", function () {
      tabs.forEach(t => t.classList.remove("active"));
      this.classList.add("active");

      const targetCategory = this.getAttribute("data-target");
      filterProducts(targetCategory);
    });
  });

  function filterProducts(categoryName) {
    products.forEach(card => {
      const cardCategory = card.getAttribute("data-category");

      if (cardCategory === categoryName) {
        card.classList.remove("is-hidden");
      } else {
        card.classList.add("is-hidden");
      }
    });
  }

  // ==========================================
  // 2. CART DRAWER LOGIC (Moved Inside DOMContentLoaded)
  // ==========================================
  const cartToggleBtn = document.getElementById('cart-toggle-btn');
  const cartCloseBtn = document.getElementById('cart-close-btn');
  const cartDrawer = document.getElementById('cart-drawer');
  const cartOverlay = document.getElementById('cart-overlay');

  function openCart() {
    if (cartDrawer && cartOverlay) {
      cartDrawer.classList.add('open');
      cartOverlay.classList.add('open');
      document.body.style.overflow = 'hidden'; 
    }
  }

  function closeCart() {
    if (cartDrawer && cartOverlay) {
      cartDrawer.classList.remove('open');
      cartOverlay.classList.remove('open');
      document.body.style.overflow = ''; 
    }
  }

  if (cartToggleBtn) cartToggleBtn.addEventListener('click', openCart);
  if (cartCloseBtn) cartCloseBtn.addEventListener('click', closeCart);
  if (cartOverlay) cartOverlay.addEventListener('click', closeCart);

});

function initializeGlobalSearch() {
  const searchTrigger = document.getElementById('search-btn'); 
  const searchBar = document.getElementById('search-bar');     
  const searchInput = document.getElementById('search-input');   
  const searchSubmit = document.getElementById('search-submit-action'); 

  if (!searchBar) return;

  if (searchTrigger) {
    searchTrigger.addEventListener('click', (e) => {
      e.stopPropagation(); 
      searchBar.classList.toggle('active');
      
      if (searchBar.classList.contains('active') && searchInput) {
        searchInput.focus();
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!searchBar.contains(e.target) && e.target !== searchTrigger) {
      searchBar.classList.remove('active');
    }
  });

  function executeSearch() {
    if (!searchInput) return;
    const query = searchInput.value.trim();
    if (query.length > 0) {
      window.location.href = `/search.html?q=${encodeURIComponent(query)}`;
    }
  }

  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        executeSearch();
      }
    });
  }

  if (searchSubmit) {
    searchSubmit.addEventListener('click', executeSearch);
  }
}

// --- GLOBAL WISHLIST ENGINE (Badge städad!) ---

function getWishlist() {
  try {
    return JSON.parse(localStorage.getItem('ns_wishlist')) || [];
  } catch (e) {
    return [];
  }
}

function toggleWishlist(productSlug, heartImgElement) {
  let wishlist = getWishlist();
  
  if (wishlist.includes(productSlug)) {
    wishlist = wishlist.filter(slug => slug !== productSlug);
    if (heartImgElement) {
      heartImgElement.src = '/images/heart.png'; 
      heartImgElement.classList.remove('active-heart');
    }
  } else {
    wishlist.push(productSlug);
    if (heartImgElement) {
      heartImgElement.src = '/images/heart-filled.png'; 
      heartImgElement.classList.add('active-heart');
    }
  }
  
  localStorage.setItem('ns_wishlist', JSON.stringify(wishlist));
}

document.addEventListener('DOMContentLoaded', () => {
  const favoritesBtn = document.getElementById('favorites-btn');
  if (favoritesBtn) {
    // Om det finns en gammal badge kvar på skärmen sedan tidigare, ta bort den helt
    const oldBadge = favoritesBtn.querySelector('.nav-badge');
    if (oldBadge) oldBadge.remove();

    favoritesBtn.addEventListener('click', () => {
      window.location.href = '/wishlist.html';
    });
  }
});

function updateGlobalCartBadge() {
  const badge = document.getElementById('global-cart-count'); 
  if (!badge) return;

  const cart = JSON.parse(localStorage.getItem('shopping_cart')) || [];
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  badge.textContent = totalItems;
}

document.addEventListener('DOMContentLoaded', updateGlobalCartBadge);
window.addEventListener('cartUpdated', updateGlobalCartBadge);
document.addEventListener('DOMContentLoaded', initializeGlobalSearch);