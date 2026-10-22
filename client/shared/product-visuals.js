// Only these authored views can be selected by an agent. Never render model-
// supplied URLs, markup or arbitrary animation instructions.
export const productViews = Object.freeze(['product','product-back','product-parts','product-photo','contents','mounting']);
export const isProductView = value => productViews.includes(value);
export const presentationViews = Object.freeze(['none',...productViews,'demo','cart']);
export const visualInstructions = `Choose one authored visual: product for the interactive 3D overview, product-back for its reverse, product-parts for the separated sample components, product-photo for the illustration, contents for the sample kit, or mounting for an illustrative adhesive diagram. The sample geometry and illustrations are fictional, not actual product photographs, CAD or installation instructions. Replace them before connecting a real merchant. Use demo for the walkthrough. Never generate a URL, HTML or JavaScript as a presentation instruction.`;

// A streamed speech transcript can lead the final tool call. Show a recognized
// subject as it is mentioned, once per answer, rather than waiting for its end.
// Explicit agent views remain authoritative; this never opens a modal or cart.
export function spokenProductView(text) {
  const value=String(text||'').toLowerCase();
  if(/\b(?:eight|8)\s+(?:rated|adhesive)|\brated(?:®)?\s+(?:large|strip)|\bheavy[- ]item setup\b/.test(value))return 'mounting';
  if(/\b(?:four|4) adhesive strips\b|\b(?:what(?:’s|'s| is) included|package contents)\b/.test(value))return 'contents';
  if(/\b(?:separat(?:e|ed|ing)|two|both) (?:the )?(?:components|parts|pieces)\b/.test(value))return 'product-parts';
  if(/\b(?:back of the hanger|rear of the hanger|reverse side|turn (?:it|the hanger) around)\b/.test(value))return 'product-back';
  if(/\b(?:product photo(?:graph)?|real photo(?:graph)? of the hanger)\b/.test(value))return 'product-photo';
  if(/\b(?:3d model|studio (?:hanger|mount))\b/.test(value))return 'product';
  return null;
}
