import type { ProductDetailView } from "@/lib/types";
import Chevron from "./Chevron";

export default function DetailScreen({ product, onBack }: { product: ProductDetailView; onBack: () => void }) {
  const { evidence, interactions, ingredients } = product;

  const totalStudies = evidence.reduce((sum, e) => sum + e.studyCount, 0);
  const researchSub =
    evidence.length === 1
      ? evidence[0]!.sub
      : evidence.length > 1
        ? `Combined evidence across ${evidence.length} active ingredients`
        : "No published research on file for this product's ingredients yet";

  const relevantInteractions = interactions.filter((i) => i.relevant);
  const otherInteractions = interactions.filter((i) => !i.relevant);
  const reviewVerdicts = evidence.filter((e) => e.reviewVerdict);
  const showIngredientLabels = evidence.length > 1;

  function amountInProduct(ingredientName: string): string | null {
    const match = ingredients.find((i) => i.name === ingredientName && i.active);
    return match?.amt ?? null;
  }

  return (
    <>
      <button className="back" onClick={onBack}>
        ‹ Back to search
      </button>

      <div className="product-block">
        <div className="product-thumb">{product.initials}</div>
        <div>
          <div className="brand">{product.brand}</div>
          <h2 className="pname">{product.name}</h2>
          <p className="subline">{product.sub}</p>
        </div>
      </div>

      <div className="note-strip">
        This info is about the ingredients in this product, based on public research and interaction reports — not a
        rating of the brand itself.
      </div>

      <div className="panel-row">
        <div className="panel">
          <div className="panel-label">Research found</div>
          <div className="panel-count">
            {totalStudies} <span className="unit">studies</span>
          </div>
          <div className="panel-sub">{researchSub}</div>
        </div>
        <div className="panel">
          <div className="panel-label">Interactions found</div>
          <div className="panel-count">
            {interactions.length} <span className="unit">on file</span>
          </div>
          <div className="panel-sub">
            {relevantInteractions.length
              ? `${relevantInteractions.length} match what you're taking`
              : "None match what you're taking"}
          </div>
        </div>
      </div>

      {reviewVerdicts.length > 0 && (
        <details className="detail">
          <summary>
            What reviewers concluded
            <Chevron />
          </summary>
          <div className="detail-body">
            {reviewVerdicts.map((e) => (
              <div key={e.ingredientId} className="ingredient-evidence-block">
                {showIngredientLabels && <div className="ing-evidence-name">{e.ingredientName}</div>}
                {e.reviewVerdict!.text}
                <div className="fact-line">
                  <span className="k">But:</span>
                  <span className="v">{e.reviewVerdict!.caveat}</span>
                </div>
                <span className="src">Source: {e.reviewVerdict!.source}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <details className="detail">
        <summary>
          What&apos;s actually in this
          <Chevron />
        </summary>
        <div className="detail-body">
          <div className="ingredient-strip">
            {ingredients.map((ing, idx) => (
              <div className={`ing-chip ${ing.active ? "active" : ""}`} key={idx}>
                <div className="name">{ing.name}</div>
                <div className="amt">{ing.amt}</div>
              </div>
            ))}
          </div>
          Taken from the product label.
          <span className="src">Verified {product.verifiedDate}</span>
        </div>
      </details>

      <details className="detail">
        <summary>
          What the research says
          <Chevron />
        </summary>
        <div className="detail-body">
          {evidence.length === 0 && <span className="no-interactions">No published research on file yet.</span>}
          {evidence.map((e) => (
            <div key={e.ingredientId} className="ingredient-evidence-block">
              {showIngredientLabels && <div className="ing-evidence-name">{e.ingredientName}</div>}
              {e.studyCount} studies found looking at this ingredient&apos;s main use.
              <div className="fact-line">
                <span className="k">Amount studied:</span>
                <span className="v">{e.studiedAmount}</span>
              </div>
              {amountInProduct(e.ingredientName) && (
                <div className="fact-line">
                  <span className="k">Amount in this product:</span>
                  <span className="v">{amountInProduct(e.ingredientName)}</span>
                </div>
              )}
              {e.chips.map((c) => (
                <span className="record-chip" key={c}>
                  {c}
                </span>
              ))}
              <span className="src">Source: {e.src}</span>
            </div>
          ))}
        </div>
      </details>

      <details className="detail">
        <summary>
          What it can interact with
          <Chevron />
        </summary>
        <div className="detail-body">
          {interactions.length === 0 ? (
            <span className="no-interactions">Nothing on file for this ingredient.</span>
          ) : (
            <>
              {relevantInteractions.map((i) => (
                <div style={{ marginBottom: 12 }} key={i.ingredientId + i.drugId}>
                  {showIngredientLabels && <div className="ing-evidence-name">{i.ingredientName}</div>}
                  {i.text}
                  <span className="record-chip">{i.severity}</span>
                </div>
              ))}
              {otherInteractions.length > 0 && (
                <div
                  style={{
                    marginTop: relevantInteractions.length ? 14 : 0,
                    paddingTop: relevantInteractions.length ? 12 : 0,
                    borderTop: relevantInteractions.length ? "1px dashed var(--line)" : "none",
                  }}
                >
                  <div style={{ fontSize: 12, color: "rgba(18,36,31,0.45)", marginBottom: 8 }}>
                    Other things it can interact with:
                  </div>
                  {otherInteractions.map((i) => (
                    <div style={{ marginBottom: 9, opacity: 0.75 }} key={i.ingredientId + i.drugId}>
                      {showIngredientLabels && <div className="ing-evidence-name">{i.ingredientName}</div>}
                      {i.text} <span className="record-chip">{i.severity}</span>
                    </div>
                  ))}
                </div>
              )}
              <span className="src">Source: {interactions[0]?.src}</span>
            </>
          )}
        </div>
      </details>

      <p className="disclaimer">
        For information only — this isn&apos;t medical advice. Talk to a doctor or pharmacist about your own
        situation.
      </p>
    </>
  );
}
