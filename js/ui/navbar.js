import { buildCategoryUrl } from "../utils/categoryNavigation.js";

export function renderNavbar(tree) {
  const ul = document.getElementById("nav-links");
  ul.innerHTML = "";

  tree.forEach(cat => {
    const li = document.createElement("li");

    const a = document.createElement("a");
    a.href = buildCategoryUrl(tree, cat.id);
    a.textContent = cat.name;

    li.appendChild(a);

    if (cat.children?.length) {
      const dropdown = document.createElement("ul");
      dropdown.classList.add("dropdown");

      cat.children.forEach(child => {
        const subLi = document.createElement("li");
        const subA = document.createElement("a");

        subA.href = buildCategoryUrl(tree, child.id);
        subA.textContent = child.name;

        subLi.appendChild(subA);
        dropdown.appendChild(subLi);
      });

      li.appendChild(dropdown);
    }

    ul.appendChild(li);
  });

  
}