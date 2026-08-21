import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGetItemListing } from "./tradingApi.js";

describe("parseGetItemListing", () => {
  it("parses variation stock and shipping options", () => {
    const xml = `<?xml version="1.0"?>
<GetItemResponse>
  <Ack>Success</Ack>
  <Item>
    <ItemID>123</ItemID>
    <Title>Surface Pro</Title>
    <ListingStatus>Active</ListingStatus>
    <Quantity>10</Quantity>
    <SellingStatus><QuantitySold>3</QuantitySold></SellingStatus>
    <DispatchTimeMax>2</DispatchTimeMax>
    <Currency>EUR</Currency>
    <ItemSpecifics>
      <NameValueList><Name>Marque</Name><Value>Microsoft</Value></NameValueList>
    </ItemSpecifics>
    <Variations>
      <Variation>
        <SKU>SP8</SKU>
        <Quantity>4</Quantity>
        <SellingStatus><QuantitySold>4</QuantitySold></SellingStatus>
        <VariationSpecifics>
          <NameValueList><Name>Modèle</Name><Value>Surface Pro 8</Value></NameValueList>
        </VariationSpecifics>
      </Variation>
      <Variation>
        <SKU>SP7</SKU>
        <Quantity>6</Quantity>
        <SellingStatus><QuantitySold>1</QuantitySold></SellingStatus>
        <VariationSpecifics>
          <NameValueList><Name>Modèle</Name><Value>Surface Pro 7</Value></NameValueList>
        </VariationSpecifics>
      </Variation>
    </Variations>
    <ShippingDetails>
      <ShippingServiceOptions>
        <ShippingService>FR_Colissimo</ShippingService>
        <ShippingServiceCost>4.90</ShippingServiceCost>
        <ShippingTimeMin>2</ShippingTimeMin>
        <ShippingTimeMax>4</ShippingTimeMax>
      </ShippingServiceOptions>
    </ShippingDetails>
  </Item>
</GetItemResponse>`;

    const listing = parseGetItemListing(xml, "123");
    assert.equal(listing.variations.length, 2);
    assert.equal(listing.variations[0]?.quantityAvailable, 0);
    assert.equal(listing.variations[1]?.quantityAvailable, 5);
    assert.equal(listing.quantityAvailable, 5);
    assert.equal(listing.dispatchTimeMax, "2");
    assert.equal(listing.shippingOptions[0]?.service, "FR_Colissimo");
    assert.equal(listing.shippingOptions[0]?.international, false);
    assert.equal(listing.itemSpecifics[0]?.value, "Microsoft");
  });

  it("marks InternationalShippingServiceOption as international", () => {
    const xml = `<?xml version="1.0"?>
<GetItemResponse>
  <Ack>Success</Ack>
  <Item>
    <ItemID>123</ItemID>
    <Title>Carte E/S</Title>
    <ListingStatus>Active</ListingStatus>
    <Quantity>1</Quantity>
    <Currency>EUR</Currency>
    <ShippingDetails>
      <ShippingServiceOptions>
        <ShippingService>FR_Tracked</ShippingService>
        <ShippingServiceCost>0.0</ShippingServiceCost>
      </ShippingServiceOptions>
      <InternationalShippingServiceOption>
        <ShippingService>EU_Standard</ShippingService>
        <ShippingServiceCost>8.50</ShippingServiceCost>
      </InternationalShippingServiceOption>
    </ShippingDetails>
  </Item>
</GetItemResponse>`;
    const listing = parseGetItemListing(xml, "123");
    assert.equal(listing.shippingOptions[0]?.international, false);
    assert.equal(listing.shippingOptions[0]?.cost, "0.0");
    assert.equal(listing.shippingOptions[1]?.international, true);
    assert.equal(listing.shippingOptions[1]?.cost, "8.50");
  });
});
