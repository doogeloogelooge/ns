export function buildCategoryTree(categories) {
  const map = new Map();
  const roots = [];

  // create nodes
  categories.forEach(cat => {
    map.set(cat.id, { ...cat, children: [] });
  });

  // link parents
  categories.forEach(cat => {
    if (cat.parent_id) {
      const parent = map.get(cat.parent_id);
      if (parent) parent.children.push(map.get(cat.id));
    } else {
      roots.push(map.get(cat.id));
    }
  });

  return roots;
}