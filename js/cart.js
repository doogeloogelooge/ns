// ==========================================
// 1. GLOBAL CART STORAGE ENGINE
// ==========================================

// Fetch current cart array from localStorage safely
function getCart() {
  try {
    return JSON.parse(localStorage.getItem('ns_cart')) || [];
  } catch (e) {
    return [];
  }
}

// Save cart array state back to localStorage & trigger UI updates
function saveCart(cartArray) {
  localStorage.setItem('ns_cart', JSON.stringify(cartArray));
  updateCartNavCount();
  
  // Custom dispatch event so if the cart page is open, it updates live!
  window.dispatchEvent(new Event('cartUpdated'));
}

// Update the visual badge total item count on your header shopping cart icon
function updateCartNavCount() {
  const cartBtn = document.getElementById('cart-toggle-btn');
  if (!cartBtn) return;
  
  const cart = getCart();
  // Sum up all quantities (e.g., 2 hooks + 1 stinger = 3 items total)
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  let badge = cartBtn.querySelector('.nav-badge');
  
  if (totalItems > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nav-badge';
      cartBtn.appendChild(badge);
    }
    badge.textContent = totalItems;
  } else if (badge) {
    badge.remove();
  }
}

// ==========================================
// 2. CORE UI & CART ACTIONS
// ==========================================

// Select UI Elements (Ensure these match your actual HTML classes)
const cartDrawer = document.querySelector('.cart-drawer'); 
const cartOverlay = document.querySelector('.cart-overlay');
const cartItemsList = document.querySelector('.cart-items-list');
const totalSummaryElement = document.querySelector('.summary-row.total span:last-child');
const shippingElement = document.querySelector('.summary-row:not(.total) span:last-child');
const freeShippingNotice = document.querySelector('.free-shipping-notice');

function openCart() {
  if (cartDrawer && cartOverlay) {
    renderCart(); // Always refresh view on open
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

// Add an item or increment its quantity if it already exists
function addItemToCart(id, title, brand, price, img, url, quantity = 1) {
  let cart = getCart();
  const existingItem = cart.find(item => item.id === id);

  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.push({ id, title, brand, price, img, url, quantity });
  }

  saveCart(cart);
  renderCart();
  openCart(); // Slide the cart open automatically
}

// Expose function globally so inline onclick events can find it
window.addItemToCart = addItemToCart;

// Modify quantities inside the pill selector
function updateQuantity(id, amount) {
  let cart = getCart();
  const item = cart.find(item => item.id === id);
  if (!item) return;

  item.quantity += amount;

  // If quantity hits 0 or below, wipe it out completely
  if (item.quantity <= 0) {
    cart = cart.filter(item => item.id !== id);
  }

  saveCart(cart);
  renderCart();
}

// Handle direct item deletion via trash can
function removeItem(id) {
  let cart = getCart();
  cart = cart.filter(item => item.id !== id);
  saveCart(cart);
  renderCart();
}

// ==========================================
// 3. RENDERING & CALCULATIONS ENGINE
// ==========================================
function renderCart() {
  if (!cartItemsList) return;

  const cart = getCart();
  cartItemsList.innerHTML = '';

  if (cart.length === 0) {
    cartItemsList.innerHTML = '<p class="empty-cart-message">Din varukorg är tom.</p>';
    if (totalSummaryElement) totalSummaryElement.textContent = '0 kr';
    if (shippingElement) {
      shippingElement.innerHTML = `
        61 kr
        <a href="https://www.postnord.se" target="_blank" class="shipping-alternative-img-cart">
          <img src="/images/icons/postnord.png" alt="PostNord" class="shipping-logo">
        </a>
      `;
    }
    if (freeShippingNotice) freeShippingNotice.textContent = 'Handla för 399 kr till för att få fri frakt!';
    return;
  }

  let subtotal = 0;

  cart.forEach(item => {
    const itemTotal = item.price * item.quantity;
    subtotal += itemTotal;

    const itemHTML = `
      <div class="cart-item" data-id="${item.id}">
        <a href="${item.url || '#'}" class="cart-item-link">
          <img src="${item.img}" alt="${item.title}" class="item-img">
        </a>
        
        <div class="item-details">
          <a href="${item.url || '#'}" class="cart-item-title-link">
            <span class="item-title">${item.title}</span>
          </a>
          <span class="item-brand">${item.brand}</span>
          <div class="item-actions">
            <div class="quantity-selector">
              <button class="qty-minus" data-id="${item.id}">&minus;</button>
              <input type="number" value="${item.quantity}" readonly>
              <button class="qty-plus" data-id="${item.id}">&plus;</button>
            </div>
            <button class="delete-btn" data-id="${item.id}">
              <i class="fa fa-trash-o"></i>
            </button>
          </div>
        </div>
        <div class="item-price">${itemTotal} kr</div>
      </div>
    `;
    cartItemsList.insertAdjacentHTML('beforeend', itemHTML);
  });

  // Financial calculations & Free Shipping Threshold rules
  const shippingThreshold = 399;
  let shippingCost = subtotal >= shippingThreshold ? 0 : 61;
  
  if (shippingCost === 0) {
    if (freeShippingNotice) freeShippingNotice.textContent = "Grattis! Du har uppnått fri frakt.";
    if (shippingElement) {
      shippingElement.innerHTML = `
        Fri frakt 
        <a href="https://www.postnord.se" target="_blank" class="shipping-alternative-img-cart">
          <img src="/images/icons/postnord.png" alt="PostNord" class="shipping-logo">
        </a>
      `;
    }
  } else {
    const remaining = shippingThreshold - subtotal;
    if (freeShippingNotice) {
      freeShippingNotice.textContent = `Om du handlar för ytterligare ${remaining} kr så får du fraktfritt!`;
    }
    if (shippingElement) {
      shippingElement.innerHTML = `
        ${shippingCost} kr 
        <a href="https://www.postnord.se" target="_blank" class="shipping-alternative-img-cart">
          <img src="/images/icons/postnord.png" alt="PostNord" class="shipping-logo">
        </a>
      `;
    }
  }

  if (totalSummaryElement) totalSummaryElement.textContent = `${subtotal + shippingCost} kr`;
}

// ==========================================
// 4. EVENT DELEGATION & INITIALIZATION
// ==========================================
if (cartDrawer) {
  cartDrawer.addEventListener('click', function (e) {
    const target = e.target;
    
    if (target.closest('.qty-minus')) {
      const id = target.closest('.qty-minus').getAttribute('data-id');
      updateQuantity(id, -1);
    }
    
    if (target.closest('.qty-plus')) {
      const id = target.closest('.qty-plus').getAttribute('data-id');
      updateQuantity(id, 1);
    }
    
    if (target.closest('.delete-btn')) {
      const id = target.closest('.delete-btn').getAttribute('data-id');
      removeItem(id);
    }
  });
}

// Run indicator update and initial render automatically when page initializes
document.addEventListener('DOMContentLoaded', () => {
  updateCartNavCount();
  // Optional: Uncomment below if you want the drawer to render on page load
  // renderCart(); 
});
