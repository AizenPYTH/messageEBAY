import { config } from "../config.js";
import { firstTag } from "./xml.js";

/**
 * Username of the eBay account tied to the current user access token.
 */
export async function getAuthenticatedUsername(): Promise<string | undefined> {
  if (!config.accessToken) return undefined;

  const endpoint =
    config.env === "production"
      ? "https://api.ebay.com/ws/api.dll"
      : "https://api.sandbox.ebay.com/ws/api.dll";

  const body = `<?xml version="1.0" encoding="utf-8"?>
<GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
</GetUserRequest>`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-CALL-NAME": "GetUser",
      "X-EBAY-API-SITEID": "71",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1271",
      "X-EBAY-API-IAF-TOKEN": config.accessToken,
    },
    body,
  });

  const xml = await response.text();
  return firstTag(xml, "UserID");
}
