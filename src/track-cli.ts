import { isMainModule } from "./cli/isMain.js";
import { formatShipmentReply } from "./shipping/formatShipmentReply.js";
import { lookupTrackingStatus } from "./shipping/lookupTrackingStatus.js";
import { detectCarrierFamily } from "./shipping/carriers/detectCarrier.js";
import type { ShipmentResolution } from "./shipping/types.js";

function printHelp(): void {
  console.log(`
Test suivi colis SANS commande eBay

Usage:
  npm run track -- <numero_suivi> [transporteur]
  npm run track -- --demo not_shipped|shipped|stale
  npm run track -- <numero> [transporteur] [--follow-up]

Exemples:
  npm run track -- 6A12345678901 Colissimo
  npm run track -- 88000232272779Y --follow-up
  npm run track -- --demo stale

Astuce: prends un vrai n° sur une de TES commandes livrées (autre compte),
ou un colis que tu as reçu récemment, pour voir le statut La Poste / Chronopost.
`);
}

async function runDemo(kind: string): Promise<void> {
  let shipment: ShipmentResolution;
  let followUp = false;
  if (kind === "not_shipped") {
    shipment = { kind: "not_shipped" };
  } else if (kind === "shipped") {
    shipment = {
      kind: "shipped",
      trackingNumber: "6A00000000000",
      carrier: "Colissimo",
      shippedDate: "2026-08-04T10:00:00+02:00",
      trackingStatus: "in_transit",
      lastEventAt: "2026-08-04T21:00:00+02:00",
    };
  } else if (kind === "stale") {
    followUp = true;
    shipment = {
      kind: "shipped",
      trackingNumber: "6A00000000000",
      shippedDate: "2026-07-20T10:00:00+02:00",
      trackingStatus: "in_transit",
      lastEventAt: "2026-07-20T21:00:00+02:00",
    };
  } else {
    console.error(`Demo inconnue: ${kind} (not_shipped | shipped | stale)`);
    process.exit(1);
  }

  console.log("\n=== Réponse générée (sans eBay) ===\n");
  console.log(
    formatShipmentReply({
      shipment,
      languageCode: "fr",
      signature: "Test",
      followUp,
      nowMs: Date.parse("2026-08-06T12:00:00+02:00"),
    }),
  );
  console.log("");
}

async function runLookup(
  trackingNumber: string,
  carrier?: string,
  followUp = false,
): Promise<void> {
  const family = detectCarrierFamily(trackingNumber, carrier);
  console.log("\n=== Lookup transporteur (comme le clic suivi eBay) ===");
  console.log(`numéro     : ${trackingNumber}`);
  console.log(`transporteur hint : ${carrier ?? "(auto)"}`);
  console.log(`famille détectée  : ${family}`);
  console.log(`relance    : ${followUp ? "oui" : "non"}`);
  console.log("appel en cours…\n");

  const result = await lookupTrackingStatus({ trackingNumber, carrier });

  console.log(`source     : ${result.source}`);
  console.log(`statut     : ${result.status}`);
  console.log(`label      : ${result.statusLabel}`);
  console.log(`détail     : ${result.detailMessage}`);
  console.log(`produit    : ${result.product ?? "—"}`);
  console.log(`url        : ${result.trackingUrl}`);
  if (result.events?.length) {
    console.log("\névénements :");
    for (const event of result.events.slice(0, 8)) {
      console.log(`  - ${event.date ?? "?"} · ${event.label}`);
    }
  } else if (result.source === "link_only") {
    console.log(
      "\n(Aucun détail transporteur — vérifie le numéro ou réessaie.)",
    );
  }

  const shipment: ShipmentResolution = {
    kind: "shipped",
    trackingNumber,
    carrier: carrier ?? result.product,
    product: result.product,
    shippedDate: result.events?.at(-1)?.date ?? result.events?.[0]?.date,
    statusLabel: result.statusLabel,
    detailMessage: result.detailMessage,
    trackingStatus: result.status,
    lastEventAt: result.events?.[0]?.date,
    trackingUrl: result.trackingUrl,
  };

  console.log("\n=== Réponse qui serait proposée à l'acheteur ===\n");
  console.log(formatShipmentReply({ shipment, languageCode: "fr", followUp }));
  console.log("");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter(Boolean);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printHelp();
    return;
  }

  if (args[0] === "--demo") {
    await runDemo(args[1] ?? "shipped");
    return;
  }

  const followUp = args.includes("--follow-up");
  const positional = args.filter((a) => a !== "--follow-up");
  const trackingNumber = positional[0]!;
  const carrier = positional[1];
  await runLookup(trackingNumber, carrier, followUp);
}

if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
