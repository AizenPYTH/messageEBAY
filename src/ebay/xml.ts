export function firstTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  return match?.[1]?.trim();
}

export function allTagPairs(
  xml: string,
  nameTag: string,
  valueTag: string,
): Array<{ name: string; value: string }> {
  const re = new RegExp(
    `<${nameTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${nameTag}>\\s*<${valueTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${valueTag}>`,
    "gi",
  );
  const out: Array<{ name: string; value: string }> = [];
  for (const match of xml.matchAll(re)) {
    const name = match[1]?.trim();
    const value = match[2]?.trim();
    if (name && value) out.push({ name, value });
  }
  return out;
}

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function stripHtml(html: string): string {
  return decodeXmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
