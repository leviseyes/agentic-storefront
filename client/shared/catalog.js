import {productFacts,productAnswerRules,productKnowledge,productUseCaseGuidance} from './product-knowledge.js';
export const catalog = Object.freeze({
  name: "Studio Mount",
  url: '/demo-checkout',
  image: '/product/mount.svg',
  guide: '',
  faq: '',
  priceNote: 'Use the current commerce adapter response, never this fixture, for prices.',
  facts: productFacts,
  answerRules: `${productAnswerRules}\n${productUseCaseGuidance}`,
});
export function assessFit({ weight, surface, drilling, count }) {
  const n = Number(weight);
  if (!Number.isFinite(n) || n <= 0)
    return {
      status: "incomplete",
      title: "A few details first",
      text: "We still need the frame’s weight and setup details before considering compatibility.",
    };
  if (n > 10)
    return {
      status: "check",
      title: "Above the weight limit",
      text: "This exceeds the 10 lb maximum, even with the heavy-item setup. We cannot recommend it for this item.",
    };
  if(n>5&&drilling!=='yes')return {status:'check',title:'This item needs nails and extra strips',text:productKnowledge.heavyMounting+' Confirm that nails are allowed before choosing this setup.'};
  if (drilling === "unknown")
    return {
      status: "check",
      title: "Confirm fixing permission first",
      text: "Before choosing a mounting method, check which attachments you are allowed to use on this wall.",
    };
  if (
    !surface ||
    !drilling ||
    !count ||
    !Number.isInteger(Number(count)) ||
    Number(count) < 1 ||
    Number(count) > 50
  )
    return {
      status: "incomplete",
      title: "A few details first",
      text: "We still need the wall surface, fixing permission and number of frames before considering compatibility.",
    };
  if (surface !== "painted drywall")
    return {
      status: "check",
      title: "Your surface needs a closer look",
      text: "Confirm that the hanger and your chosen attachment are suitable for this wall surface before buying.",
    };
  return {
    status: "candidate",
    title: "Worth considering for your project",
    text: `${count} frame${Number(count) === 1 ? "" : "s"}, each ${n} lb. ${n>5?productKnowledge.heavyMounting:'Within the 5 lb limit without nails. Follow the adhesive instructions for your wall.'} Each purchased unit includes ${productKnowledge.contents} The item needs a flat mounting surface and should be up to about 20 × 20 inches.`,
  };
}
