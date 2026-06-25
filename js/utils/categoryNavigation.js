export function getCategoryPath(tree, targetId) {
  const path = [];

  function dfs(nodes, currentPath) {
    for (const node of nodes) {
      const newPath = [...currentPath, node];

      if (node.id === targetId) {
        path.push(...newPath);
        return true;
      }

      if (node.children?.length) {
        if (dfs(node.children, newPath)) return true;
      }
    }
    return false;
  }

  dfs(tree, []);
  return path;
}

export function buildCategoryUrl(tree, categoryId) {
  const path = getCategoryPath(tree, categoryId);

  return "/" + path.map(n => n.slug).join("/") + "/";
}