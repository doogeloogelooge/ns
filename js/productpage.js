document.addEventListener("DOMContentLoaded", () => {
    // 1. Grab all references to the HTML elements upfront
    const sizeSelect = document.getElementById("size-select");
    const mainImage = document.getElementById("product-main-img");
    const thumbImage = document.getElementById("product-thumb-img");
    const priceDisplay = document.getElementById("price-display");
    const buyButton = document.getElementById("dynamic-buy-btn");

    // ==========================================================================
    // VARIANT VISUAL SWITCHING LOGIC
    // ==========================================================================
    if (sizeSelect && mainImage && priceDisplay) {

        // Function to update view based on a specific <option> element
        function updateProductView(optionElement, updateUrl = true) {
            if (!optionElement) return;

            // Extract the custom data attributes directly from the HTML option
            const price = optionElement.getAttribute("data-price");
            const imageSrc = optionElement.getAttribute("data-image");
            const imageAlt = optionElement.getAttribute("data-alt");
            const urlCode = optionElement.value; // '10g' or '7g'

            // Update UI Elements
            if (price) priceDisplay.textContent = price;
            if (imageSrc) {
                mainImage.src = imageSrc;
                mainImage.alt = imageAlt || "";
                
                if (thumbImage) {
                    thumbImage.src = imageSrc;
                    thumbImage.alt = imageAlt || "";
                }
            }

            // Keep dropdown select menu visually synced
            sizeSelect.value = urlCode;

            // Update the URL parameter seamlessly for sharing (?variant=7g)
            if (updateUrl) {
                const newUrl = window.location.protocol + "//" + 
                               window.location.host + 
                               window.location.pathname + 
                               `?variant=${urlCode}`;
                window.history.replaceState({ path: newUrl }, '', newUrl);
            }
        }

        // --- RUN ON PAGE LOAD ---
        const urlParams = new URLSearchParams(window.location.search);
        const currentVariantParam = urlParams.get('variant')?.toLowerCase(); 
        
        // Try to find an option matching the URL parameter
        let targetOption = Array.from(sizeSelect.options).find(opt => opt.value.toLowerCase() === currentVariantParam);

        if (targetOption) {
            // URL matched perfectly (e.g., ?variant=7g), load that variant directly
            updateProductView(targetOption, false);
        } else if (sizeSelect.options.length > 0) {
            // No valid URL parameter? Default to the very first choice listed in your HTML
            updateProductView(sizeSelect.options[0], true);
        }

        // --- RUN ON USER SELECTION CHANGE ---
        sizeSelect.addEventListener("change", (event) => {
            const selectedOption = event.target.options[event.target.selectedIndex];
            updateProductView(selectedOption, true);
        });
    }

    if (buyButton && sizeSelect) {
        buyButton.addEventListener("click", function (event) {
            const selectedOption = sizeSelect.options[sizeSelect.selectedIndex];
            if (!selectedOption) return;

            const variantValue = selectedOption.value; 
            const variantText = selectedOption.text;   
            const rawPrice = selectedOption.getAttribute("data-price") || "0"; 
            const variantImg = selectedOption.getAttribute("data-image") || ""; 
            
            const currentBtn = event.currentTarget;
            const baseId = currentBtn.getAttribute("data-base-id");
            const productTitle = currentBtn.getAttribute("data-product-title"); 
            const brand = currentBtn.getAttribute("data-brand");                 
            
            const cleanPrice = parseFloat(rawPrice.replace(/[^\d.]/g, "")) || 0; 
            
            // Skapa dynamiskt ID och titel
            const dynamicId = `${baseId}?variant=${encodeURIComponent(variantValue)}`;
            const dynamicTitle = `${productTitle} (${variantText})`; 
            
            // NYTT: Hämta den exakta URL:en till nuvarande sida och lägg till varianten
            const productPageUrl = window.location.pathname + `?variant=${encodeURIComponent(variantValue)}`;

            // Skicka med productPageUrl som ett extra argument i slutet
            if (typeof window.addItemToCart === "function") {
                window.addItemToCart(dynamicId, dynamicTitle, brand, cleanPrice, variantImg, productPageUrl);
            } else {
                console.error("Cart system handler (addItemToCart) not loaded yet!");
            }
        });
    }
});