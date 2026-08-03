/** Temporary: skip app login / magic link / Google while testing. */
export function isAuthSkipped(): boolean {
  const raw =
    process.env.NEXT_PUBLIC_SKIP_AUTH?.trim() ||
    process.env.SKIP_AUTH?.trim() ||
    "";
  return raw === "1" || raw.toLowerCase() === "true" || raw === "yes";
}
