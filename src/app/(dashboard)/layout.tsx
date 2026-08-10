"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

const SIDEBAR_COLLAPSED_KEY = "sidebar_collapsed";

const NAV = [
  { href: "/agenda", icon: "📅", label: "Agenda" },
  { href: "/finance", icon: "💰", label: "Financeiro" },
  { href: "/diary", icon: "📓", label: "Diário" },
  { href: "/briefings", icon: "👤", label: "Contatos" },
  { href: "/groups", icon: "👥", label: "Grupos" },
  { href: "/tickets", icon: "🎫", label: "Chamados" },
  { href: "/daily-summary", icon: "📋", label: "Resumos Diários" },
  { href: "/weekly-report", icon: "📊", label: "Rel. Semanal" },
  { href: "/conversations", icon: "💬", label: "Conversas" },
  { href: "/instances", icon: "📡", label: "Instâncias" },
  { href: "/config", icon: "⚙️", label: "Configurações" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

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
          position: "relative",
          width: collapsed ? 64 : 216,
          flexShrink: 0,
          background: "var(--bg-card)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: "20px 0",
          transition: "width 0.15s",
        }}
      >
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          style={{
            position: "absolute",
            top: 310,
            right: -12,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            cursor: "pointer",
            padding: 0,
            zIndex: 10,
          }}
        >
          {collapsed ? "›" : "‹"}
        </button>

        {/* Logo */}
        <div style={{ padding: collapsed ? "0 0 20px" : "0 16px 20px", borderBottom: "1px solid var(--border-light)", textAlign: collapsed ? "center" : "left" }}>
          <div style={{ fontSize: 22 }}>🤖</div>
          {!collapsed && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginTop: 4 }}>
                Secretária
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Eletrônica</div>
            </>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {NAV.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: collapsed ? "center" : "flex-start",
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
                {!collapsed && (
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: "12px 8px", borderTop: "1px solid var(--border-light)" }}>
          <button
            onClick={handleLogout}
            title={collapsed ? "Sair" : undefined}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
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
            {!collapsed && <span>Sair</span>}
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
