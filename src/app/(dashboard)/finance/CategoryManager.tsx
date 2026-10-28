"use client";

// Gerenciar categorias e subcategorias próprias da tela do Financeiro (guardadas
// no navegador). Saiu de finance/page.tsx (28/10/2026).

import { useState } from "react";

/* ── Painel de gerenciar categorias/subcategorias personalizadas ────── */
export function CategoryManager({
  categories,
  allCategoryNames,
  subcategoriesByCategory,
  onAddCategory,
  onRemoveCategory,
  onAddSubcategory,
  onRemoveSubcategory,
  onClose,
}: {
  categories: string[];
  allCategoryNames: string[];
  subcategoriesByCategory: Record<string, string[]>;
  onAddCategory: (v: string) => void;
  onRemoveCategory: (v: string) => void;
  onAddSubcategory: (category: string, v: string) => void;
  onRemoveSubcategory: (category: string, v: string) => void;
  onClose: () => void;
}) {
  const [newCategory, setNewCategory] = useState("");
  const [newSubcategory, setNewSubcategory] = useState("");
  const [subcategoryTarget, setSubcategoryTarget] = useState(allCategoryNames[0] ?? "");

  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 6,
        width: 280,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 13 }}>Categorias personalizadas</strong>
        <button className="btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={onClose}>
          Fechar
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Categorias</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Nova categoria"
            style={{ fontSize: 12, padding: "6px 8px" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCategory.trim()) {
                onAddCategory(newCategory.trim());
                setNewCategory("");
              }
            }}
          />
          <button
            className="btn-primary"
            style={{ fontSize: 11, padding: "6px 10px" }}
            onClick={() => {
              if (newCategory.trim()) {
                onAddCategory(newCategory.trim());
                setNewCategory("");
              }
            }}
          >
            +
          </button>
        </div>
        {categories.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Nenhuma categoria extra ainda.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {categories.map((c) => (
              <span
                key={c}
                style={{
                  display: "flex", alignItems: "center", gap: 4, fontSize: 11,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 999, padding: "3px 4px 3px 10px",
                }}
              >
                {c}
                <button
                  onClick={() => onRemoveCategory(c)}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0 4px", fontSize: 12 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Subcategorias</div>
        <select
          value={subcategoryTarget}
          onChange={(e) => setSubcategoryTarget(e.target.value)}
          style={{ fontSize: 12, padding: "6px 8px", width: "100%", marginBottom: 6 }}
        >
          {allCategoryNames.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input
            value={newSubcategory}
            onChange={(e) => setNewSubcategory(e.target.value)}
            placeholder={`Nova subcategoria de ${subcategoryTarget}`}
            style={{ fontSize: 12, padding: "6px 8px" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSubcategory.trim()) {
                onAddSubcategory(subcategoryTarget, newSubcategory.trim());
                setNewSubcategory("");
              }
            }}
          />
          <button
            className="btn-primary"
            style={{ fontSize: 11, padding: "6px 10px" }}
            onClick={() => {
              if (newSubcategory.trim()) {
                onAddSubcategory(subcategoryTarget, newSubcategory.trim());
                setNewSubcategory("");
              }
            }}
          >
            +
          </button>
        </div>
        {(subcategoriesByCategory[subcategoryTarget] ?? []).length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Nenhuma subcategoria extra em {subcategoryTarget} ainda.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(subcategoriesByCategory[subcategoryTarget] ?? []).map((s) => (
              <span
                key={s}
                style={{
                  display: "flex", alignItems: "center", gap: 4, fontSize: 11,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 999, padding: "3px 4px 3px 10px",
                }}
              >
                {s}
                <button
                  onClick={() => onRemoveSubcategory(subcategoryTarget, s)}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0 4px", fontSize: 12 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
