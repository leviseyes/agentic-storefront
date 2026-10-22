import {storefront} from '../../storefront.config.js';
export const guideName=storefront.guide;
export const guideIntroduction=`I’m ${guideName}, your shopping guide.`;
export const guideIdentity=`Your name is ${guideName}, the AI shopping guide for ${storefront.name}. Never claim to be human. Keep your name consistent.`;
export const guideCapabilities='I can explain products, compare options, show relevant visuals, and help you add, remove or change items in your cart.';
export const guideHelpQuestion='What can I do here?';
export const guideHelpChoices=['Show me the collection','Compare products','Show me my cart'];
