export function flattenRuntimeRegistry(registry) {
  const root = registry?.tree;
  const links = [];

  walkTree(root, [], links);

  return links.sort((a, b) => {
    const left = `${a.slug || ""}:${a.match || "exact"}`;
    const right = `${b.slug || ""}:${b.match || "exact"}`;
    return left.localeCompare(right);
  });
}

function walkTree(node, parts, links) {
  if (!node || typeof node !== "object") return;

  addTreeLink(node.link, parts, links);
  addTreeLink(node.splat_link, parts, links);

  for (const [segment, child] of Object.entries(node.children || {})) {
    walkTree(child, [...parts, segment], links);
  }
}

function addTreeLink(link, parts, links) {
  if (!link || typeof link !== "object") return;

  links.push({
    ...link,
    slug: link.slug || parts.join("/")
  });
}
