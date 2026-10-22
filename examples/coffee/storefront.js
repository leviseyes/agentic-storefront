// Fictional example merchant. Replace sample facts before real sales.
export default {
  id: "daybreak",
  name: "Daybreak",
  guide: "Sam",
  currency: "USD",
  country: "US",
  locale: "en-US",
  headline: "Make a little\nmorning ritual.",
  introduction:
    "Tell me how you like your coffee. I can compare the equipment, explain what’s included, and help you build your setup.",
  hero: {
    src: "/examples/coffee.png",
    alt: "Fictional ceramic dripper, charcoal kettle and unbranded coffee bag",
    caption: "A slower start.\nA better morning.",
  },
  openingQuestion: "Starting from scratch, upgrading, or shopping for a gift?",
  openingChoices: [
    "Show me the collection",
    "Tell me about the dripper",
    "Compare the coffee",
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
      id: "dripper",
      handle: "ceramic-dripper",
      title: "Ceramic Dripper",
      description: "A simple pour-over brewer for a considered morning cup.",
      aliases: ["brewer"],
      image: {
        src: "/examples/dripper.svg",
        alt: "Illustrative sample ceramic coffee dripper",
      },
      facts: {
        Material: "Ceramic",
        Includes: "One dripper; filters and cup are not included",
      },
      useCases: ["A hands-on pour-over routine"],
      variants: [
        {
          id: "dripper-cream",
          title: "Cream",
          price: "32.00",
          available: true,
        },
      ],
    },
    {
      id: "kettle",
      handle: "gooseneck-kettle",
      title: "Gooseneck Kettle",
      description: "A stovetop kettle with a narrow pouring spout.",
      aliases: ["pouring kettle"],
      image: {
        src: "/examples/kettle.svg",
        alt: "Illustrative sample charcoal kettle",
      },
      facts: {
        Capacity: "700 ml",
        Type: "Stovetop; not electric",
        Includes: "One kettle",
      },
      useCases: ["A controlled pour for manual coffee brewing"],
      variants: [
        {
          id: "kettle-charcoal",
          title: "Charcoal",
          price: "58.00",
          available: true,
        },
      ],
    },
    {
      id: "coffee",
      handle: "coffee",
      title: "Morning Coffee",
      description:
        "A fictional medium-roast coffee for exploring product options.",
      aliases: ["beans"],
      image: {
        src: "/examples/coffee-bag.svg",
        alt: "Illustrative unbranded sample coffee bag",
      },
      facts: {
        Roast: "Medium",
        "Bag size": "250 g",
        Origin: "Not specified in this demo",
      },
      useCases: ["Choosing whole beans or ground coffee"],
      variants: [
        {
          id: "coffee-whole",
          title: "Whole bean",
          price: "16.00",
          available: true,
        },
        {
          id: "coffee-ground",
          title: "Ground",
          price: "16.00",
          available: false,
        },
      ],
    },
  ],
  tools: {
    photoPreview: null,
  },
  video: null,
};
