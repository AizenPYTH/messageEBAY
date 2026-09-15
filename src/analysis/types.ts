export type QuestionIntent =
  | "greeting"
  | "thanks"
  | "closed_question"
  | "information_request"
  | "technical"
  | "negotiation"
  | "return_request"
  | "after_sales"
  | "shipping_tracking"
  | "multi_question"
  | "other";

export type ResponseLength = "very_short" | "short" | "medium" | "long";

export type DetailLevel = "minimal" | "focused" | "detailed";

export type ClosedQuestionTopic =
  | "functional"
  | "available"
  | "condition"
  | "oem_generic"
  | "battery_original"
  | "charger_included"
  | "keyboard_layout"
  | "compatible"
  | "unlocked"
  | "firm_price"
  | "fast_shipping"
  | "other_closed";

/** Whether the listing explicitly supports a direct answer. */
export type ListingAnswerability = "direct_yes" | "direct_no" | "unknown";

export type ResponsePlan = {
  intent: QuestionIntent;
  /** Human-readable intent label (FR). */
  intentLabel: string;
  isSimpleQuestion: boolean;
  isMultiQuestion: boolean;
  questionCount: number;
  recommendedLength: ResponseLength;
  /** Approx max words for the reply body (excluding signature). */
  maxWords: number;
  detailLevel: DetailLevel;
  /** If true, avoid restating listing title/specs/price unless asked. */
  avoidListingRecap: boolean;
  /** Prefer compact listing context in the prompt. */
  compactListingContext: boolean;
  languageCode: "fr" | "en" | "es" | "ar" | "unknown";
  languageLabel: string;
  reasons: string[];
  /** Topic of a short closed question, when detected. */
  closedQuestionTopic?: ClosedQuestionTopic;
  /** Can we answer from listing facts? */
  listingAnswerability?: ListingAnswerability;
  /** Listing signals used for the decision. */
  listingEvidence?: string[];
  /** Natural short reply hint for the model when answerability is direct. */
  suggestedDirectReply?: string;
  /** True when the seller must intervene (photos, phone, dispute…). */
  needsSellerIntervention?: boolean;
  /** Machine reason code for escalation. */
  escalationReason?: string;
  /** Human-readable escalation / case summary for Rapports. */
  escalationLabel?: string;
  /** Deterministic reply kind (no LLM), e.g. partial refund offer. */
  autoReplyKind?:
    | "partial_refund_10"
    | "ask_packaging_photos"
    | "wrong_address_cancel"
    | "refuse_pickup"
    | "color_preference_return"
    | "return_address"
    | "warranty";
};
