export type QuestionIntent =
  | "greeting"
  | "thanks"
  | "closed_question"
  | "information_request"
  | "technical"
  | "negotiation"
  | "return_request"
  | "after_sales"
  | "multi_question"
  | "other";

export type ResponseLength = "very_short" | "short" | "medium" | "long";

export type DetailLevel = "minimal" | "focused" | "detailed";

export type ClosedQuestionTopic =
  | "functional"
  | "available"
  | "condition"
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
};
