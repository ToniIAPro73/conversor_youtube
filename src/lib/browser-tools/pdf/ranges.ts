export function parsePageRanges(input: string, pageCount: number): number[] {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("El rango de páginas está vacío.");
  const pages = new Set<number>();
  for (const part of trimmed.split(",")) {
    const token = part.trim();
    if (!token) throw new Error("Sintaxis de rango inválida.");
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) throw new Error("El rango de páginas está invertido.");
      for (let page = start; page <= end; page += 1) addPage(page, pageCount, pages);
      continue;
    }
    if (!/^\d+$/.test(token)) throw new Error("Sintaxis de rango inválida.");
    addPage(Number(token), pageCount, pages);
  }
  if (pages.size === 0) throw new Error("El rango no contiene páginas.");
  return Array.from(pages);
}

function addPage(page: number, pageCount: number, pages: Set<number>) {
  if (page < 1 || page > pageCount) throw new Error(`La página ${page} no existe.`);
  pages.add(page);
}
