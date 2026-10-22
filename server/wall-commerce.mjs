export const SHOP_ENDPOINT = 'https://example.myshopify.com/api/2026-10/graphql.json';
export const PRODUCT_HANDLE = 'the-agentic-hanger';
export const VARIANT_ID = 'gid://shopify/ProductVariant/1';
const fragment = `fragment StudioCart on Cart { id checkoutUrl totalQuantity cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } } lines(first:20) { nodes { id quantity cost { totalAmount { amount currencyCode } } merchandise { ... on ProductVariant { id title price { amount currencyCode } product { title handle } } } } } }`;
export const operations = {
  product: `query StudioProduct($handle:String!) @inContext(country:US) { product(handle:$handle) { id title handle availableForSale onlineStoreUrl featuredImage { url altText } variants(first:10) { nodes { id title availableForSale price { amount currencyCode } compareAtPrice { amount currencyCode } } } } }`,
  get: `${fragment} query StudioCartGet($id:ID!) { cart(id:$id) { ...StudioCart } }`,
  create: `${fragment} mutation StudioCartCreate($input:CartInput!) { cartCreate(input:$input) { cart { ...StudioCart } userErrors { field message code } warnings { code message } } }`,
  update: `${fragment} mutation StudioCartUpdate($cartId:ID!, $lines:[CartLineUpdateInput!]!) { cartLinesUpdate(cartId:$cartId, lines:$lines) { cart { ...StudioCart } userErrors { field message code } warnings { code message } } }`,
  add: `${fragment} mutation StudioCartAdd($cartId:ID!, $lines:[CartLineInput!]!) { cartLinesAdd(cartId:$cartId, lines:$lines) { cart { ...StudioCart } userErrors { field message code } warnings { code message } } }`,
  remove: `${fragment} mutation StudioCartRemove($cartId:ID!, $lineIds:[ID!]!) { cartLinesRemove(cartId:$cartId, lineIds:$lineIds) { cart { ...StudioCart } userErrors { field message code } warnings { code message } } }`,
};
export function safeCart(cart) {
  if (!cart) return null;
  return { quantity: cart.totalQuantity, subtotal: cart.cost.subtotalAmount, total: cart.cost.totalAmount,
    lines: cart.lines.nodes.map(line => ({ quantity: line.quantity, title: line.merchandise.product.title, price: line.merchandise.price, total: line.cost?.totalAmount })) };
}
// The public Storefront API supports this catalog and guest cart without an Admin
// token. Keep all cart keys server-side; only checkout gets its Shopify URL.
export function createCommerce(fetchImpl = fetch, {buyerIp = '',shopDomain='example.myshopify.com',productHandle=PRODUCT_HANDLE,variantId=VARIANT_ID,privateToken=''} = {}) {
  if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain))throw Error('Use a valid myshopify.com store domain.');
  if(!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variantId))throw Error('Use a valid Shopify variant ID.');
  const endpoint=`https://${shopDomain}/api/2026-10/graphql.json`;
  async function query(query, variables) {
    const r = await fetchImpl(endpoint, { method:'POST', headers:{'Content-Type':'application/json',...(buyerIp?{'Shopify-Storefront-Buyer-IP':buyerIp}:{}),...(privateToken?{'Shopify-Storefront-Private-Token':privateToken}:{})}, body:JSON.stringify({query,variables}), signal:AbortSignal.timeout(15000) });
    if(r.status===429)throw Error('The store is busy. Wait a moment, then try again.');
    const data = await r.json().catch(()=>null);
    if (!r.ok || data?.errors?.length || !data?.data) throw Error('The store could not connect. Please try again.');
    return data.data;
  }
  async function product() {
    const {product:p} = await query(operations.product,{handle:productHandle});
    const variant = p?.variants.nodes.find(v => v.id === variantId);
    if (!variant) throw Error('This product is unavailable right now.');
    return { title:p.title, available:p.availableForSale && variant.availableForSale, price:variant.price, url:p.onlineStoreUrl, image:p.featuredImage, checkedAt:new Date().toISOString() };
  }
  async function get(id) { return id ? (await query(operations.get,{id})).cart : null; }
  async function setQuantity(id, quantity) {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) throw Error('Choose between 0 and 20 product units.');
    const current = await get(id);
    if(id&&!current)throw Error('Your previous cart is no longer available. Refresh the cart before adding items again.');
    const line = current?.lines.nodes.find(l => l.merchandise.id === variantId);
    if (!quantity && !line) return {cart:current,warnings:[]};
    let operation, variables, key;
    if (!current) { operation=operations.create; variables={input:{buyerIdentity:{countryCode:"US"},attributes:[{key:"storefront",value:"Studio conversational storefront"}],lines:[{merchandiseId:variantId,quantity}]}}; key='cartCreate'; }
    else if (!quantity) { operation=operations.remove; variables={cartId:current.id,lineIds:[line.id]}; key='cartLinesRemove'; }
    else if (line) { operation=operations.update; variables={cartId:current.id,lines:[{id:line.id,quantity}]}; key='cartLinesUpdate'; }
    else { operation=operations.add; variables={cartId:current.id,lines:[{merchandiseId:variantId,quantity}]}; key='cartLinesAdd'; }
    const result = (await query(operation,variables))[key];
    if (result.userErrors?.length || !result.cart) throw Error(result.userErrors?.[0]?.message || 'The cart could not be updated.');
    return {cart:result.cart,warnings:(result.warnings||[]).map(w => w.message)};
  }
  return {product,get,setQuantity};
}
