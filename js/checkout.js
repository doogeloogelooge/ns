// 1. Global variabel för att spara databasinfon så att handleOrderSubmit kan nå den
let globalDbVariants = []; 

document.addEventListener('DOMContentLoaded', initCheckoutPage);

async function initCheckoutPage() {
  const itemsPreview = document.getElementById('checkout-items-preview');
  if (!itemsPreview) return;

  const cart = typeof getCart === 'function' ? getCart() : [];

  if (cart.length === 0) {
    itemsPreview.innerHTML = `<p>Din varukorg är tom. <a href="/">Gå tillbaka till butiken.</a></p>`;
    document.querySelector('.submit-order-btn').disabled = true;
    return;
  }

  const variantIds = cart.map(item => item.variantId);

  try {
    // Fetch live prices and validation structures directly from Supabase
    const { data: variants, error } = await supabaseClient
      .from('product_variants')
      .select(`
        id,
        price,
        variant_name,
        products ( title, brand, campaigns(id, name, discount_percentage) ),
        campaigns ( id, name, discount_percentage )
      `)
      .in('id', variantIds);

    if (error) throw error;

    // 2. Spara datan globalt här så vi kan använda den i EmailJS-mailet senare
    globalDbVariants = variants; 
    
    renderCheckoutSummary(variants, cart);

  } catch (err) {
    console.error('Error loading checkout totals:', err);
    itemsPreview.innerHTML = `<p>Kunde inte validera dina produkter. Försök igen.</p>`;
  }

  // Handle Order Submit
  const form = document.getElementById('checkout-form');
  form.addEventListener('submit', handleOrderSubmit);
}

function renderCheckoutSummary(dbVariants, storageCart) {
  const previewContainer = document.getElementById('checkout-items-preview');
  let runningSubtotal = 0;

  previewContainer.innerHTML = storageCart.map(item => {
    const variantData = dbVariants.find(v => v.id === item.variantId);
    if (!variantData) return '';

    const basePrice = variantData.price || 0;
    const parentProduct = variantData.products;
    const percentage = variantData.campaigns?.discount_percentage ?? parentProduct?.campaigns?.discount_percentage;
    
    let finalUnitPrice = basePrice;
    if (percentage && percentage > 0) {
      finalUnitPrice = Math.round(basePrice - (basePrice * (percentage / 100)));
    }

    runningSubtotal += finalUnitPrice * item.quantity;

    return `
      <div class="mini-checkout-item">
        <div>
          <strong>${parentProduct?.brand || ''} ${parentProduct?.title || ''}</strong>
          <small style="display:block; color:#666;">Variant: ${variantData.variant_name} (x${item.quantity})</small>
        </div>
        <div>${finalUnitPrice * item.quantity} kr</div>
      </div>
    `;
  }).join('');

  // Calculate totals matching cart thresholds
  let shippingCost = runningSubtotal >= 399 || runningSubtotal === 0 ? 0 : 61;

  document.getElementById('checkout-subtotal').textContent = `${runningSubtotal} kr`;
  document.getElementById('checkout-shipping').textContent = shippingCost === 0 ? 'Gratis' : `${shippingCost} kr`;
  document.getElementById('checkout-final-total').textContent = `${runningSubtotal + shippingCost} kr`;
}

async function handleOrderSubmit(e) {
  e.preventDefault();

  const swishBtn = document.querySelector('.submit-order-btn');
  if (swishBtn) {
    swishBtn.disabled = true;
    swishBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Sparar order...';
  }

  // 1. Hämta alla kunduppgifter från formuläret
  const firstname = document.getElementById('firstname').value;
  const lastname = document.getElementById('lastname').value;
  const email = document.getElementById('email').value;
  const address = document.getElementById('address').value;
  const zip = document.getElementById('zip').value;
  const city = document.getElementById('city').value;
  const phone = document.getElementById('phone').value;

  const fullName = `${firstname} ${lastname}`;
  const fullAddress = `${address}, ${zip} ${city}`;

  // 2. Hämta varorna från varukorgen
  const cart = typeof getCart === 'function' ? getCart() : [];
  
  // 3. Förbered data för Supabase 'orders'-tabellen
  const cleanCart = cart.map(item => {
    // Vi kikar i vår globala databasvariabel för att sätta rätt namn i Supabase-ordern också
    const dbInfo = globalDbVariants.find(v => v.id === item.variantId);
    const combinedName = dbInfo 
      ? `${dbInfo.products?.brand || ''} ${dbInfo.products?.title || ''} (${dbInfo.variant_name || ''})`
      : 'Okänd produkt';

    return {
      quantity: parseInt(item.quantity) || 1,
      variantId: item.variantId,
      productSlug: item.productSlug || "",
      name: combinedName                 
    };
  });
  
  const finalTotalText = document.getElementById('checkout-final-total')?.textContent || "0";
  const totalPrice = parseInt(finalTotalText.replace(/[^0-9]/g, '')) || 0;
  
  const generatedOrderId = 'NS-' + Math.floor(1000 + Math.random() * 9000); 

  let currentUserId = null;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      currentUserId = session.user.id;
    }
  } catch (authErr) {
    console.log("Gäst-utcheckning eller inget auth-session:", authErr);
  }

  try {
    // 4. Spara direkt i din Supabase 'orders'-tabell 🚀
    const { error } = await supabaseClient
      .from('orders')
      .insert([
        {
          order_id: generatedOrderId,       
          customer_name: fullName,          
          email: email,                     
          address: fullAddress, 
          phone: phone,                     
          total_price: totalPrice,          
          items: cleanCart,                       
          order_status: 'Placed',            
          user_id: currentUserId             
        }
      ]);

    if (error) throw error;

    // 5. SKICKA ORDERBEKRÄFTELSE MED EMAILJS 🌟
    try {
      // Bygg textraderna genom att matcha varukorgen med sparat Supabase-data
      const orderDetailsText = cart.map(item => {
        const dbInfo = globalDbVariants.find(v => v.id === item.variantId);
        
        if (dbInfo) {
          const brand = dbInfo.products?.brand || '';
          const title = dbInfo.products?.title || '';
          const variantName = dbInfo.variant_name || '';
          return `${brand} ${title} - ${variantName} (x${item.quantity})`;
        }
        
        return `Produkt ID: ${item.variantId} (x${item.quantity})`;
      }).join('\n');

      // Parametrar som matchar måsvingarna {{ }} i din EmailJS-mall
      const templateParams = {
        to_email: email,
        customer_name: fullName,
        customer_address: fullAddress,
        order_id: generatedOrderId,
        order_details: orderDetailsText, 
        total_price: totalPrice
      };

      // Skicka mailet asynkront
      await emailjs.send('service_x77dvus', 'template_wpkercp', templateParams);
      console.log('Orderbekräftelse skickad via EmailJS!');
    } catch (emailErr) {
      // Logga bara felet så att köpet inte avbryts helt om mailet nekas
      console.error('EmailJS misslyckades att skicka:', emailErr);
    }

    // 6. Töm varukorgen eftersom ordern nu är sparad och klar
    localStorage.removeItem('shopping_cart'); 

    // 7. Skicka kunden till tack-sidan
    window.location.href = `/thank-you.html?orderId=${generatedOrderId}&total=${totalPrice}`;

  } catch (err) {
    console.error('Kunde inte spara ordern:', err);
    alert('Det gick inte att slutföra beställningen. Kontrollera dina uppgifter och försök igen.');
    
    if (swishBtn) {
      swishBtn.disabled = false;
      swishBtn.innerHTML = '<i class="fa fa-credit-card"></i> Slutför Köp';
    }
  }
}