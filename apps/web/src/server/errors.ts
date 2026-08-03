export function toUserError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("access_token") ||
    lower.includes("ebay_user_access_token") ||
    lower.includes("401") ||
    lower.includes("unauthorized") ||
    lower.includes("token")
  ) {
    return "Token eBay manquant ou expiré. Relancez `npm run auth` puis réessayez.";
  }
  if (lower.includes("openai") || lower.includes("api key")) {
    return `OpenAI indisponible : ${message}`;
  }
  if (lower.includes("supabase") || lower.includes("supabase_")) {
    return `Supabase indisponible : ${message}`;
  }
  if (lower.includes("ebay") || lower.includes("/conversation")) {
    return `eBay ne répond pas : ${message}`;
  }
  return message;
}
