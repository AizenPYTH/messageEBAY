/**
 * Bridge to the repo-root engine (`src/`).
 * Relative paths avoid Turbopack treating `@ebay-ai/core/*` as external Node modules.
 * Webpack `extensionAlias` maps the engine's internal `.js` imports to `.ts` sources.
 */
export { createDefaultAiEngine } from "../../../../src/ai/index";
export {
  formatConversationDate,
  isFromSelf,
  loadInboxItems,
  resolveClientUsername,
  resolveSelfUsername,
  sortMessagesChronologically,
} from "../../../../src/conversations/index";
export { buildAssistantContext } from "../../../../src/context/buildContext";
export {
  getSellerByUsername,
  syncConversationToDatabase,
  upsertAppProfile,
  upsertSellerProfile,
  getSellerProfileBySellerId,
} from "../../../../src/database/index";
export { getSupabaseClient } from "../../../../src/database/client";
export {
  disconnectEbay,
  fetchUsernameWithToken,
  getEbayConnection,
  markEbayConnectionSynced,
  markEbayConnectionTested,
  resolveEbayAccessToken,
  saveEbayConnection,
  toPublicConnection,
  withUserEbayToken,
} from "../../../../src/ebay/connectionService";
export { getAuthenticatedUsername } from "../../../../src/ebay/getUser";
export { listConversations } from "../../../../src/ebay/messageApi";
export {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  extractCode,
  refreshAccessToken,
} from "../../../../src/ebay/oauth";
export { sendConversationMessage } from "../../../../src/ebay/sendMessage";
export { runWithEbayTokenAsync } from "../../../../src/ebay/tokenContext";
export {
  getSellerProfileBundle,
  initDefaultSellerProfile,
  loadPromptSellerProfile,
} from "../../../../src/seller/index";
