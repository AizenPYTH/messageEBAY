/**
 * Auth architecture stubs — providers will be wired via Supabase Auth later.
 * eBay OAuth remains a custom seller-account link flow.
 */
export type AuthProvider = "ebay" | "google" | "email";

export type AuthStatus = "anonymous" | "authenticated" | "loading";

export type AuthUser = {
  id: string;
  email?: string;
  displayName?: string;
  providers: AuthProvider[];
};

export type SellerAccountLink = {
  sellerUsername: string;
  ebayUserId?: string;
  linkedAt: string;
  hasValidToken: boolean;
};
