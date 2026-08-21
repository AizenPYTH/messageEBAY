/**
 * When the model cannot answer usefully from facts, it must output this sentinel.
 * Autopilot / pipeline treat it as: send nothing.
 */
export const NO_REPLY_SENTINEL = "NO_REPLY";

/** True when the draft means "do not send anything". */
export function isAbstainReply(text: string | undefined): boolean {
  const raw = (text ?? "").trim();
  if (!raw) return true;
  if (/^NO_REPLY\b/i.test(raw)) return true;
  if (/^\[NO_REPLY\]\s*$/i.test(raw)) return true;
  // Model sometimes wraps: "NO_REPLY — pas assez d'info"
  if (/^NO_REPLY\b/i.test(raw.split("\n")[0]?.trim() ?? "")) return true;
  return false;
}
