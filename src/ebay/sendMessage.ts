import { config, ebayUrls } from "../config.js";

export type SendMessageResponse = {
  messageId?: string;
  conversationId?: string;
  messageBody?: string;
  senderUsername?: string;
  recipientUsername?: string;
  createdDate?: string;
  errors?: Array<{
    errorId?: number;
    message?: string;
    longMessage?: string;
  }>;
  errorId?: number;
  message?: string;
  longMessage?: string;
};

export type SendMessageResult = {
  status: number;
  data: SendMessageResponse;
  ok: boolean;
  errorDetail?: string;
};

/**
 * Shared eBay send_message call — used by CLI reply/autoreply and the web UI.
 */
export async function sendConversationMessage(
  conversationId: string,
  messageText: string,
): Promise<SendMessageResult> {
  const id = conversationId.trim();
  const text = messageText.trim();
  if (!id) throw new Error("conversationId is required");
  if (!text) throw new Error("messageText is required");

  if (!config.accessToken) {
    throw new Error(
      "EBAY_USER_ACCESS_TOKEN manquant. Lance d'abord : npm run auth",
    );
  }

  const response = await fetch(`${ebayUrls.messageApi}/send_message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      conversationId: id,
      messageText: text,
    }),
  });

  const data = (await response.json()) as SendMessageResponse;
  const ok = response.status >= 200 && response.status < 300 && !data.errors?.length;

  if (ok) {
    return { status: response.status, data, ok: true };
  }

  const errorDetail =
    data.errors?.map((e) => e.longMessage ?? e.message).join("; ") ||
    data.longMessage ||
    data.message ||
    `HTTP ${response.status}`;

  return { status: response.status, data, ok: false, errorDetail };
}
