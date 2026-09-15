/**
 * Regression tests replayed from real eBay threads that produced a bad reply.
 *
 * Each case is a message the shop actually sent to a buyer. They run the whole
 * pipeline with fake ports, so no network and no OpenAI call is involved — the
 * LLM port throws, which also proves these answers are decided by our own code
 * and never by the prompt.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeMessage,
  enrichResponsePlanWithListing,
} from "../analysis/index.js";
import type { AssistantContext } from "../context/buildContext.js";
import type { EbayMessage } from "../ebay/messageApi.js";
import type { ListingDetails } from "../ebay/tradingApi.js";
import { buildPrompt } from "../prompt/buildPrompt.js";
import { runAiPipeline } from "./pipeline.js";
import type { AiEngineDeps } from "./types.js";

const SELLER = "snowolf";
const BUYER = "sicam_53";

type CatalogRow = {
  itemId: string;
  title: string;
  quantityAvailable: number;
};

function listing(partial: Partial<ListingDetails>): ListingDetails {
  return {
    itemId: "318028174968",
    itemSpecifics: [],
    variations: [],
    shippingOptions: [],
    rawAvailable: true,
    listingStatus: "Active",
    quantityAvailable: 3,
    ...partial,
  };
}

function buyerMessages(bodies: string[]): EbayMessage[] {
  return bodies.map((messageBody, index) => ({
    messageId: `m${index}`,
    messageBody,
    senderUsername: BUYER,
    recipientUsername: SELLER,
    createdDate: new Date(Date.now() - (bodies.length - index) * 60000).toISOString(),
    readStatus: false,
  }));
}

/**
 * Catalog port that behaves like the real one: it scores on shared words, which
 * is exactly how an unrelated listing used to surface. The pipeline must reject
 * the wrong rows itself rather than trust what the search hands it.
 */
function fakeCatalog(rows: CatalogRow[]): NonNullable<AiEngineDeps["searchCatalog"]> {
  return async () =>
    rows.map((row, index) => ({
      ...row,
      itemUrl: `https://www.ebay.fr/itm/${row.itemId}`,
      score: rows.length - index,
    }));
}

function deps(input: {
  listing: ListingDetails;
  messages: EbayMessage[];
  catalog?: CatalogRow[];
  /** Draft the model returns, for the cases that legitimately reach it. */
  llmDraft?: string;
}): AiEngineDeps {
  const context: AssistantContext = {
    conversationId: "c1",
    listingItemId: input.listing.itemId,
    listing: input.listing,
    messages: input.messages,
    latestMessage: input.messages[input.messages.length - 1],
    notes: [],
    promptContext: "",
  };

  return {
    loadContext: async () => context,
    loadSellerProfile: async () => null,
    analyzeMessage: ({ text, listing: l }) =>
      enrichResponsePlanWithListing(analyzeMessage(text), text, l),
    searchSimilarConversations: async () => [],
    toPromptSimilarSnippets: () => [],
    buildPrompt,
    completeChat: async () => {
      if (input.llmDraft == null) {
        throw new Error("the LLM must not be reached in these cases");
      }
      return { text: input.llmDraft, raw: {} };
    },
    ...(input.catalog ? { searchCatalog: fakeCatalog(input.catalog) } : {}),
    defaultModel: "test-model",
  };
}

async function run(input: Parameters<typeof deps>[0]): Promise<string> {
  const result = await runAiPipeline(deps(input), {
    conversationId: "c1",
    sellerUsername: SELLER,
  }).catch((error: unknown) => {
    // Reaching the LLM is itself the failure we are guarding against.
    throw error instanceof Error ? error : new Error(String(error));
  });
  return result.reply ?? "";
}

