"use server";

import {
  fetchConversationDetail,
  fetchInboxList,
  generateAiReply,
  sendAiReply,
  syncConversation,
  type AiGenerationDto,
  type ActionResult,
  type ConversationDetailDto,
  type InboxListItemDto,
} from "@/server/conversations";

export async function listConversationsAction(): Promise<
  ActionResult<InboxListItemDto[]>
> {
  return fetchInboxList();
}

export async function getConversationAction(
  conversationId: string,
): Promise<ActionResult<ConversationDetailDto>> {
  return fetchConversationDetail(conversationId);
}

export async function generateReplyAction(
  conversationId: string,
): Promise<ActionResult<AiGenerationDto>> {
  return generateAiReply(conversationId);
}

export async function sendReplyAction(
  conversationId: string,
  messageText: string,
): Promise<ActionResult<{ messageId?: string }>> {
  return sendAiReply(conversationId, messageText);
}

export async function syncConversationAction(
  conversationId: string,
): Promise<ActionResult<{ messagesSaved: number }>> {
  return syncConversation(conversationId);
}
