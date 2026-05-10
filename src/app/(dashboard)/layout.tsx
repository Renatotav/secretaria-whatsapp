"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

const NAV = [
  { href: "/", icon: "💬", label: "Chat de Teste" },
  { href: "/briefings", icon: "👤", label: "Contatos" },
  { href: "/agenda", icon: "📅", label: "Agenda" },
  { href: "/tickets", icon: "🎫", label: "Chamados" },
  { href: "/daily-summary", icon: "📋", label: "Resumos Diários" },
  { href: "/weekly-report", icon: "📊", label: "Rel. Semanal" },
  { href: "/conversations", icon: "💬", label: "Conversas" },
  { href: "/groups", icon: "👥", label: "Grupos" },
  { href: "/config", icon: "⚙️", label: "Configurações" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 216,
          flexShrink: 0,
          background: "var(--bg-card)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: "20px 0",
        }}
      >
        {/* Logo */}
        <div style={{ padding: "0 16px 20px", borderBottom: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: 22 }}>🤖</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginTop: 4 }}>
            Secretária
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Eletrônica</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {NAV.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  marginBottom: 2,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                  background: isActive ? "var(--accent-dim)" : "transparent",
                  border: isActive ? "1px solid var(--accent-border)" : "1px solid transparent",
                  textDecoration: "none",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: "12px 8px", borderTop: "1px solid var(--border-light)" }}>
          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 8,
              fontSize: 13,
              color: "var(--text-muted)",
              background: "transparent",
              border: "none",
            }}
          >
            <span>🚪</span>
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {children}
      </main>
    </div>
  );
}
