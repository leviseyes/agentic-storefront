export type Money = { amount: string; currencyCode: string };
export type Variant = {
  id: string;
  title: string;
  price: Money;
  available: boolean;
};
export type Product = {
  id: string;
  title: string;
  description: string;
  image?: { src: string; alt: string };
  facts: Record<string, string>;
  useCases?: string[];
  variants: Variant[];
  visuals?: {
    id: string;
    type: "image" | "model";
    src: string;
    alt?: string;
    label: string;
  }[];
};
export type Presentation = {
  view: string;
  productId?: string;
  variantId?: string;
  visualId?: string;
  productIds?: string[];
  policy?: string;
  previewId?: string;
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  choices?: string[];
  presentation?: Presentation;
};
export type Cart = {
  quantity: number;
  subtotal: Money;
  total: Money;
  lines: {
    variantId: string | null;
    quantity: number;
    title: string;
    variantTitle: string;
    price: Money;
    total?: Money;
  }[];
};
export type Session = {
  messages: Message[];
  catalog: Product[];
  cart: Cart | null;
  selectedProductId: string | null;
  selectedVariantId: string | null;
  presentation: Presentation;
  photo: { id: string; url: string } | null;
  previews: { id: string; url: string; title: string }[];
  demo: boolean;
  scripted: boolean;
  ready: boolean;
  features: {
    voice: boolean;
    transcribe: boolean;
    previews: boolean;
    video: boolean;
  };
  commerceError?: string;
  recovering?: boolean;
  error?: string;
};
