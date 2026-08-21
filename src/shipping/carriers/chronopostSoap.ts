import type { CarrierEvent } from "./laposteSsu.js";

export type ChronopostTrackResult = {
  ok: true;
  statusLabel: string;
  lastEventLabel: string;
  events: CarrierEvent[];
  trackingUrl: string;
} | {
  ok: false;
  reason: string;
};

function parseTag(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const value = m[1];
    if (value == null) continue;
    out.push(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim());
  }
  return out;
}

/**
 * Chronopost public TrackingServiceWS (same stack eBay/FR carriers rely on).
 */
export async function trackViaChronopostSoap(
  trackingNumber: string,
): Promise<ChronopostTrackResult> {
  const id = trackingNumber.trim();
  const trackingUrl = `https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=${encodeURIComponent(id)}`;

  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cxf="http://cxf.tracking.soap.chronopost.fr/">
  <soapenv:Header/>
  <soapenv:Body>
    <cxf:trackSkybill>
      <language>fr_FR</language>
      <skybillNumber>${id}</skybillNumber>
    </cxf:trackSkybill>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const res = await fetch(
      "https://ws.chronopost.fr/tracking-cxf/TrackingServiceWS",
      {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "",
        },
        body: soap,
        signal: AbortSignal.timeout(8000),
      },
    );
    const xml = await res.text();
    if (!res.ok) {
      return { ok: false, reason: `Chronopost HTTP ${res.status}` };
    }

    const eventsXml = xml.match(
      /<listEventInfoCompilées?[\s\S]*?<\/listEventInfoCompilées?>|<listEvents[\s\S]*?<\/listEvents>|<eventInfoCompil[\s\S]*?<\/eventInfoCompil>/gi,
    );

    const events: CarrierEvent[] = [];
    // Simpler: pull paired eventDate + eventLabel / code
    const labels = parseTag(xml, "eventLabel").concat(
      parseTag(xml, "codeLibelle"),
      parseTag(xml, "libelle"),
    );
    const dates = parseTag(xml, "eventDate").concat(parseTag(xml, "date"));

    const max = Math.max(labels.length, 0);
    for (let i = 0; i < max; i++) {
      const label = labels[i]?.trim();
      if (!label) continue;
      events.push({
        label,
        date: dates[i],
      });
    }

    // Fallback: any meaningful French status strings in XML
    if (events.length === 0) {
      const status = parseTag(xml, "status")[0] || parseTag(xml, "errorMessage")[0];
      if (status && !/error|invalid/i.test(status)) {
        events.push({ label: status });
      }
    }

    if (events.length === 0) {
      void eventsXml;
      return { ok: false, reason: "aucun événement Chronopost" };
    }

    const last = events[0]!;
    return {
      ok: true,
      statusLabel: last.label,
      lastEventLabel: last.label,
      events,
      trackingUrl,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "erreur Chronopost",
    };
  }
}
