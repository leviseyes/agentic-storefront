import { variantsOf, findVariant, formatMoney } from "../shared/storefront.js";
import { MAX_QUANTITY, lineQuantity } from "./commerce.mjs";
const words = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};
const normal = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[()?,.!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text, name) =>
  new RegExp(
    "(?:^|\\W)" + escape(normal(name)) + "(?:s|es)?(?:$|\\W)",
    "i",
  ).test(text);
const currentView = (state) =>
  typeof state.messages?.at(-1)?.presentation === "object"
    ? state.messages.at(-1).presentation.view
    : state.messages?.at(-1)?.presentation;
export function resolveProduct(text, products) {
  const s = normal(text);
  return products.filter((p) =>
    [p.id, p.title, ...(p.aliases || [])].some((name) => has(s, name)),
  );
}
export function resolveCartChange(state, input, products) {
  const text = normal(input),
    base = text.replace(
      /^(?:(?:yes|okay|ok)\s+)?(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:just\s+)?/,
      "",
    );
  const negated =
    /\b(don't|dont|do not|never|not yet|without|avoid|maybe|might|if i|how (?:do|can|would)|explain|what happens)\b/.test(
      text,
    );
  if (negated) return null;
  const pending = state.pendingCart;
  const pendingProduct =
    pending && products.find((p) => p.id === pending.productId);
  const confirmed = pendingProduct?.variants.find((v) =>
    [normal(v.title), normal(v.id), "the " + normal(v.title) + " one"].includes(
      text,
    ),
  );
  if (confirmed)
    return resolveCartChange(
      {
        ...state,
        pendingCart: null,
        selectedProductId: pendingProduct.id,
        selectedVariantId: confirmed.id,
      },
      pending.request,
      products,
    );
  if (/^(?:empty|clear)(?: my| the)? (?:cart|bag)$/.test(base))
    return { clear: true };
  const verb = base.match(
    /^(add|remove|take|set|change|update|make|i want|i'd like|i would like)\b/,
  )?.[1];
  if (!verb) return null;
  if (/-\s*\d/.test(text)) return { clarify: "quantity" };
  let matches = resolveProduct(text, products);
  const namedVariants = variantsOf(products).filter(
    (v) => has(text, v.id) || has(text, v.title),
  );
  if (
    !matches.length &&
    new Set(namedVariants.map((v) => v.productId)).size === 1
  )
    matches = products.filter((p) => p.id === namedVariants[0].productId);
  // A bare desire is not a quantity request. Never infer count from a product specification.
  let quantityText = text;
  for (const product of matches)
    for (const name of [product.id, product.title, ...(product.aliases || [])])
      quantityText = quantityText.replace(
        new RegExp(
          "(?:^|\\W)" + escape(normal(name)) + "(?:s|es)?(?=$|\\W)",
          "gi",
        ),
        " ",
      );
  for (const variant of namedVariants)
    quantityText = quantityText.replace(
      new RegExp(escape(normal(variant.title)), "gi"),
      " ",
    );
  quantityText = quantityText.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g,
    (w) => String(words[w]),
  );
  const count = quantityText.match(
    /\b(\d{1,4})\b(?!\s*(?:ml|l|liters?|litres?|oz|lbs?|pounds?|inches|cm|mm)\b)/,
  )?.[1];
  if (["i want", "i'd like", "i would like"].includes(verb) && !count)
    return null;
  if (["set", "change", "update", "make"].includes(verb) && !count)
    return { clarify: "quantity" };
  if (!matches.length) {
    const referenced =
      state.lastCartVariantId && currentView(state) === "cart"
        ? findVariant(products, state.lastCartVariantId)
        : null;
    const selected = findVariant(products, state.selectedVariantId);
    const onlyLine =
      state.cart?.lines.nodes.length === 1
        ? findVariant(products, state.cart.lines.nodes[0].merchandise.key)
        : null;
    const referent = referenced || selected || onlyLine;
    if (referent) matches = products.filter((p) => p.id === referent.productId);
    else if (products.length === 1) matches = products;
  }
  if (matches.length !== 1)
    return {
      clarify: "product",
      quantity: count ? Number(count) : 1,
      productIds: matches.map((p) => p.id),
    };
  const product = matches[0],
    explicit = namedVariants.filter((v) => v.productId === product.id);
  let variant = explicit.length === 1 ? explicit[0] : null;
  if (explicit.length > 1)
    return {
      clarify: "variant",
      productId: product.id,
      quantity: count ? Number(count) : 1,
    };
  if (!variant && state.selectedProductId === product.id)
    variant = product.variants.find((v) => v.id === state.selectedVariantId);
  if (!variant && product.variants.length === 1) variant = product.variants[0];
  if (!variant)
    return {
      clarify: "variant",
      productId: product.id,
      quantity: count ? Number(count) : 1,
    };
  const existing = lineQuantity(state.cart, variant.id),
    remove = ["remove", "take"].includes(verb);
  const quantity = remove
    ? /\ball\b/.test(text) || !count
      ? 0
      : Math.max(0, existing - Number(count))
    : verb === "add"
      ? existing + Number(count || 1)
      : Number(count || 1);
  return { variantId: variant.id, quantity };
}
export function selectionFor(input, products) {
  const matches = resolveProduct(input, products);
  const variants = variantsOf(products).filter(
    (v) => has(normal(input), v.id) || has(normal(input), v.title),
  );
  const product =
    matches.length === 1
      ? matches[0]
      : !matches.length && new Set(variants.map((v) => v.productId)).size === 1
        ? products.find((p) => p.id === variants[0].productId)
        : null;
  if (!product) return null;
  const choices = variants.filter((v) => v.productId === product.id);
  return {
    productId: product.id,
    variantId:
      choices.length === 1
        ? choices[0].id
        : product.variants.length === 1
          ? product.variants[0].id
          : null,
  };
}
export function selectedProduct(state, products) {
  return products.find((p) => p.id === state.selectedProductId) || null;
}
export function productChoices(product) {
  return [
    "Compare options",
    "What's included?",
    product.variants.length === 1 ? "Add 1 to my cart" : "Choose an option",
  ];
}
export function cartDecision(state, input, products) {
  const change = resolveCartChange(state, input, products);
  if (!change) return null;
  if (change.clear) return { cartChange: change };
  if (change.clarify === "quantity")
    return {
      reply:
        "What quantity would you like? Choose a whole number from 0 to 20.",
      choices: ["Show me my cart"],
      presentation: { view: "cart" },
      pendingCart: null,
    };
  if (change.clarify === "product")
    return {
      reply: "Which product would you like me to change?",
      choices: products.slice(0, 4).map((p) => "Show me " + p.title),
      presentation: { view: "collection" },
      pendingCart: null,
    };
  if (change.clarify === "variant") {
    const product = products.find((p) => p.id === change.productId);
    return {
      reply: `Which ${product.title} option would you like? ${product.variants.map((v) => v.title + (v.available ? "" : " (unavailable)")).join(", ")}.`,
      choices: product.variants
        .filter((v) => v.available)
        .slice(0, 4)
        .map((v) => v.title),
      selection: { productId: product.id, variantId: null },
      pendingCart: { productId: product.id, request: input },
      presentation: { view: "product", productId: product.id },
    };
  }
  if (
    !Number.isInteger(change.quantity) ||
    change.quantity < 0 ||
    change.quantity > MAX_QUANTITY
  )
    return {
      reply: `You can set up to ${MAX_QUANTITY} of each option. What quantity would you like?`,
      choices: ["Show me my cart"],
      presentation: { view: "cart" },
    };
  const variant = findVariant(products, change.variantId);
  if (!variant)
    return {
      reply:
        "That option is not in this catalog. Which product would you like?",
      choices: ["Show me the collection"],
      presentation: { view: "collection" },
    };
  if (
    change.quantity > lineQuantity(state.cart, variant.id) &&
    !variant.available
  )
    return {
      reply: `${variant.productTitle} · ${variant.title} is currently unavailable. Would you like another option?`,
      choices: ["Show me " + variant.productTitle, "Show me the collection"],
      presentation: { view: "product", productId: variant.productId },
    };
  return {
    cartChange: change,
    selection: { productId: variant.productId, variantId: variant.id },
  };
}
export function scriptedDecision(state, input, products, merchant) {
  const text = normal(input),
    selection = selectionFor(input, products),
    product = selection
      ? products.find((p) => p.id === selection.productId)
      : selectedProduct(state, products);
  const present = { view: "product", productId: product?.id };
  if (
    /\b(?:show|view|open|review|see)\b.*\b(?:cart|bag)\b|\bcheckout|check out\b/.test(
      text,
    )
  )
    return {
      reply: state.cart?.totalQuantity
        ? "Here’s your cart. You can change any item or continue to checkout. What would you like to do?"
        : "Your cart is empty. What would you like to explore?",
      choices: ["Show me the collection"],
      presentation: { view: "cart" },
      lastCartVariantId: null,
    };
  if (/\b(?:shipping|delivery|returns?|refund|contact|support)\b/.test(text)) {
    const key = /returns?|refund/.test(text)
      ? "returns"
      : /contact|support/.test(text)
        ? "contact"
        : "shipping";
    return {
      reply:
        (merchant.policies[key] ||
          "That policy has not been configured. Please check with the merchant before buying.") +
        " What else would help you decide?",
      choices: ["Show me the collection", "Show me my cart"],
      presentation: { view: "policy", policy: key },
    };
  }
  if (/what can (?:i|you) do|how can you help/.test(text))
    return {
      reply: `I can explain ${merchant.name} products, compare options, show relevant visuals, and add, remove or change cart items when you ask. What would you like to try?`,
      choices: [
        "Show me the collection",
        "Compare products",
        "Show me my cart",
      ],
      presentation: { view: "collection" },
    };
  if (/not for me|no thanks|i'll pass/.test(text))
    return {
      reply: "Of course. You can keep exploring whenever you like.",
      choices: [],
      presentation: { view: "collection" },
    };
  if (/watch|video|how (?:it|this) works/.test(text) && merchant.video)
    return {
      reply: "Here’s the product walkthrough. I’ll be here when it finishes.",
      choices: ["Show me my cart", "Compare products"],
      presentation: { view: "video" },
    };
  if (/compare/.test(text)) {
    const compareProduct = /compare.*(?:products|collection|catalog)/.test(text)
      ? null
      : product;
    return {
      reply:
        "Here are the options side by side. Which would you like to explore?",
      choices: compareProduct
        ? compareProduct.variants
            .filter((v) => v.available)
            .slice(0, 3)
            .map((v) => "Show me " + v.title + " " + compareProduct.title)
        : products.slice(0, 3).map((p) => "Show me " + p.title),
      presentation: {
        view: "compare",
        productIds: compareProduct
          ? [compareProduct.id]
          : products.slice(0, 3).map((p) => p.id),
      },
    };
  }
  if (
    /collection|catalog|products|what do you sell|what can i buy/.test(text) &&
    !selection
  )
    return {
      reply: `Here’s the ${merchant.name} collection. ${products.map((p) => p.title).join(", ")}. What catches your eye?`,
      choices: products.slice(0, 3).map((p) => "Show me " + p.title),
      presentation: { view: "collection" },
    };
  if (product) {
    const visual = product.visuals?.find(
      (v) => has(text, v.id) || has(text, v.label),
    );
    if (visual) present.visualId = visual.id;
    if (selection?.variantId) present.variantId = selection.variantId;
    const facts = Object.entries(product.facts || {}),
      included = facts.find(([key]) => /include|contents/i.test(key));
    const answer = /include|in the box|contents/.test(text)
      ? included
        ? included[1]
        : "Package contents haven’t been specified. Please check with the merchant."
      : /price|cost|how much/.test(text)
        ? product.variants
            .map((v) => v.title + ": " + formatMoney(v.price, merchant.locale))
            .join("; ")
        : product.description +
          " " +
          facts
            .slice(0, 2)
            .map(([key, value]) => key + ": " + value)
            .join(". ");
    const options = product.variants.filter((v) => v.available);
    return {
      reply: answer + " Would you like to compare the options or add one?",
      choices:
        options.length > 1
          ? options
              .slice(0, 3)
              .map((v) => "Show me " + v.title + " " + product.title)
          : ["Add 1 to my cart", "Compare products"],
      selection: selection || undefined,
      presentation: present,
    };
  }
  return {
    reply: `This is a scripted demo until an AI provider is connected. I can show the ${merchant.name} collection, compare options and change your sample cart. Where would you like to start?`,
    choices: merchant.openingChoices.slice(0, 4),
    presentation: { view: "collection" },
  };
}
export function validatePresentation(value, products, merchant) {
  const fallback = { view: "collection" };
  if (!value || typeof value !== "object") return fallback;
  if (["collection", "cart"].includes(value.view)) return { view: value.view };
  if (
    value.view === "policy" &&
    ["shipping", "returns", "contact"].includes(value.policy)
  )
    return { view: "policy", policy: value.policy };
  if (value.view === "video" && merchant.video) return { view: "video" };
  if (value.view === "compare")
    return {
      view: "compare",
      productIds: (Array.isArray(value.productIds) ? value.productIds : [])
        .filter((id) => products.some((p) => p.id === id))
        .slice(0, 4),
    };
  if (value.view === "product") {
    const product = products.find((p) => p.id === value.productId);
    if (!product) return fallback;
    return {
      view: "product",
      productId: product.id,
      ...(product.variants.some((v) => v.id === value.variantId)
        ? { variantId: value.variantId }
        : {}),
      ...(product.visuals?.some((v) => v.id === value.visualId)
        ? { visualId: value.visualId }
        : {}),
    };
  }
  return fallback;
}
