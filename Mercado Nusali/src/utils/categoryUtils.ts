export interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  parentId?: string | null;
  displayOrder?: number;
  isActive?: boolean;
  prods?: number;
  commission?: string;
  status?: string;
  createdAt?: Date | string;
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
  level: number;
}

/**
 * Builds a nested tree structure from a flat array of categories.
 */
export function buildCategoryTree(categoriesList: Category[]): CategoryNode[] {
  const validCategories = (categoriesList || []).filter(c => c && c.id);
  const categoryMap = new Map<string, CategoryNode>();

  // Initialize nodes
  validCategories.forEach(cat => {
    categoryMap.set(cat.id, {
      ...cat,
      isActive: cat.isActive !== false,
      children: [],
      level: 0,
    });
  });

  const roots: CategoryNode[] = [];

  // Build relationships
  validCategories.forEach(cat => {
    const node = categoryMap.get(cat.id);
    if (!node) return;

    if (cat.parentId && categoryMap.has(cat.parentId)) {
      const parentNode = categoryMap.get(cat.parentId)!;
      node.level = parentNode.level + 1;
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Sort function: displayOrder then name
  const sortNodes = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => {
      const orderA = a.displayOrder ?? 0;
      const orderB = b.displayOrder ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    nodes.forEach(node => {
      if (node.children.length > 0) {
        // Update children levels recursively
        node.children.forEach(child => {
          child.level = node.level + 1;
        });
        sortNodes(node.children);
      }
    });
  };

  sortNodes(roots);
  return roots;
}

/**
 * Finds all descendant IDs for a given category ID to prevent cycles.
 */
export function getDescendantIds(targetId: string, categoriesList: Category[]): string[] {
  const descendants: string[] = [];
  const childrenMap = new Map<string, string[]>();

  (categoriesList || []).forEach(cat => {
    if (cat.parentId) {
      if (!childrenMap.has(cat.parentId)) {
        childrenMap.set(cat.parentId, []);
      }
      childrenMap.get(cat.parentId)!.push(cat.id);
    }
  });

  const queue = [...(childrenMap.get(targetId) || [])];
  while (queue.length > 0) {
    const current = queue.shift()!;
    descendants.push(current);
    const children = childrenMap.get(current);
    if (children) {
      queue.push(...children);
    }
  }

  return descendants;
}

/**
 * Checks if assigning newParentId to targetId would create a cycle.
 */
export function wouldCreateCycle(
  targetId: string,
  newParentId: string | null | undefined,
  categoriesList: Category[]
): boolean {
  if (!newParentId) return false;
  if (targetId === newParentId) return true;

  const descendants = getDescendantIds(targetId, categoriesList);
  return descendants.includes(newParentId);
}

/**
 * Calculates the full breadcrumb path from Root to the target category.
 */
export function getCategoryPath(
  categoryIdOrSlug: string,
  categoriesList: Category[]
): Category[] {
  if (!categoryIdOrSlug || !categoriesList || categoriesList.length === 0) {
    return [];
  }

  const categoryMap = new Map<string, Category>();
  const slugMap = new Map<string, Category>();

  categoriesList.forEach(cat => {
    categoryMap.set(cat.id, cat);
    if (cat.slug) slugMap.set(cat.slug, cat);
  });

  let current = categoryMap.get(categoryIdOrSlug) || slugMap.get(categoryIdOrSlug);
  if (!current) return [];

  const path: Category[] = [];
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    if (current.parentId && categoryMap.has(current.parentId)) {
      current = categoryMap.get(current.parentId)!;
    } else {
      break;
    }
  }

  return path;
}

/**
 * Checks if a category is a leaf category (has no children).
 */
export function isLeafCategory(categoryId: string, categoriesList: Category[]): boolean {
  if (!categoryId || !categoriesList) return true;
  return !categoriesList.some(
    cat => cat.parentId === categoryId && cat.isActive !== false
  );
}

/**
 * Returns direct children of a category.
 */
export function getDirectChildren(parentId: string | null, categoriesList: Category[]): Category[] {
  return (categoriesList || []).filter(cat => {
    if (cat.isActive === false) return false;
    if (!parentId) return !cat.parentId;
    return cat.parentId === parentId;
  });
}
