// Fictional example merchant. Replace sample facts before real sales.
export default {
  id: "fieldwork",
  name: "Fieldwork",
  guide: "Alex",
  currency: "USD",
  country: "US",
  locale: "en-US",
  headline: "Find your everyday\nadventure.",
  introduction:
    "Tell me where you’re headed. I’ll help you compare the gear, find the right option, and put your choices together.",
  hero: {
    src: "/examples/outdoor.png",
    alt: "Fictional canvas daypack, green bottle and rust pouch outdoors",
    caption: "Good company.\nFor wherever you go.",
  },
  openingQuestion: "A day out, a daily commute, or a gift?",
  openingChoices: [
    "Show me the collection",
    "Help me choose a daypack",
    "Compare the bottles",
    "Show me my cart",
  ],
  policies: {
    shipping:
      "This fictional demo does not ship orders. A connected merchant must supply its shipping policy.",
    returns:
      "No orders or payments are taken in this demo. A real merchant’s return policy must be configured.",
    contact:
      "This is a sample storefront, not a real merchant support channel.",
  },
  products: [
    {
      id: "daypack",
      handle: "daypack",
      title: "Daypack",
      description: "A compact canvas companion for everyday essentials.",
      aliases: ["pack", "bag", "backpack"],
      image: {
        src: "/examples/daypack.svg",
        alt: "Illustration of the sample canvas daypack",
      },
      facts: {
        Capacity: "18 liters",
        Material: "Cotton canvas",
        Includes: "One daypack",
      },
      useCases: ["Daily commuting with a light load", "A relaxed day out"],
      variants: [
        {
          id: "daypack-sand",
          title: "Sand",
          price: "68.00",
          available: true,
        },
        {
          id: "daypack-ink",
          title: "Ink",
          price: "68.00",
          available: true,
        },
      ],
    },
    {
      id: "bottle",
      handle: "bottle",
      title: "Trail Bottle",
      description: "A reusable steel bottle for your daily routine.",
      aliases: ["water bottle"],
      image: {
        src: "/examples/bottle.svg",
        alt: "Illustration of a green sample bottle",
      },
      facts: {
        Material: "Stainless steel",
        Includes: "One bottle and lid",
      },
      useCases: ["A desk-to-trail refill companion"],
      variants: [
        {
          id: "bottle-500",
          title: "500 ml",
          price: "24.00",
          available: true,
        },
        {
          id: "bottle-750",
          title: "750 ml",
          price: "29.00",
          available: true,
        },
      ],
    },
    {
      id: "pouch",
      handle: "pouch",
      title: "Utility Pouch",
      description: "A small home for the things that disappear in your bag.",
      aliases: ["organizer"],
      image: {
        src: "/examples/pouch.svg",
        alt: "Illustration of a rust-colored sample pouch",
      },
      facts: {
        Material: "Cotton canvas",
        Closure: "Zipper",
        Includes: "One pouch",
      },
      useCases: ["Organizing cables and small accessories"],
      variants: [
        {
          id: "pouch-rust",
          title: "Rust",
          price: "18.00",
          available: true,
        },
      ],
    },
  ],
  tools: {
    photoPreview: null,
  },
  video: null,
};
