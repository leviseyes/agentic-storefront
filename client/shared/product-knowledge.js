// FICTIONAL sample catalog. Replace this entire file with verified merchant
// knowledge before connecting a live product. Never treat this as safety advice.
export const productKnowledge = Object.freeze({
  confirmed: 'Fictional demo specification',
  contents: '1 Studio Mount system with 4 adhesive strips.',
  compatibility: 'For items with a flat mounting surface, such as small picture-frame backs. For items up to about 20 × 20 inches.',
  mounting: 'Up to 5 lb without nails. Up to 10 lb with nails and the heavy-item setup.',
  heavyMounting: 'Items over 5 lb and up to 10 lb need at least 8 rated adhesive strips, plus nails through the dedicated security holes. The 4 included strips do not provide that complete heavy-item setup.',
  installation: 'Stick, press, straighten: peel and stick the hanger to the flat back of the item, press the item onto the wall, then rotate it level. Follow the chosen adhesive’s preparation and waiting-time instructions; use the heavy-item setup when required. The sample walkthrough is illustrative, not a certified installation guide.',
  benefit: 'Hang a picture in about 10 seconds and adjust it level after hanging. Adhesive preparation and waiting times still apply; this is not a promise to skip them.',
  shipping: 'Shipping is not configured for the fictional demo product. Read the real merchant’s shipping policy before buying.',
  returns: 'This demo accepts no orders and has no return policy. A real merchant must supply its policy.',
});

export const productFacts = Object.values(productKnowledge).slice(1).join(' ');
export const productAnswerRules = `Use the configured product facts as the current source of truth, only after the merchant has verified them. Answer the visitor's question directly before offering a next step. Package contents are known: never describe them as unconfirmed or send someone to checkout to learn what is included. One purchased unit contains one complete system with four adhesive strips. Do not claim nails, frames, artwork, or extra strips are included, or identify the included strips as a specific brand; their brand is unconfirmed. A preview frame count alone is not consent to add that many units to the cart.
For a known item above 5 lb, always explain BOTH the 8 rated adhesive strips and nails through the security holes; nails alone are not the full heavy-item setup. Never recommend over 10 lb or an adhesive-only setup over 5 lb. Flat item-back compatibility does not prove that every wall finish or adhesive is suitable. Do not invent dimensions of the hanger itself, nail count, adhesive cure time, removal/reuse instructions, or damage-free guarantees. Describe the fast hanging benefit without an unverified comparison such as world's quickest.
Never invent shipping, returns or a guarantee. Opened/used-item eligibility, return postage and other return conditions are not confirmed: do not guess or promise a refund for a specific case. Direct unresolved policy questions to Studio support. Do not convert unknown details into a sales pitch or claim adding to a cart/checkout will reveal them.`;


// Illustrative scenarios, not customer testimonials or extra compatibility promises.
export const productUseCases = Object.freeze([
  'A family photo that looks slightly crooked: hang a flat-backed frame and rotate it level afterward. Ask whether they want to see the adjustment in the demonstration.',
  'A small gallery wall: adjust each eligible frame’s angle after hanging to line up the arrangement visually. This does not measure spacing, position frames automatically or replace one system per independently mounted item. Do not turn a preview’s frame count into cart consent.',
  'A tablet, phone or smart-home device: a flat-backed item can be mounted on a suitable wall instead of sitting on a surface. Confirm the actual mounting surface and weight; do not promise charging clearance, easy removal, a swivel arm or compatibility with every case.',
  'Decor such as a plate: consider it only when the item has a suitable flat mounting surface. A curved plate back is not automatically compatible. Confirm its back and weight before recommending.',
]);
export const productUseCaseGuidance = `Use cases available when relevant: ${productUseCases.join(' ')}
Use at most one relevant example in a normal reply, or a short list when the visitor asks for ideas. Connect the example to the practical benefit, then ask one useful decision question. These are possibilities, not reports from real customers. Apply all confirmed limits: about 20 × 20 inches, up to 5 lb without nails, up to 10 lb with at least 8 rated adhesive strips plus nails through the security holes. Never imply renter-safe, damage-free, universal surface compatibility or automatic leveling. Do not make a photo upload or a long checklist a prerequisite to buying.`;
