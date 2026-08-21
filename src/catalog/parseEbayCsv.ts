/**
 * Parse eBay Seller Hub "all active listings" CSV export.
 * Multi-SKU listings appear as one summary row + one row per variation.
 */

export type ParsedCatalogVariation = {
  sku?: string;
  specifics: Array<{ name: string; value: string }>;
  quantityAvailable: number;
  price?: number;
};

export type ParsedCatalogListing = {
  itemId: string;
  title: string;
  sku?: string;
  quantityAvailable: number;
  price?: number;
  currency?: string;
  category?: string;
  condition?: string;
  variations: ParsedCatalogVariation[];
  searchText: string;
  itemUrl: string;
};

function parseCsvLine(line: string, delimiter = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Single variation row: `MODEL=PRO 8` (no extra `;` values). */
function isSingleVariationDetail(detail: string): boolean {
  const t = detail.trim();
  if (!t || !t.includes("=")) return false;
  // Summary rows list many values after first = separated by ;
  const eq = t.indexOf("=");
  const after = t.slice(eq + 1);
  return !after.includes(";");
}

function parseSpecifics(detail: string): Array<{ name: string; value: string }> {
  const t = detail.trim();
  const eq = t.indexOf("=");
  if (eq <= 0) return [];
  return [{ name: t.slice(0, eq).trim(), value: t.slice(eq + 1).trim() }];
}

function buildSearchText(input: {
  title: string;
  sku?: string;
  variations: ParsedCatalogVariation[];
}): string {
  const parts = [input.title, input.sku ?? ""];
  for (const v of input.variations) {
    parts.push(v.sku ?? "");
    for (const s of v.specifics) {
      parts.push(s.name, s.value);
    }
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function parseEbayActiveListingsCsv(csvText: string): ParsedCatalogListing[] {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]!).map((h) => h.trim());
  const idx = (name: string) => headers.indexOf(name);

  const iItem = idx("Item number");
  const iTitle = idx("Title");
  const iVar = idx("Variation details");
  const iSku = idx("Custom label (SKU)");
  const iQty = idx("Available quantity");
  const iCurrency = idx("Currency");
  const iPrice = idx("Current price");
  const iStart = idx("Start price");
  const iCat = idx("eBay category 1 name");
  const iCond = idx("Condition");

  if (iItem < 0 || iTitle < 0 || iQty < 0) {
    throw new Error("CSV eBay invalide: colonnes Item number / Title / Available quantity manquantes");
  }

  type Raw = {
    itemId: string;
    title: string;
    varDetail: string;
    sku: string;
    qty: number;
    price?: number;
    currency?: string;
    category?: string;
    condition?: string;
  };

  const raws: Raw[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const itemId = (cols[iItem] ?? "").trim();
    if (!itemId) continue;
    const qty = toNumber(cols[iQty]) ?? 0;
    const price =
      toNumber(iPrice >= 0 ? cols[iPrice] : undefined) ??
      toNumber(iStart >= 0 ? cols[iStart] : undefined);
    raws.push({
      itemId,
      title: (cols[iTitle] ?? "").trim(),
      varDetail: iVar >= 0 ? (cols[iVar] ?? "").trim() : "",
      sku: iSku >= 0 ? (cols[iSku] ?? "").trim() : "",
      qty,
      price,
      currency: iCurrency >= 0 ? (cols[iCurrency] ?? "").trim() || undefined : undefined,
      category: iCat >= 0 ? (cols[iCat] ?? "").trim() || undefined : undefined,
      condition: iCond >= 0 ? (cols[iCond] ?? "").trim() || undefined : undefined,
    });
  }

  const byItem = new Map<string, Raw[]>();
  for (const r of raws) {
    const list = byItem.get(r.itemId) ?? [];
    list.push(r);
    byItem.set(r.itemId, list);
  }

  const out: ParsedCatalogListing[] = [];
  for (const [itemId, rows] of byItem) {
    const title = rows.find((r) => r.title)?.title ?? "";
    const variationRows = rows.filter((r) => isSingleVariationDetail(r.varDetail));
    const summary =
      rows.find((r) => r.varDetail && !isSingleVariationDetail(r.varDetail)) ??
      rows.find((r) => !r.varDetail) ??
      rows[0]!;

    const variations: ParsedCatalogVariation[] = variationRows.map((r) => ({
      sku: r.sku || undefined,
      specifics: parseSpecifics(r.varDetail),
      quantityAvailable: r.qty,
      price: r.price,
    }));

    const quantityAvailable =
      variations.length > 0
        ? variations.reduce((s, v) => s + v.quantityAvailable, 0)
        : summary.qty;

    const listing: ParsedCatalogListing = {
      itemId,
      title,
      sku: summary.sku || undefined,
      quantityAvailable,
      price: summary.price,
      currency: summary.currency,
      category: summary.category,
      condition: summary.condition,
      variations,
      searchText: "",
      itemUrl: `https://www.ebay.fr/itm/${itemId}`,
    };
    listing.searchText = buildSearchText(listing);
    out.push(listing);
  }

  return out;
}
