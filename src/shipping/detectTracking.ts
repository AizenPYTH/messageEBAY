const TRACKING_PATTERNS: RegExp[] = [
  /\bo[uù]\s+est\s+(mon|le|ma|la)\s+(colis|commande|paquet|envoi)\b/i,
  /\bsuivi\b/i,
  /\btracking\b/i,
  /\bnum[eé]ro\s+de\s+suivi\b/i,
  /\btracking\s+number\b/i,
  /\bwhere\s+is\s+(my\s+)?(package|order|parcel|shipment)\b/i,
  /\bhas\s+(it|my\s+order)\s+shipped\b/i,
  /\b(colis|commande|paquet)\s+(envoy[eé]|exp[eé]di[eé]|parti|livr[eé])\b/i,
  /\b(exp[eé]di[eé]|envoy[eé]|livr[eé])\s*\?/i,
  /\bquand\s+(partez|parte|arrive|arriv)\b/i,
  /\bshipment\s+status\b/i,
  /\bdelivery\s+status\b/i,
  // Buyer says not received / not arrived — treat as tracking, not dispute advice.
  /\b(pas|jamais|toujours\s+pas)\s+(re[cç]u|arriv[eé]|eu)\b/i,
  /\b(n['’]ai|nai|n['’]a)\s+pas\s+(re[cç]u|eu)\b/i,
  /\b(not|never|still\s+not)\s+(received|arrived|got)\b/i,
  /\b(haven['’]?t|have\s+not)\s+(received|got|gotten)\b/i,
  /\b(toujours|pas)\s+arriv[eé]e?s?(?![\\w\\u00c0-\\u024f])/i,
  /\bobjet\s+non\s+re[cç]u\b/i,
  /\bitem\s+not\s+received\b/i,
];

/** True when the buyer is asking about package / tracking status. */
export function isTrackingRequest(text: string | undefined): boolean {
  const raw = text?.trim() ?? "";
  if (!raw) return false;
  return TRACKING_PATTERNS.some((re) => re.test(raw));
}