describe("sicam_53 — Samsung A137F asked on an A135F listing", () => {
  const A135F = listing({
    title: "Ecran Complet Galaxy A13 4G (A135F) (Avec châssis)",
    descriptionText: "Ecran complet avec châssis pour Galaxy A13 4G A135F.",
  });
  const thread = buyerMessages([
    "Bonjour",
    "Bonjour,",
    "Vous avez un écran Samsung a 13 4g modèle a137F?",
  ]);
  const catalog: CatalogRow[] = [
    { itemId: "318081183144", title: "Ecran Complet iPhone 13 (Incell)", quantityAvailable: 5 },
    { itemId: "318028116955", title: "Ecran Complet Noir Redmi 7 (avec châssis)", quantityAvailable: 2 },
  ];

  it("never offers an iPhone or a Redmi on a Samsung question", async () => {
    const reply = await run({ listing: A135F, messages: thread, catalog });
    assert.doesNotMatch(reply, /iphone/i);
    assert.doesNotMatch(reply, /redmi/i);
    assert.doesNotMatch(reply, /318081183144|318028116955/);
  });

  it("never claims the A135F listing answers an A137F question", async () => {
    const reply = await run({ listing: A135F, messages: thread, catalog });
    assert.doesNotMatch(reply, /est tjr dispo/i);
  });

  it("does not recite same-day shipping that nobody asked about", async () => {
    const reply = await run({ listing: A135F, messages: thread, catalog });
    assert.doesNotMatch(reply, /avant 15h/i);
  });

  it("blocks the message that was actually sent, whatever the model drafts", async () => {
    // The exact reply the shop sent on 2025-09-15, fed back in as the draft.
    const sent = [
      "Bonjour,",
      "",
      "Oui le écran est tjr dispo, envoi le jour même avant 15h (sauf samedi et dimanche). Oui on a iPhone 13 en stock, voici le lien : https://www.ebay.fr/itm/318081183144",
      "",
      "Cordialement,",
      "SNOWOLF",
    ].join("\n");

    const reply = await run({
      listing: A135F,
      messages: buyerMessages([
        "Vous avez un écran Samsung a 13 4g modèle a137F?",
        "Non je vous ai dit Samsung Galaxy à 13 4g modèle137F",
      ]),
      catalog,
      llmDraft: sent,
    });
    assert.equal(reply, "", "an iPhone answer to a Samsung question must never be sent");
  });
});

describe("sicam_53 — iPhone 11 Pro Max on a multi-model listing", () => {
  it("does not answer for the iPhone 11 when the Pro Max was asked", async () => {
    const reply = await run({
      listing: listing({
        itemId: "318028100001",
        title: "Ecran Complet iPhone 11 (Incell)",
        descriptionText: "Ecran complet iPhone 11.",
        quantityAvailable: 0,
      }),
      messages: buyerMessages(["Vous avez un écran iPhone 11 Pro Max ?"]),
      catalog: [
        { itemId: "318028100002", title: "Ecran Complet iPhone 11 (Incell)", quantityAvailable: 0 },
      ],
    });
    assert.doesNotMatch(reply, /oui/i);
  });

  it("offers the Pro Max listing when that is the one in stock", async () => {
    const reply = await run({
      listing: listing({
        itemId: "318028100001",
        title: "Ecran Complet iPhone 11 (Incell)",
        quantityAvailable: 0,
      }),
      messages: buyerMessages(["Vous avez un écran iPhone 11 Pro Max ?"]),
      catalog: [
        {
          itemId: "318028100003",
          title: "Ecran Complet iPhone 11 Pro Max (Incell)",
          quantityAvailable: 4,
        },
      ],
    });
    assert.match(reply, /11 Pro Max/i);
    assert.match(reply, /318028100003/);
  });
});

describe("domdelaloge — sold-out listing, stock elsewhere", () => {
  it("links the other listing instead of saying we have none at all", async () => {
    const reply = await run({
      listing: listing({
        itemId: "318028100010",
        title: "Ecran MacBook Pro 13 A1989 Gris",
        quantityAvailable: 0,
        listingStatus: "Completed",
      }),
      messages: buyerMessages(["Bonjour, avez-vous encore cet écran A1989 ?"]),
      catalog: [
        {
          itemId: "318028100011",
          title: "Ecran MacBook Pro 13 A1989 Argent",
          quantityAvailable: 2,
        },
      ],
    });
    assert.match(reply, /318028100011/);
    assert.doesNotMatch(reply, /plus (aucun|de) A1989/i);
  });
});

