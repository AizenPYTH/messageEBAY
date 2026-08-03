export type SellerRow = {
  id: string;
  ebay_user_id: string | null;
  username: string;
  created_at: string;
};

export type ListingRow = {
  id: string;
  item_id: string;
  seller_id: string | null;
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  category: string | null;
  condition: string | null;
  updated_at: string;
};

export type ConversationRow = {
  id: string;
  conversation_id: string;
  seller_id: string | null;
  listing_id: string | null;
  other_party: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  message_id: string;
  conversation_id: string;
  sender: string | null;
  sent_at: string | null;
  body: string | null;
  is_from_seller: boolean;
  created_at: string;
};

export type AiReplyRow = {
  id: string;
  message_id: string | null;
  model: string | null;
  prompt_version: string | null;
  reply: string;
  confidence: number | null;
  sent_to_ebay: boolean;
  created_at: string;
};

export type UpsertSellerInput = {
  username: string;
  ebayUserId?: string | null;
};

export type UpsertListingInput = {
  itemId: string;
  sellerId?: string | null;
  title?: string | null;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  category?: string | null;
  condition?: string | null;
};

export type UpsertConversationInput = {
  conversationId: string;
  sellerId?: string | null;
  listingId?: string | null;
  otherParty?: string | null;
  createdAt?: string | null;
};

export type UpsertMessageInput = {
  messageId: string;
  conversationDbId: string;
  sender?: string | null;
  sentAt?: string | null;
  body?: string | null;
  isFromSeller: boolean;
};

export type InsertAiReplyInput = {
  messageDbId?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  reply: string;
  confidence?: number | null;
  sentToEbay?: boolean;
};

export type SellerProfileRow = {
  id: string;
  seller_id: string;
  display_name: string | null;
  languages: string[];
  response_style: string | null;
  shipping_policy: string | null;
  return_policy: string | null;
  refund_policy: string | null;
  negotiation_policy: string | null;
  tone: string | null;
  signature: string | null;
  custom_instructions: string | null;
  created_at: string;
  updated_at: string;
};

export type UpsertSellerProfileInput = {
  sellerId: string;
  displayName?: string | null;
  languages?: string[];
  responseStyle?: string | null;
  shippingPolicy?: string | null;
  returnPolicy?: string | null;
  refundPolicy?: string | null;
  negotiationPolicy?: string | null;
  tone?: string | null;
  signature?: string | null;
  customInstructions?: string | null;
};

export type AppProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export type UserConnectionRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string | null;
  provider_username: string | null;
  access_token_enc: string;
  refresh_token_enc: string | null;
  expires_at: string | null;
  scopes: string | null;
  last_tested_at: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UpsertUserConnectionInput = {
  userId: string;
  provider: string;
  providerUserId?: string | null;
  providerUsername?: string | null;
  accessTokenEnc: string;
  refreshTokenEnc?: string | null;
  expiresAt?: string | null;
  scopes?: string | null;
  lastTestedAt?: string | null;
  lastSyncAt?: string | null;
};
