/**
 * La Poste SUN public tracking API
 * (same backend as https://www.laposte.fr/outils/suivre-vos-envois)
 * Covers Colissimo, Chronopost, Envoi suivi, etc.
 */

export type CarrierEvent = {
  date?: string;
  label: string;
  code?: string;
};

export type LaposteTrackResult =
  | {
      ok: true;
      product?: string;
      statusCode?: string;
      statusLabel: string;
      lastEventLabel: string;
      isFinal?: boolean;
      events: CarrierEvent[];
      trackingUrl: string;
    }
  | {
      ok: false;
      reason: string;
    };

type SunShipment = {
  idShip?: string;
  product?: string;
  isFinal?: boolean;
  entryDate?: string;
  event?: Array<{
    label?: string;
    date?: string;
    code?: string;
    country?: string;
  }>;
  timeline?: Array<{
    shortLabel?: string;
    longLabel?: string;
    date?: string;
    status?: boolean;
    code?: string;
  }>;
};

type SunResponseItem = {
  returnCode?: number;
  returnMessage?: string;
  shipment?: SunShipment;
};

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function pickEvents(shipment: SunShipment): CarrierEvent[] {
  const fromEvents = asArray(shipment.event)
    .map((e) => {
      const label = (e.label ?? "").trim();
      if (!label) return null;
      return {
        label,
        ...(e.date ? { date: e.date } : {}),
        ...(e.code ? { code: e.code } : {}),
      } satisfies CarrierEvent;
    })
    .filter((e): e is CarrierEvent => Boolean(e));

  if (fromEvents.length > 0) return fromEvents;

  return asArray(shipment.timeline)
    .filter((t) => Boolean(t.shortLabel?.trim() || t.longLabel?.trim()))
    .map((t) => ({
      label: (t.shortLabel || t.longLabel || "").trim(),
      ...(t.date ? { date: t.date } : {}),
      ...(t.code ? { code: t.code } : {}),
    }));
}

/**
 * Fetch live tracking via La Poste SUN back API (no Okapi key required).
 */
export async function trackViaLaposteSsu(
  trackingNumber: string,
): Promise<LaposteTrackResult> {
  const id = trackingNumber.trim().replace(/%/g, "");
  const trackingUrl = `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(id)}`;

  try {
    const apiUrl = new URL(
      `https://www.laposte.fr/ssu/sun/back/suivi-unifie/${encodeURIComponent(id)}`,
    );
    // IMPORTANT: lang must be "fr" / "en" — not "fr_FR"
    apiUrl.searchParams.set("lang", "fr");

    const apiRes = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        Origin: "https://www.laposte.fr",
        Referer: "https://www.laposte.fr/ssu/sun/front/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    const rawText = await apiRes.text();
    if (!apiRes.ok) {
      return {
        ok: false,
        reason: `SUN HTTP ${apiRes.status}: ${rawText.slice(0, 160)}`,
      };
    }

    const data = JSON.parse(rawText) as SunResponseItem | SunResponseItem[];
    const item = asArray(data)[0];
    if (!item) {
      return { ok: false, reason: "réponse SUN vide" };
    }
    if (item.returnCode && item.returnCode !== 200) {
      return {
        ok: false,
        reason: item.returnMessage || `returnCode ${item.returnCode}`,
      };
    }

    const shipment = item.shipment;
    if (!shipment) {
      return { ok: false, reason: "pas de shipment dans la réponse" };
    }

    const events = pickEvents(shipment);
    const last = events[0];
    const activeTimeline = asArray(shipment.timeline)
      .filter((t) => t.status && (t.shortLabel || t.longLabel))
      .at(-1);
    const statusLabel =
      activeTimeline?.shortLabel?.trim() ||
      last?.label ||
      shipment.product ||
      "Suivi disponible";
    const lastEventLabel = last?.label || statusLabel;

    return {
      ok: true,
      product: shipment.product,
      statusCode: last?.code,
      statusLabel,
      lastEventLabel,
      isFinal: Boolean(shipment.isFinal),
      events,
      trackingUrl,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "erreur La Poste SUN",
    };
  }
}

/**
 * Official La Poste Okapi API (optional env LAPOSTE_OKAPI_KEY).
 */
export async function trackViaLaposteOkapi(
  trackingNumber: string,
  apiKey: string,
): Promise<LaposteTrackResult> {
  const id = trackingNumber.trim();
  const trackingUrl = `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(id)}`;
  try {
    const res = await fetch(
      `https://api.laposte.fr/suivi/v2/idships/${encodeURIComponent(id)}?lang=fr_FR`,
      {
        headers: {
          Accept: "application/json",
          "X-Okapi-Key": apiKey,
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) {
      return { ok: false, reason: `Okapi HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      shipment?: SunShipment & { status?: string };
      returnCode?: number;
    };
    const shipment = data.shipment ?? {};
    const events = pickEvents(shipment);
    const last = events[0];
    const statusLabel =
      String(shipment.status ?? "").trim() || last?.label || "Suivi disponible";

    return {
      ok: true,
      product: shipment.product,
      statusCode: shipment.status ? String(shipment.status) : undefined,
      statusLabel,
      lastEventLabel: last?.label || statusLabel,
      isFinal: Boolean(shipment.isFinal),
      events,
      trackingUrl,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "erreur Okapi",
    };
  }
}