describe("mob205 — iPhone SE aux enchères", () => {
  const auction = listing({
    itemId: "318028100020",
    title: "iPhone SE 64Go",
    listingType: "Chinese",
    bidCount: 3,
    price: "51.00",
    currency: "EUR",
  });

  it("refuses Buy It Now, gives the live price, keeps payment on eBay", async () => {
    const reply = await run({
      listing: auction,
      messages: buyerMessages([
        "Bonjour, achat immédiat possible ? Quel prix, et vous acceptez PayPal ?",
      ]),
    });
    assert.match(reply, /Non, c'est une enchère/i);
    assert.match(reply, /51 €/);
    assert.match(reply, /uniquement sur eBay/i);
  });
});

describe("amhelat_0 — offres sur un écran 16\" à 459 €", () => {
  const screen = listing({
    itemId: "318028100021",
    title: "Ecran MacBook Pro 16 Grade B A2141",
    price: "459.00",
    currency: "EUR",
  });

  it("holds the price without jargon and without asking for another offer", async () => {
    for (const ask of ["je vous en propose 340 €", "C'est quoi votre dernier prix ?"]) {
      const reply = await run({ listing: screen, messages: buyerMessages([ask]) });
      assert.match(reply, /459 €/, ask);
      assert.doesNotMatch(reply, /n'est pas autoris/i, ask);
      assert.doesNotMatch(reply, /faites une (proposition|offre)/i, ask);
      assert.doesNotMatch(reply, /Grade A/i, ask);
    }
  });
});

describe("arapu17 — commande déjà passée", () => {
  it("never answers a tracking question with another listing", async () => {
    const reply = await run({
      listing: listing({ itemId: "318028100022", title: "Topcase MacBook Pro 14 A2442" }),
      messages: buyerMessages([
        "Bonjour, avez-vous des retours par rapport à ma commande ? Pouvez-vous expédier ce que j'ai commandé",
      ]),
      catalog: [
        { itemId: "318028100099", title: "Clavier MacBook Pro 13 A1989", quantityAvailable: 5 },
      ],
      // The exact shape of the bad reply that went out on this thread.
      llmDraft:
        "Bonjour,\n\nOui on a retours par rapport à ma commande en stock, voici le lien : https://www.ebay.fr/itm/318028100099\n\nCordialement,\nSNOWOLF",
    });
    assert.equal(reply, "");
  });
});

describe("mamulti0 — ce qu'il y a dans le lot", () => {
  it("leaves it to the seller when only the photos could answer", async () => {
    const reply = await run({
      listing: listing({
        itemId: "318028100023",
        title: "Topcase MacBook Pro 13 A2338 Gris",
        descriptionText: "Topcase complet pour A2338.",
      }),
      messages: buyerMessages([
        "Bonjour, est-ce que la Touch Bar et le trackpad sont inclus ?",
      ]),
    });
    assert.equal(reply, "");
  });
});

describe("hl5198 — le fil est clos", () => {
  it("says nothing more after 'Ok merci'", async () => {
    const reply = await run({
      listing: listing({ itemId: "318028100024", title: "SSD 512 Go" }),
      messages: buyerMessages(["Vous pouvez annuler la commande ?", "Ok merci"]),
    });
    assert.equal(reply, "");
  });

  it("still answers a question asked after an ack", async () => {
    const reply = await run({
      listing: listing({
        itemId: "318028100025",
        title: "Ecran Complet iPhone 13 (Incell)",
      }),
      messages: buyerMessages(["Ok merci", "Et vous avez l'écran iPhone 13 ?"]),
      catalog: [],
      llmDraft: "Bonjour,\n\nOui c'est dispo.\n\nCordialement,\nSNOWOLF",
    });
    assert.notEqual(reply, "");
  });
});
