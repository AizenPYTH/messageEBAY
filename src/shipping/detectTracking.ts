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
  /\b(toujours|pas)\s+arriv[eé]\b/i,
  /\bobjet\s+non\s+re[cç]u\b/i,
  /\bitem\s+not\s+received\b/i,
  // News / update on an existing order — FR « retours » = feedback, not a return.
  /\b(retours?|nouvelles?|infos?|informations?)\s+(par\s+rapport\s+[àa]|concernant|sur|de)\s+(ma\s+)?commande\b/i,
  /\binformations?\s+de\s+suivi\b/i,
  /\bany\s+(news|update)s?\s+(on|about)\s+(my\s+)?order\b/i,
  // Ship what was already ordered — not a catalog / stock ask.
  /\b(exp[ée]di(?:er|ez)|envoy(?:er|ez))\s+ce\s+que\s+(je\s+(vous\s+)?ai|j['’]ai)\s+command/i,
  /\b(exp[ée]di(?:er|ez)|envoy(?:er|ez))\s+(ma\s+)?commande\b/i,
  /\bship\s+what\s+i\s+ordered\b/i,
  /\bcan\s+you\s+(please\s+)?(ship|send)\s+(my\s+)?order\b/i,
  // Buyer says the last listing link was the wrong item.
  /\ble\s+lien\s+(ne\s+)?correspond\s+pas\b/i,
  /\blink\s+(doesn['’]?t|does\s+not)\s+match\b/i,
];

/** True when the buyer is asking about package / tracking status. */
export function isTrackingRequest(text: string | undefined): boolean {
  const raw = text?.trim() ?? "";
  if (!raw) return false;
  return TRACKING_PATTERNS.some((re) => re.test(raw));
}
