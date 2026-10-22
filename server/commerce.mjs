import {
  variantsOf,
  findVariant,
  publicCatalog,
} from "../shared/storefront.js";
export const MAX_QUANTITY = 20,
  MAX_LINES = 20;
const cartFields = `fragment StoreCart on Cart { id checkoutUrl totalQuantity cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } } lines(first:100) { nodes { id quantity cost { totalAmount { amount currencyCode } } merchandise { ... on ProductVariant { id title price { amount currencyCode } product { title handle } } } } } }`;
export const operations = {
  catalog: `query StoreCatalog($ids:[ID!]!, $country:CountryCode!) @inContext(country:$country) { nodes(ids:$ids) { ... on ProductVariant { id title availableForSale price { amount currencyCode } product { title handle description onlineStoreUrl featuredImage { url altText } } } } }`,
  get: `${cartFields} query StoreCartGet($id:ID!){cart(id:$id){...StoreCart}}`,
  create: `${cartFields} mutation StoreCartCreate($input:CartInput!){cartCreate(input:$input){cart{...StoreCart} userErrors{field message code} warnings{code message}}}`,
  update: `${cartFields} mutation StoreCartUpdate($cartId:ID!, $lines:[CartLineUpdateInput!]!){cartLinesUpdate(cartId:$cartId,lines:$lines){cart{...StoreCart} userErrors{field message code} warnings{code message}}}`,
  add: `${cartFields} mutation StoreCartAdd($cartId:ID!, $lines:[CartLineInput!]!){cartLinesAdd(cartId:$cartId,lines:$lines){cart{...StoreCart} userErrors{field message code} warnings{code message}}}`,
  remove: `${cartFields} mutation StoreCartRemove($cartId:ID!, $lineIds:[ID!]!){cartLinesRemove(cartId:$cartId,lineIds:$lineIds){cart{...StoreCart} userErrors{field message code} warnings{code message}}}`,
};
export function lineQuantity(cart, variantId) {
  return (
    cart?.lines.nodes.find(
      (line) => (line.merchandise.key || line.merchandise.id) === variantId,
    )?.quantity || 0
  );
}
export function safeCart(cart) {
  return cart
    ? {
        quantity: cart.totalQuantity,
        subtotal: cart.cost.subtotalAmount,
        total: cart.cost.totalAmount,
        lines: cart.lines.nodes.map((line) => ({
          variantId: line.merchandise.key || null,
          quantity: line.quantity,
          title: line.merchandise.product.title,
          variantTitle: line.merchandise.title,
          price: line.merchandise.price,
          total: line.cost?.totalAmount,
        })),
      }
    : null;
}
function quantityValid(quantity) {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY)
    throw Error(
      "Choose a quantity from 0 to " + MAX_QUANTITY + " for this option.",
    );
}
export function createDemoCommerce(merchant) {
  const catalog = publicCatalog(merchant),
    variants = variantsOf(catalog);
  const digits = new Intl.NumberFormat(merchant.locale, {
    style: "currency",
    currency: merchant.currency,
  }).resolvedOptions().maximumFractionDigits;
  const unit = 10 ** digits,
    money = (n) => ({
      amount: (n / unit).toFixed(digits),
      currencyCode: merchant.currency,
    });
  function make(
    lines,
    id = "demo." + btoa(JSON.stringify(lines)) + "." + crypto.randomUUID(),
  ) {
    let subtotal = 0;
    const nodes = Object.entries(lines)
      .filter(([, q]) => q > 0)
      .map(([key, quantity]) => {
        const variant = variants.find((v) => v.id === key);
        if (!variant) throw Error("Unknown sample option.");
        quantityValid(quantity);
        const total =
          Math.round(Number(variant.price.amount) * unit) * quantity;
        subtotal += total;
        return {
          id: "demo-line-" + key,
          quantity,
          merchandise: {
            id: key,
            key,
            title: variant.title,
            product: { title: variant.productTitle },
            price: variant.price,
          },
          cost: { totalAmount: money(total) },
        };
      });
    if (nodes.length > MAX_LINES)
      throw Error("Your cart can contain up to " + MAX_LINES + " options.");
    return {
      id,
      checkoutUrl: "/demo-checkout",
      totalQuantity: nodes.reduce((n, l) => n + l.quantity, 0),
      cost: { subtotalAmount: money(subtotal), totalAmount: money(subtotal) },
      lines: { nodes },
    };
  }
  async function get(id) {
    if (!id) return null;
    try {
      const [prefix, data] = id.split(".");
      if (prefix !== "demo") return null;
      const lines = JSON.parse(atob(data));
      if (!lines || Array.isArray(lines) || typeof lines !== "object")
        return null;
      return make(lines, id);
    } catch {
      return null;
    }
  }
  async function setLineQuantity(id, variantId, quantity) {
    quantityValid(quantity);
    const variant = findVariant(catalog, variantId);
    if (!variant) throw Error("That option is not in this catalog.");
    const cart = await get(id);
    if (id && !cart)
      throw Error(
        "Your previous cart is no longer available. Refresh before adding items.",
      );
    if (quantity > lineQuantity(cart, variantId) && !variant.available)
      throw Error("That option is currently unavailable.");
    const lines = Object.fromEntries(
      (cart?.lines.nodes || []).map((line) => [
        line.merchandise.key,
        line.quantity,
      ]),
    );
    if (quantity) lines[variantId] = quantity;
    else delete lines[variantId];
    return { cart: make(lines), warnings: [] };
  }
  return {
    catalog: async () => catalog,
    get,
    setLineQuantity,
    clear: async () => ({ cart: make({}), warnings: [] }),
  };
}
export function createShopifyCommerce(
  merchant,
  {
    shopDomain,
    privateToken = "",
    variantMap = {},
    buyerIp = "",
    fetchImpl = fetch,
  },
) {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain || ""))
    throw Error("Configure your canonical myshopify.com hostname.");
  const configured = variantsOf(merchant.products),
    toShop = new Map(),
    fromShop = new Map();
  for (const variant of configured) {
    const gid = variantMap[variant.id] || variant.shopifyId;
    if (!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(gid || ""))
      throw Error("Configure the Shopify variant ID for " + variant.id + ".");
    if (fromShop.has(gid))
      throw Error(
        "Each configured option must map to a different Shopify variant.",
      );
    toShop.set(variant.id, gid);
    fromShop.set(gid, variant.id);
  }
  const query = async (operation, variables) => {
    const response = await fetchImpl(
      `https://${shopDomain}/api/2026-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(privateToken
            ? { "Shopify-Storefront-Private-Token": privateToken }
            : {}),
          ...(buyerIp ? { "Shopify-Storefront-Buyer-IP": buyerIp } : {}),
        },
        body: JSON.stringify({ query: operation, variables }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.errors?.length || !result?.data)
      throw Error("The store could not connect. Please refresh and try again.");
    return result.data;
  };
  const decorate = (cart) => {
    if (cart)
      for (const line of cart.lines.nodes)
        line.merchandise.key = fromShop.get(line.merchandise.id) || null;
    return cart;
  };
  async function catalog() {
    const variants = new Map(),
      ids = [...toShop.values()];
    for (let start = 0; start < ids.length; start += 250) {
      const result = await query(operations.catalog, {
        ids: ids.slice(start, start + 250),
        country: merchant.country,
      });
      for (const variant of result.nodes || [])
        if (variant?.id) variants.set(variant.id, variant);
    }
    return merchant.products.map((product) => {
      let liveProduct;
      const choices = product.variants.map((variant) => {
        const live = variants.get(toShop.get(variant.id));
        if (!live || live.product.handle !== product.handle)
          throw Error(
            "The configured Shopify product/variant mapping does not match " +
              product.id +
              ".",
          );
        liveProduct = live.product;
        return {
          ...variant,
          available: live.availableForSale,
          price: live.price,
        };
      });
      return {
        ...product,
        aliases: [...(product.aliases || []), product.title],
        title: liveProduct.title,
        description: liveProduct.description || product.description,
        url: liveProduct.onlineStoreUrl,
        image: liveProduct.featuredImage
          ? {
              src: liveProduct.featuredImage.url,
              alt: liveProduct.featuredImage.altText || liveProduct.title,
            }
          : product.image,
        variants: choices,
      };
    });
  }
  async function get(id) {
    return id ? decorate((await query(operations.get, { id })).cart) : null;
  }
  async function mutate(operation, variables, key) {
    const result = (await query(operation, variables))[key];
    if (result.userErrors?.length || !result.cart)
      throw Error(
        result.userErrors?.[0]?.message || "The cart could not update.",
      );
    return {
      cart: decorate(result.cart),
      warnings: (result.warnings || []).map((w) => w.message),
    };
  }
  async function setLineQuantity(id, variantId, quantity) {
    quantityValid(quantity);
    if (!toShop.has(variantId))
      throw Error("That option is not in the configured catalog.");
    const cart = await get(id);
    if (id && !cart)
      throw Error("Your previous cart expired. Refresh before adding items.");
    const line = cart?.lines.nodes.find(
      (line) => line.merchandise.key === variantId,
    );
    if (!quantity && !line) return { cart, warnings: [] };
    if (!line && quantity && cart?.lines.nodes.length >= MAX_LINES)
      throw Error("Your cart can contain up to " + MAX_LINES + " options.");
    if (quantity > (line?.quantity || 0)) {
      const variant = findVariant(await catalog(), variantId);
      if (!variant?.available)
        throw Error("That option is currently unavailable.");
    }
    if (!cart)
      return mutate(
        operations.create,
        {
          input: {
            buyerIdentity: { countryCode: merchant.country },
            lines: [{ merchandiseId: toShop.get(variantId), quantity }],
          },
        },
        "cartCreate",
      );
    if (!quantity)
      return mutate(
        operations.remove,
        { cartId: cart.id, lineIds: [line.id] },
        "cartLinesRemove",
      );
    if (line)
      return mutate(
        operations.update,
        { cartId: cart.id, lines: [{ id: line.id, quantity }] },
        "cartLinesUpdate",
      );
    return mutate(
      operations.add,
      {
        cartId: cart.id,
        lines: [{ merchandiseId: toShop.get(variantId), quantity }],
      },
      "cartLinesAdd",
    );
  }
  async function clear(id) {
    const cart = await get(id);
    if (!cart?.lines.nodes.length) return { cart, warnings: [] };
    return mutate(
      operations.remove,
      { cartId: cart.id, lineIds: cart.lines.nodes.map((line) => line.id) },
      "cartLinesRemove",
    );
  }
  return { catalog, get, setLineQuantity, clear };
}
