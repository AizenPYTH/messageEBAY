/**
 * Bridge to the repo-root engine (`src/`).
 * Relative paths avoid Turbopack treating `@ebay-ai/core/*` as external Node modules.
 * Webpack `extensionAlias` maps the engine's internal `.js` imports to `.ts` sources.
 */
export { createDefaultAiEngine } from "../../../../src/ai/index";
export { ensureSellerAlerts } from "../../../../src/alerts/index";
export { analyzeMessage } from "../../../../src/analysis/index";
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
  getAppProfile,
  setAutopilotEnabled,
  listAutopilotUserIds,
  upsertSellerProfile,
  getSellerProfileBySellerId,
  listOpenSellerAlerts,
  resolveSellerAlert,
  type SellerAlertRow,
} from "../../../../src/database/index";
export { runAutopilotAll, runAutopilotForUser } from "../../../../src/autopilot/index";
export { syncSellerCatalogFromApi } from "../../../../src/catalog/syncFromApi";
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
export { listConversations, findConversationSummary } from "../../../../src/ebay/messageApi";
export {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  extractCode,
  refreshAccessToken,
} from "../../../../src/ebay/oauth";
export { sendConversationMessage } from "../../../../src/ebay/sendMessage";
export { runWithEbayTokenAsync } from "../../../../src/ebay/tokenContext";
export { indexPendingMessageEmbeddings } from "../../../../src/rag/index";
export {
  getSellerProfileBundle,
  initDefaultSellerProfile,
  loadPromptSellerProfile,
} from "../../../../src/seller/index";

