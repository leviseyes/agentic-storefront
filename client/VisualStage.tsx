import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  RotateCcw,
  Play,
  X,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { storefront } from "../storefront.config.js";
import { formatMoney } from "../shared/storefront.js";
import type { Product, Presentation, Session } from "./types";
const money = (value: any) => formatMoney(value, storefront.locale);
function Model({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null),
    model = useRef<any>(null),
    [failed, setFailed] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setReady(false);
    void import("./model-viewer")
      .then(async ({ mountModel }) => {
        if (cancelled || !host.current) return;
        const instance = await mountModel(
          host.current,
          src,
          () => {
            if (!cancelled) setReady(true);
          },
          () => {
            if (!cancelled) setFailed(true);
          },
        );
        if (cancelled) instance.dispose();
        else model.current = instance;
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      model.current?.dispose();
      model.current = null;
    };
  }, [src]);
  return (
    <div className="asset-model">
      <div className="asset-canvas" ref={host} aria-label={alt} />
      {!ready && !failed && <p role="status">Loading the model…</p>}
      {failed && (
        <p role="status">This model couldn’t load. Try another product view.</p>
      )}
      {ready && (
        <div
          className="model-controls"
          role="group"
          aria-label="3D model controls"
        >
          <button
            aria-label="Rotate left"
            onClick={() => model.current?.turn(-1)}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            aria-label="Rotate right"
            onClick={() => model.current?.turn(1)}
          >
            <ArrowRight size={18} />
          </button>
          <button aria-label="Zoom out" onClick={() => model.current?.zoom(-1)}>
            <Minus size={18} />
          </button>
          <button aria-label="Zoom in" onClick={() => model.current?.zoom(1)}>
            <Plus size={18} />
          </button>
          <button
            aria-label="Reset model"
            onClick={() => model.current?.reset()}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
function Comparison({
  products,
  onAsk,
  busy,
}: {
  products: Product[];
  onAsk: (text: string) => void;
  busy: boolean;
}) {
  const rows =
    products.length === 1
      ? products[0].variants.map((v) => ({
          title: v.title,
          description: products[0].description,
          price: money(v.price),
          available: v.available,
          facts: products[0].facts,
          ask: "Show me " + v.title + " " + products[0].title,
        }))
      : products.map((p) => ({
          title: p.title,
          description: p.description,
          price:
            "From " +
            money(
              p.variants.reduce((a, b) =>
                Number(a.price.amount) < Number(b.price.amount) ? a : b,
              ).price,
            ),
          available: p.variants.some((v) => v.available),
          facts: p.facts,
          ask: "Show me " + p.title,
        }));
  return (
    <div className="comparison">
      <h2>Find your fit.</h2>
      <p>Compare the details, then ask me about the one you like.</p>
      <div className="comparison-scroll">
        <table>
          <caption className="sr-only">Product options</caption>
          <thead>
            <tr>
              <th scope="col">Compare</th>
              {rows.map((row) => (
                <th scope="col" key={row.title}>
                  {row.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Price</th>
              {rows.map((row) => (
                <td key={row.title}>{row.price}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Details</th>
              {rows.map((row) => (
                <td key={row.title}>{row.description}</td>
              ))}
            </tr>
            {[
              ...new Set(rows.flatMap((row) => Object.keys(row.facts || {}))),
            ].map((key) => (
              <tr key={key}>
                <th scope="row">{key}</th>
                {rows.map((row) => (
                  <td key={row.title}>{row.facts[key] || "Not specified"}</td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row">Availability</th>
              {rows.map((row) => (
                <td key={row.title}>
                  {row.available ? "Available" : "Unavailable"}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">
                <span className="sr-only">Continue</span>
              </th>
              {rows.map((row) => (
                <td key={row.title}>
                  <button
                    className="text-action"
                    disabled={busy}
                    onClick={() => onAsk(row.ask)}
                  >
                    Explore <ArrowUpRight size={15} />
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
export function VisualStage({
  session,
  presentation,
  busy,
  onAsk,
  onCart,
  onCloseCart,
  onRefresh,
}: {
  session: Session;
  presentation: Presentation;
  busy: boolean;
  onAsk: (text: string) => void;
  onCart: (variantId: string, quantity: number) => void;
  onCloseCart: () => void;
  onRefresh: () => void;
}) {
  const product = session.catalog.find(
    (p) => p.id === (presentation.productId || session.selectedProductId),
  );
  if (presentation.view === "cart")
    return (
      <section className="visual-stage cart-view" aria-labelledby="cart-title">
        <div className="stage-heading">
          <h2 id="cart-title">Your cart.</h2>
          <button
            className="icon-button"
            aria-label="Close cart"
            onClick={onCloseCart}
          >
            <X size={22} />
          </button>
        </div>
        <p>Ask me to add, remove or change any item. We can keep talking.</p>
        <div className="cart-status">
          <span>
            {session.demo
              ? "Demo cart · no real orders"
              : "Connected to Shopify"}
          </span>
          <button className="text-action" disabled={busy} onClick={onRefresh}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
        {session.cart?.lines.length ? (
          <div className="cart-lines">
            {session.cart.lines.map((line, index) => {
              const p = session.catalog.find((p) =>
                p.variants.some((v) => v.id === line.variantId),
              );
              const option = p?.variants.find((v) => v.id === line.variantId);
              return (
                <article className="cart-line" key={line.variantId || index}>
                  {p?.image && <img src={p.image.src} alt={p.image.alt} />}
                  <div className="cart-line-info">
                    <h3>{line.title}</h3>
                    <p>{line.variantTitle}</p>
                    <strong>{money(line.price)} each</strong>
                    {line.variantId ? (
                      <div className="quantity-control">
                        <button
                          aria-label={
                            "Remove one " + line.title + " " + line.variantTitle
                          }
                          disabled={busy || !line.quantity}
                          onClick={() =>
                            onCart(line.variantId!, line.quantity - 1)
                          }
                        >
                          <Minus size={16} />
                        </button>
                        <output
                          aria-label={
                            line.title + " " + line.variantTitle + " quantity"
                          }
                        >
                          {line.quantity}
                        </output>
                        <button
                          aria-label={
                            "Add one " + line.title + " " + line.variantTitle
                          }
                          disabled={
                            busy ||
                            line.quantity >= 20 ||
                            !option?.available ||
                            Boolean(session.commerceError)
                          }
                          onClick={() =>
                            onCart(line.variantId!, line.quantity + 1)
                          }
                        >
                          <Plus size={16} />
                        </button>
                        <button
                          className="text-action"
                          disabled={busy}
                          onClick={() => onCart(line.variantId!, 0)}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <small>Review this item in Shopify checkout.</small>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-cart">
            <ShoppingBag size={32} />
            <h3>A little room for something good.</h3>
            <p>Your cart is empty.</p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => onAsk("Show me the collection")}
            >
              Explore the collection <ArrowUpRight size={17} />
            </button>
          </div>
        )}
        {session.cart && session.cart.quantity > 0 && (
          <div className="cart-summary">
            <div>
              <span>Subtotal</span>
              <strong>{money(session.cart.subtotal)}</strong>
            </div>
            <p>
              {session.demo
                ? "A sample checkout only. No payment is collected."
                : "Shipping, taxes and eligible discounts are calculated by Shopify at checkout."}
            </p>
            <a
              className={
                "button primary " +
                (busy || session.commerceError ? "disabled" : "")
              }
              aria-disabled={busy || Boolean(session.commerceError)}
              onClick={(e) => {
                if (busy || session.commerceError) e.preventDefault();
              }}
              href="/api/studio/checkout"
              target="_blank"
              rel="noopener"
            >
              {session.demo ? "Preview checkout" : "Continue to checkout"}
              <ArrowUpRight size={18} />
            </a>
          </div>
        )}
      </section>
    );
  if (presentation.view === "compare")
    return (
      <section className="visual-stage">
        <Comparison
          products={session.catalog
            .filter(
              (p) =>
                !presentation.productIds?.length ||
                presentation.productIds.includes(p.id),
            )
            .slice(0, 4)}
          onAsk={onAsk}
          busy={busy}
        />
      </section>
    );
  if (presentation.view === "policy") {
    const key = presentation.policy || "shipping";
    return (
      <section className="visual-stage policy-view">
        <h2>
          {key === "shipping"
            ? "Shipping."
            : key === "returns"
              ? "Returns."
              : "Here to help."}
        </h2>
        <p>
          {storefront.policies[key] || "This policy has not been configured."}
        </p>
        <button
          className="text-action"
          onClick={() => onAsk("Show me the collection")}
        >
          Back to the collection <ArrowUpRight size={17} />
        </button>
      </section>
    );
  }
  if (presentation.view === "concept") {
    const image = session.previews.find((p) => p.id === presentation.previewId);
    return (
      <section className="visual-stage concept-view">
        <h2>Your concept.</h2>
        {image && (
          <img src={image.url} alt="AI-generated illustrative concept" />
        )}
        <p>
          AI concept · illustrative, not a measured fit or product guarantee.
        </p>
      </section>
    );
  }
  if (presentation.view === "product" && product) {
    const selected = product.variants.find(
        (v) => v.id === session.selectedVariantId,
      ),
      visual = product.visuals?.find((v) => v.id === presentation.visualId);
    return (
      <section
        className="visual-stage product-view"
        aria-label={product.title + " details"}
      >
        <div className="stage-heading">
          <button
            className="text-action"
            disabled={busy}
            onClick={() => onAsk("Show me the collection")}
          >
            The collection
          </button>
          <span>{session.demo ? "Illustrative product" : ""}</span>
        </div>
        <h2>{product.title}</h2>
        {visual?.type === "model" ? (
          <Model
            src={visual.src}
            alt={visual.alt || product.title + " 3D model"}
          />
        ) : (
          <figure className="product-image">
            {visual?.src || product.image?.src ? (
              <img
                src={visual?.src || product.image?.src}
                alt={visual?.alt || product.image?.alt || product.title}
              />
            ) : (
              <p>Product image not configured.</p>
            )}
          </figure>
        )}
        {product.visuals?.length ? (
          <div
            className="visual-options"
            role="group"
            aria-label="Product views"
          >
            <button
              disabled={busy}
              aria-pressed={!visual}
              onClick={() => onAsk("Show me " + product.title)}
            >
              Overview
            </button>
            {product.visuals.map((v) => (
              <button
                disabled={busy}
                key={v.id}
                aria-pressed={visual?.id === v.id}
                onClick={() => onAsk("Show " + product.title + " " + v.label)}
              >
                {v.label}
              </button>
            ))}
          </div>
        ) : null}
        <p className="product-description">{product.description}</p>
        <dl className="product-facts">
          {Object.entries(product.facts || {}).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div
          className="variant-options"
          role="group"
          aria-label={product.title + " options"}
        >
          {product.variants.map((variant) => (
            <button
              key={variant.id}
              disabled={busy}
              aria-pressed={selected?.id === variant.id}
              onClick={() =>
                onAsk("Show me " + variant.title + " " + product.title)
              }
            >
              {variant.title}
              <span>
                {money(variant.price)}
                {!variant.available ? " · Unavailable" : ""}
              </span>
            </button>
          ))}
        </div>
        <div className="product-footer">
          {selected ? (
            <>
              <strong>{money(selected.price)}</strong>
              <button
                className="button primary"
                disabled={
                  busy || !selected.available || Boolean(session.commerceError)
                }
                onClick={() =>
                  onAsk(
                    "Add 1 " +
                      product.title +
                      " " +
                      selected.title +
                      " to my cart",
                  )
                }
              >
                {selected.available ? "Add " + selected.title : "Unavailable"}
                <Plus size={17} />
              </button>
            </>
          ) : (
            <p>Choose an option above, or tell me what you prefer.</p>
          )}
        </div>
        {storefront.video && (
          <button
            className="text-action"
            disabled={busy}
            onClick={() => onAsk("Show me the video")}
          >
            <Play size={16} />
            Watch the walkthrough
          </button>
        )}
      </section>
    );
  }
  return (
    <section
      className="visual-stage collection-view"
      aria-labelledby="collection-title"
    >
      <h2 id="collection-title">Meet the collection.</h2>
      <p>
        {session.demo
          ? "Fictional products. Real interactions."
          : "Tell me what you’re looking for, and we’ll find the right option."}
      </p>
      <div className="collection-list">
        {session.catalog.map((product) => (
          <button
            className="collection-row"
            key={product.id}
            disabled={busy}
            onClick={() => onAsk("Show me " + product.title)}
          >
            {product.image && (
              <img src={product.image.src} alt={product.image.alt} />
            )}
            <span>
              <strong>{product.title}</strong>
              <span>{product.description}</span>
              <small>
                From{" "}
                {money(
                  product.variants.reduce((a, b) =>
                    Number(a.price.amount) < Number(b.price.amount) ? a : b,
                  ).price,
                )}
              </small>
            </span>
            <ArrowUpRight size={20} />
          </button>
        ))}
      </div>
      <p className="stage-note">
        {session.scripted
          ? "Scripted guide · connect your AI provider for open conversation."
          : "Ask your guide about products, options, shipping or returns."}
      </p>
    </section>
  );
}
