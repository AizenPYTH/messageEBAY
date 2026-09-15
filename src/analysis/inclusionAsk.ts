import type { ListingDetails } from "../ebay/tradingApi.js";

export type InclusionVerdict = "yes" | "no" | "unknown";

export type InclusionPartAsk = {
  id: string;
  label: string;
  verdict: InclusionVerdict;
};

export type InclusionResolution = {
  asked: InclusionPartAsk[];
  hasUnknown: boolean;
};

const INCLUSION_CONTEXT =
  /\b(comprend|comprendre|inclut|inclure|inclus[es]?|include[sd]?|including|fourni|avec|come[s]?\s+with|does it (have|include)|a[- ]t[- ]il|a[- ]t[- ]elle|en avez[- ]vous un)\b/i;

type PartDef = {
  id: string;
  label: string;
  ask: RegExp;
  listed: RegExp;
  excluded: RegExp;
};

const PARTS: PartDef[] = [
  {
    id: "touchbar",
    label: "Touch Bar",
    ask: /\b(touch\s*bar|barre\s+tactile)\b/i,
    listed: /\b(touch\s*bar|barre\s+tactile)\b/i,
    excluded:
      /\b(sans|without|pas de|no)\s+(touch\s*bar|barre\s+tactile)\b/i,
  },
  {
    id: "trackpad",
    label: "trackpad",
    ask: /\b(trackpads?|touchpads?|pav[ée]s?\s+tactiles?)\b/i,
    listed: /\b(trackpads?|touchpads?)\b/i,
    excluded: /\b(sans|without|pas de|no)\s+(trackpads?|touchpads?)\b/i,
  },
];

const DENIES_INCLUSION =
  /\b(does not include|doesn['’]?t include|does not come with|n['’]inclut pas|n['’]a pas (de |la |le )?|pas (de |la |le )?(touch\s*bar|barre tactile|trackpad|touchpad)|just the top ?case|juste le top ?case|seulement le (top ?case|clavier)|as it is just the top|it is just the top case)\b/i;

function listingBlob(listing: ListingDetails | undefined): string {
  return [
    listing?.title ?? "",
    listing?.descriptionText ?? "",
    listing?.condition ?? "",
    ...(listing?.itemSpecifics ?? []).map((s) => `${s.name} ${s.value}`),
  ]
    .filter(Boolean)
    .join(" \n ");
}

export function askedInclusionParts(text: string | undefined): PartDef[] {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const mentionsPart = PARTS.some((p) => p.ask.test(raw));
  if (!mentionsPart) return [];
  if (!INCLUSION_CONTEXT.test(raw) && !/\b(comprend|inclut|include|fourni)\b/i.test(raw)) {
    return [];
  }
  return PARTS.filter((p) => p.ask.test(raw));
}

export function isInclusionAsk(text: string | undefined): boolean {
  return askedInclusionParts(text).length > 0;
}

export function resolveInclusionAsk(input: {
  message: string | undefined;
  listing: ListingDetails | undefined;
}): InclusionResolution {
  const asked = askedInclusionParts(input.message);
  const blob = listingBlob(input.listing);
  const resolved: InclusionPartAsk[] = asked.map((p) => {
    if (p.excluded.test(blob)) return { id: p.id, label: p.label, verdict: "no" };
    if (p.listed.test(blob)) return { id: p.id, label: p.label, verdict: "yes" };
    return { id: p.id, label: p.label, verdict: "unknown" };
  });
  return {
    asked: resolved,
    hasUnknown: resolved.some((p) => p.verdict === "unknown"),
  };
}

/** Listing is silent on at least one asked included part — do not guess. */
export function hasUnknownInclusionAsk(input: {
  message: string | undefined;
  listing: ListingDetails | undefined;
}): boolean {
  const r = resolveInclusionAsk(input);
  return r.asked.length > 0 && r.hasUnknown;
}

export function replyInventedInclusion(input: {
  reply: string | undefined;
  ask: string | undefined;
  listing: ListingDetails | undefined;
}): boolean {
  if (!isInclusionAsk(input.ask)) return false;
  const r = resolveInclusionAsk({
    message: input.ask,
    listing: input.listing,
  });
  if (!r.hasUnknown) return false;
  const body = input.reply ?? "";
  if (DENIES_INCLUSION.test(body)) return true;
  // Guessing "yes it includes" when the listing never says so is also invented.
  if (
    /\b(comprend|inclut|includes?|come[s]?\s+with|avec (la |le )?(touch|trackpad))\b/i.test(
      body,
    ) &&
    /\b(touch\s*bar|barre tactile|trackpad|touchpad)\b/i.test(body)
  ) {
    return true;
  }
  return false;
}

export function formatKnownInclusionReply(input: {
  resolution: InclusionResolution;
  languageCode?: string;
  signature?: string;
}): string | null {
  if (input.resolution.asked.length === 0 || input.resolution.hasUnknown) {
    return null;
  }
  const labels = input.resolution.asked.map((p) => p.label);
  const list =
    labels.length === 1
      ? labels[0]!
      : `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
  const allYes = input.resolution.asked.every((p) => p.verdict === "yes");
  const allNo = input.resolution.asked.every((p) => p.verdict === "no");
  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";
  const en = input.languageCode === "en";
  let body: string;
  if (allYes) {
    body = en
      ? `Yes, it includes the ${list}.`
      : `Oui, ${list} ${labels.length > 1 ? "sont inclus" : "est inclus"}.`;
  } else if (allNo) {
    body = en
      ? `No, it does not include the ${list} (as stated in the listing).`
      : `Non, ${list} ${labels.length > 1 ? "ne sont pas inclus" : "n'est pas inclus"} (selon l'annonce).`;
  } else {
    const yes = input.resolution.asked
      .filter((p) => p.verdict === "yes")
      .map((p) => p.label)
      .join(", ");
    const no = input.resolution.asked
      .filter((p) => p.verdict === "no")
      .map((p) => p.label)
      .join(", ");
    body = en
      ? `The listing includes ${yes}${no ? `, not ${no}` : ""}.`
      : `Selon l'annonce : ${yes} inclus${no ? `, pas ${no}` : ""}.`;
  }
  return en ? `Hi,\n\n${body}\n\n${sig}` : `Bonjour,\n\n${body}\n\n${sig}`;
}
