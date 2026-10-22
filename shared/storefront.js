const idPattern = /^[a-z][a-z0-9-]{0,63}$/;
export function safeAsset(src) {
  return (
    typeof src === "string" &&
    ((src.startsWith("/") &&
      !src.startsWith("//") &&
      !/[\\\u0000-\u0020]/.test(src)) ||
      (/^https:\/\//.test(src) &&
        (() => {
          try {
            return (
              new URL(src).protocol === "https:" &&
              !new URL(src).username &&
              !new URL(src).password
            );
          } catch {
            return false;
          }
        })()))
  );
}
export function defineStorefront(input) {
  const value = structuredClone(input);
  for (const field of [
    "id",
    "name",
    "guide",
    "headline",
    "introduction",
    "openingQuestion",
    "currency",
    "country",
    "locale",
  ])
    if (typeof value[field] !== "string" || !value[field].trim())
      throw Error("Storefront configuration needs " + field + ".");
  if (
    !idPattern.test(value.id) ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !/^[A-Z]{2}$/.test(value.country)
  )
    throw Error("Use a stable merchant ID, ISO currency and country code.");
  if (
    !Array.isArray(value.products) ||
    !value.products.length ||
    value.products.length > 20
  )
    throw Error("Configure 1–20 products.");
  if (
    !Array.isArray(value.openingChoices) ||
    !value.openingChoices.length ||
    value.openingChoices.some(
      (s) => typeof s !== "string" || !s.trim() || s.length > 100,
    )
  )
    throw Error("Configure short opening choices.");
  if (
    !value.policies ||
    ["shipping", "returns", "contact"].some(
      (key) => typeof value.policies[key] !== "string",
    )
  )
    throw Error("Configure merchant policy text.");
  if (
    typeof value.hero?.alt !== "string" ||
    typeof value.hero?.caption !== "string"
  )
    throw Error("Hero images need alt text and a caption.");
  try {
    new Intl.NumberFormat(value.locale, {
      style: "currency",
      currency: value.currency,
    });
  } catch {
    throw Error("Configure a supported locale and currency.");
  }
  const ids = new Set(),
    variants = new Set();
  for (const product of value.products) {
    if (
      !idPattern.test(product.id) ||
      ids.has(product.id) ||
      typeof product.title !== "string" ||
      !product.title.trim() ||
      product.title.length > 60
    )
      throw Error("Product IDs and titles must be valid and unique.");
    ids.add(product.id);
    if (
      !Array.isArray(product.variants) ||
      !product.variants.length ||
      product.variants.length > 100
    )
      throw Error("Each product needs 1–100 variants.");
    for (const variant of product.variants) {
      if (
        !idPattern.test(variant.id) ||
        variants.has(variant.id) ||
        !/^\d+(?:\.\d{1,3})?$/.test(String(variant.price)) ||
        typeof variant.available !== "boolean" ||
        typeof variant.title !== "string" ||
        !variant.title.trim() ||
        variant.title.length > 60 ||
        !Number.isFinite(Number(variant.price))
      )
        throw Error(
          "Variant IDs, titles, sample prices and availability must be valid.",
        );
      variants.add(variant.id);
    }
    if (
      typeof product.description !== "string" ||
      !product.description.trim() ||
      !product.facts ||
      Object.values(product.facts).some((v) => typeof v !== "string") ||
      (product.aliases || []).some((v) => typeof v !== "string" || !v.trim())
    )
      throw Error(
        "Configure product descriptions, factual strings and aliases.",
      );
    if (
      product.image &&
      (!safeAsset(product.image.src) || typeof product.image.alt !== "string")
    )
      throw Error("Product images must use local paths or HTTPS.");
    const visualIds = new Set();
    for (const visual of product.visuals || []) {
      if (
        visualIds.has(visual.id) ||
        typeof visual.label !== "string" ||
        !visual.label.trim() ||
        !idPattern.test(visual.id) ||
        !["image", "model"].includes(visual.type) ||
        !safeAsset(visual.src)
      )
        throw Error(
          "Visuals need an ID, supported type and safe configured source.",
        );
      visualIds.add(visual.id);
    }
  }
  if (!safeAsset(value.hero?.src))
    throw Error("Configure a local or HTTPS hero image.");
  if (value.video && !/^[A-Za-z0-9_-]{11}$/.test(value.video.youtubeId || ""))
    throw Error("Configure a valid YouTube video ID or null.");
  if (
    value.tools?.photoPreview &&
    typeof value.tools.photoPreview.instructions !== "string"
  )
    throw Error("Photo tools need merchant instructions.");
  value.repo = "https://github.com/leviseyes/agentic-storefront";
  return Object.freeze(value);
}
export function variantsOf(products) {
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      ...variant,
      productId: product.id,
      productTitle: product.title,
      image: product.image,
    })),
  );
}
export function findVariant(products, id) {
  return variantsOf(products).find((v) => v.id === id);
}
export function formatMoney(value, locale = "en-US") {
  return value
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency: value.currencyCode,
      }).format(Number(value.amount))
    : "";
}
export function publicCatalog(merchant) {
  return merchant.products.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      price: { amount: String(variant.price), currencyCode: merchant.currency },
    })),
  }));
}
