import { getSupabaseClient } from "../client.js";
import type { ProductBrand } from "../../product/identity.js";
import type { ProductReference } from "../../product/references.js";

const TABLE = "product_references";

export type ProductReferenceRow = {
  code: string;
  brand: string;
  family: string;
  base: string;
  qualifiers: string[] | null;
  network: string | null;
  label: string;
  source: string | null;
  confidence: number | null;
};

function toReference(row: ProductReferenceRow): ProductReference {
  return {
    code: row.code,
    source: "marketplace",
    brand: row.brand as ProductBrand,
    family: row.family,
    base: row.base,
    ...(row.qualifiers?.length ? { qualifiers: row.qualifiers } : {}),
    ...(row.network === "4g" || row.network === "5g"
      ? { network: row.network }
      : {}),
    label: row.label,
  };
}

export async function listProductReferences(): Promise<ProductReference[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .select("*")
    .limit(5000);
  if (error) {
    throw new Error(`listProductReferences failed: ${error.message}`);
  }
  return ((data as ProductReferenceRow[]) ?? []).map(toReference);
}

export async function upsertProductReference(input: {
  reference: ProductReference;
  confidence?: number;
  samples?: string[];
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .upsert(
      {
        code: input.reference.code,
        brand: input.reference.brand,
        family: input.reference.family,
        base: input.reference.base,
        qualifiers: input.reference.qualifiers ?? [],
        network: input.reference.network ?? null,
        label: input.reference.label,
        source: input.reference.source ?? "marketplace",
        confidence: input.confidence ?? null,
        samples: input.samples ?? [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "code" },
    );
  if (error) {
    throw new Error(`upsertProductReference failed: ${error.message}`);
  }
}
