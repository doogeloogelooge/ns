import { fetchCategories } from "./data/categories.js";
import { buildCategoryTree } from "./utils/categoryTree.js";
import { renderNavbar } from "./ui/navbar.js";

async function initNavbar() {
  const categories = await fetchCategories();
  const tree = buildCategoryTree(categories);

  const container = document.getElementById("navbar");
  renderNavbar(tree, container);
}

initNavbar();

