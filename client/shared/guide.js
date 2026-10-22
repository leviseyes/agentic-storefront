import {storefront} from '../../storefront.config.js';
export const guideName = storefront.guide;
export const guideIntroduction = `I’m ${guideName}, your guide for today.`;
export const guideIdentity = `Your guide name is ${guideName}. ${storefront.product} is the sample product, not your name. Keep this identity throughout the conversation. Explain that you are an AI guide when asked; do not claim to be a human.`;
export const guideCapabilities = 'Type or tap a suggested reply to explore the product in 3D, watch a short walkthrough, or ask me to add, remove, or change items in your cart. With AI providers configured, you can also talk and create concepts from a wall photo.';
export const guideHelpQuestion = 'What can I do here?';
export const guideHelpChoices = ['Show me how it works', 'Show me the 3D model', "What’s included?", 'Show me my cart'];
