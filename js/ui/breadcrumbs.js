import { getCategoryPath } from "../utils/categoryNavigation.js";

export function renderBreadcrumbs(tree, categoryId, container) {
  const path = getCategoryPath(tree, categoryId);

  container.innerHTML = "";

  path.forEach((node, index) => {
    const a = document.createElement("a");

    a.href = "/" + path
      .slice(0, index + 1)
      .map(n => n.slug)
      .join("/") + "/";

    a.textContent = node.name;

    container.appendChild(a);

    if (index < path.length - 1) {
      container.append(" / ");
    }
  });
}