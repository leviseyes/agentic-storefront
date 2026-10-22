import outdoor from "./examples/outdoor/storefront.js";
import coffee from "./examples/coffee/storefront.js";
import { defineStorefront } from "./shared/storefront.js";
// Change this export to defineStorefront(yourMerchant) to configure your store.
// `--mode coffee` is a second complete example, selected for both client and server.
const example =
  typeof __STOREFRONT_EXAMPLE__ === "string"
    ? __STOREFRONT_EXAMPLE__
    : "outdoor";
export const storefront = defineStorefront(
  example === "coffee" ? coffee : outdoor,
);
