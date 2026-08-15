import { useState, useEffect } from "react";

interface InvoiceItem {
  id: string;
  name: string;
  category: string;
  amount: number;
  quantity: number;
  unitPrice: number;
}

export function InvoiceDrawer({
  entryId,
  onClose,
}: {
  entryId: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/finance/invoice-items?entryId=${entryId}`)
      .then((res) => res.json())
      .then((data) => {
        setItems(data);
        setLoading(false);
      });
  }, [entryId]);

  const total = items.reduce((acc, i) => acc + i.amount, 0);

  // Agrupar por categoria para o mini-resumo
  const byCategory = items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + item.amount;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{
      position: "fixed",
      top: 0, right: 0, bottom: 0,
      width: "400px",
      maxWidth: "100%",
      background: "var(--bg)",
      borderLeft: "1px solid var(--border)",
      boxShadow: "-4px 0 24px rgba(0,0,0,0.5)",
      zIndex: 1000,
      display: "flex",
      flexDirection: "column",
      animation: "slideIn 0.2s ease-out"
    }}>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
      
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>🛒 Raio-X da Compra</h2>
        <button onClick={onClose} className="btn-ghost" style={{ padding: "4px 8px", fontSize: 18 }}>×</button>
      </div>

      <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
        {loading ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center", marginTop: 40 }}>Carregando itens...</p>
        ) : (
          <>
            <div style={{ marginBottom: 24, background: "var(--bg-card)", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
              <h3 style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12, fontWeight: 600 }}>Resumo por Categoria</h3>
              {Object.entries(byCategory).sort((a,b) => b[1] - a[1]).map(([cat, val]) => (
                <div key={cat} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                  <span>{cat}</span>
                  <span style={{ fontWeight: 500 }}>R$ {val.toFixed(2)}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid var(--border-light)", marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                <span>Total Calculado</span>
                <span>R$ {total.toFixed(2)}</span>
              </div>
            </div>

            <h3 style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12, fontWeight: 600 }}>Lista de Produtos ({items.length})</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {items.map(item => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 12, borderBottom: "1px solid var(--border-light)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{item.category} • {item.quantity}x R$ {item.unitPrice.toFixed(2)}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>R$ {item.amount.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
