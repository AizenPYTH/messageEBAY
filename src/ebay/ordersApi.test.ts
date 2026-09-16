import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeOrder, findBuyerOrders, type SellerOrder } from "./ordersApi.js";

const orders: SellerOrder[] = [
  {
    orderId: "12-34-56",
    buyerUsername: "arapu17",
    creationDate: "2026-09-12T08:30:00.000Z",
    fulfillmentStatus: "NOT_STARTED",
    paymentStatus: "PAID",
    cancelState: "NONE_REQUESTED",
    lineItems: [
      { itemId: "318028100022", title: "Topcase MacBook Pro 14 A2442", quantity: 1 },
    ],
    trackingNumbers: [],
  },
  {
    orderId: "99-99-99",
    buyerUsername: "someone_else",
    creationDate: "2026-09-14T10:00:00.000Z",
    fulfillmentStatus: "FULFILLED",
    paymentStatus: "PAID",
    lineItems: [{ itemId: "999", title: "Ecran iPhone 13", quantity: 2 }],
    trackingNumbers: [],
  },
];

describe("commandes vendeur", () => {
  it("reads as one short French line", () => {
    assert.equal(
      describeOrder(orders[0]!),
      "Commande 12-34-56 du 2026-09-12 : Topcase MacBook Pro 14 A2442 — payée, pas encore expédiée",
    );
    assert.match(describeOrder(orders[1]!), /×2/);
  });

  it("finds this buyer's order and nobody else's", async () => {
    const found = await findBuyerOrders({
      buyerUsername: "arapu17",
      load: async () => orders,
    });
    assert.equal(found.length, 1);
    assert.equal(found[0]?.orderId, "12-34-56");
  });

  it("falls back to the conversation listing when the buyer is unknown", async () => {
    const found = await findBuyerOrders({
      itemId: "999",
      load: async () => orders,
    });
    assert.equal(found[0]?.orderId, "99-99-99");
  });

  it("asks for nothing when there is nothing to key on", async () => {
    assert.deepEqual(await findBuyerOrders({ load: async () => orders }), []);
  });

  it("flags a cancellation in progress", () => {
    assert.match(
      describeOrder({ ...orders[0]!, cancelState: "CANCEL_REQUESTED" }),
      /annulation : CANCEL_REQUESTED/,
    );
  });
});
