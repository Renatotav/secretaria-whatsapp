"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

interface Contact {
  id: string;
  name: string;
  role: string;
  organization: string;
  phone: string;
  email: string;
  labels: string;
  notes: string;
  lastContact: string | null;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_PRESET_LABELS = [
  { name: "Magistrado", color: "#8b5cf6" },
  { name: "Servidor", color: "#3b82f6" },
  { name: "Apoio PJe", color: "#06b6d4" },
  { name: "Advogado", color: "#f59e0b" },
  { name: "Diretoria", color: "#ec4899" },
  { name: "TI / Suporte", color: "#10b981" },
  { name: "Fornecedor", color: "#64748b" },
  { name: "Urgente", color: "#ef4444" },
];

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [search, setSearch] = useState("");
  const [selectedLabel, setSelectedLabel] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [contactNotes, setContactNotes] = useState("");

  // Form State
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formOrg, setFormOrg] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formLabels, setFormLabels] = useState<string[]>([]);
  const [formCustomLabel, setFormCustomLabel] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contacts");
      const data = await res.json();
      const list: Contact[] = Array.isArray(data) ? data : [];
      setContacts(list);
      if (selected) {
        const updatedSelected = list.find((c) => c.id === selected.id);
        if (updatedSelected) {
          setSelected(updatedSelected);
          setContactNotes(updatedSelected.notes || "");
        }
      }
    } catch (err) {
      console.error(err);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    loadContacts();
  }, []);

  function handleSelect(contact: Contact) {
    setSelected(contact);
    setContactNotes(contact.notes || "");
  }

  function openCreateModal() {
    setIsEditing(false);
    setFormName("");
    setFormRole("");
    setFormOrg("");
    setFormPhone("");
    setFormEmail("");
    setFormLabels([]);
    setFormCustomLabel("");
    setFormNotes("");
    setShowModal(true);
  }

  function openEditModal(c: Contact) {
    setIsEditing(true);
    setFormName(c.name);
    setFormRole(c.role || "");
    setFormOrg(c.organization || "");
    setFormPhone(c.phone || "");
    setFormEmail(c.email || "");
    const parsedLabels = c.labels
      ? c.labels.split(",").map((l) => l.trim()).filter(Boolean)
      : [];
    setFormLabels(parsedLabels);
    setFormCustomLabel("");
    setFormNotes(c.notes || "");
    setShowModal(true);
  }

  function toggleFormLabel(labelName: string) {
    setFormLabels((prev) =>
      prev.includes(labelName) ? prev.filter((l) => l !== labelName) : [...prev, labelName]
    );
  }

  function addCustomLabel() {
    const trimmed = formCustomLabel.trim();
    if (!trimmed) return;
    if (!formLabels.includes(trimmed)) {
      setFormLabels((prev) => [...prev, trimmed]);
    }
    setFormCustomLabel("");
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) {
      alert("Por favor, preencha o nome do contato.");
      return;
    }

    setSubmitting(true);
    const payload = {
      name: formName.trim(),
      role: formRole.trim(),
      organization: formOrg.trim(),
      phone: formPhone.trim(),
      email: formEmail.trim(),
      labels: formLabels.join(", "),
      notes: formNotes.trim(),
    };

    try {
      if (isEditing && selected) {
        const res = await fetch(`/api/contacts?id=${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          setSelected(updated);
          setContactNotes(updated.notes || "");
          setShowModal(false);
        }
      } else {
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = await res.json();
          setContacts((prev) => [created, ...prev]);
          setSelected(created);
          setContactNotes(created.notes || "");
          setShowModal(false);
        }
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar contato.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(c: Contact) {
    if (!confirm(`Tem certeza que deseja excluir o contato "${c.name}"?`)) return;
    await fetch(`/api/contacts?id=${c.id}`, { method: "DELETE" });
    setContacts((prev) => prev.filter((item) => item.id !== c.id));
    if (selected?.id === c.id) setSelected(null);
  }

  async function saveNotesOnly() {
    if (!selected) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/contacts?id=${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: contactNotes }),
      });
      if (res.ok) {
        const updated = await res.json();
        setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setSelected(updated);
      }
    } finally {
      setSavingNotes(false);
    }
  }

  async function toggleContactLabel(contact: Contact, labelName: string) {
    const current = contact.labels ? contact.labels.split(",").map((l) => l.trim()).filter(Boolean) : [];
    const next = current.includes(labelName) ? current.filter((l) => l !== labelName) : [...current, labelName];
    const res = await fetch(`/api/contacts?id=${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labels: next.join(", ") }),
    });
    if (res.ok) {
      const updated = await res.json();
      setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSelected(updated);
    }
  }

  // Lista dinâmica de todas as etiquetas existentes
  const allKnownLabels = useMemo(() => {
    const set = new Set<string>();
    DEFAULT_PRESET_LABELS.forEach((p) => set.add(p.name));
    contacts.forEach((c) => {
      if (c.labels) {
        c.labels.split(",").forEach((l) => {
          const t = l.trim();
          if (t) set.add(t);
        });
      }
    });
    return Array.from(set);
  }, [contacts]);

  // Contagem por etiqueta
  const labelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: contacts.length };
    contacts.forEach((c) => {
      if (c.labels) {
        c.labels.split(",").forEach((l) => {
          const t = l.trim();
          if (t) counts[t] = (counts[t] || 0) + 1;
        });
      }
    });
    return counts;
  }, [contacts]);

  // Filtro
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (selectedLabel !== "all") {
        const currentLabels = c.labels ? c.labels.split(",").map((l) => l.trim()) : [];
        if (!currentLabels.includes(selectedLabel)) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesRole = c.role.toLowerCase().includes(q);
        const matchesOrg = c.organization.toLowerCase().includes(q);
        const matchesPhone = c.phone.toLowerCase().includes(q);
        const matchesEmail = c.email.toLowerCase().includes(q);
        const matchesNotes = c.notes.toLowerCase().includes(q);
        const matchesLabels = c.labels.toLowerCase().includes(q);
        if (!matchesName && !matchesRole && !matchesOrg && !matchesPhone && !matchesEmail && !matchesNotes && !matchesLabels) {
          return false;
        }
      }
      return true;
    });
  }, [contacts, selectedLabel, search]);

  function getLabelColor(name: string) {
    const found = DEFAULT_PRESET_LABELS.find((p) => p.name.toLowerCase() === name.toLowerCase());
    return found ? found.color : "#3b82f6";
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Sidebar List */}
      <div
        style={{
          width: 380,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-card)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                👤 Contatos & CRM
              </h1>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                {contacts.length} {contacts.length === 1 ? "registro" : "registros"}
              </p>
            </div>
            <button
              onClick={openCreateModal}
              className="btn-primary"
              style={{
                fontSize: 12,
                padding: "6px 12px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 600,
              }}
            >
              <span>+</span> Novo Contato
            </button>
          </div>

          {/* Search */}
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="🔍 Buscar por nome, cargo, órgão..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
              }}
            />
          </div>

          {/* Labels Filter Scroll */}
          <div
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              paddingBottom: 4,
              scrollbarWidth: "none",
            }}
          >
            <button
              onClick={() => setSelectedLabel("all")}
              style={{
                fontSize: 11,
                padding: "4px 10px",
                borderRadius: 20,
                border: "1px solid",
                borderColor: selectedLabel === "all" ? "var(--accent)" : "var(--border)",
                background: selectedLabel === "all" ? "var(--accent)" : "transparent",
                color: selectedLabel === "all" ? "#fff" : "var(--text-muted)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontWeight: 600,
              }}
            >
              Todos ({labelCounts.all || 0})
            </button>
            {allKnownLabels.map((lbl) => {
              const count = labelCounts[lbl] || 0;
              const isSelected = selectedLabel === lbl;
              const color = getLabelColor(lbl);
              return (
                <button
                  key={lbl}
                  onClick={() => setSelectedLabel(isSelected ? "all" : lbl)}
                  style={{
                    fontSize: 11,
                    padding: "4px 10px",
                    borderRadius: 20,
                    border: "1px solid",
                    borderColor: isSelected ? color : "var(--border)",
                    background: isSelected ? color : "rgba(255,255,255,0.03)",
                    color: isSelected ? "#fff" : "var(--text)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: isSelected ? "#fff" : color,
                    }}
                  />
                  {lbl} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Contacts List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Carregando contatos...
            </div>
          )}

          {!loading && contacts.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
              <span style={{ fontSize: 32 }}>📇</span>
              <p style={{ margin: "8px 0 4px", fontWeight: 600 }}>Nenhum contato cadastrado</p>
              <p style={{ fontSize: 12, margin: 0 }}>
                Clique no botão <strong>+ Novo Contato</strong> acima para começar seu cadastro.
              </p>
            </div>
          )}

          {!loading && contacts.length > 0 && filteredContacts.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Nenhum contato encontrado com este filtro.
            </div>
          )}

          {filteredContacts.map((c) => {
            const isSelected = selected?.id === c.id;
            const labelsArray = c.labels ? c.labels.split(",").map((l) => l.trim()).filter(Boolean) : [];
            return (
              <button
                key={c.id}
                onClick={() => handleSelect(c)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: isSelected ? "var(--bg-hover)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border-light)",
                  borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  transition: "all 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                    {c.name}
                  </span>
                  {c.phone && (
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      📱 {c.phone}
                    </span>
                  )}
                </div>

                {(c.role || c.organization) && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {c.role} {c.role && c.organization && "•"} {c.organization}
                  </div>
                )}

                {labelsArray.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                    {labelsArray.map((lbl) => {
                      const color = getLabelColor(lbl);
                      return (
                        <span
                          key={lbl}
                          style={{
                            fontSize: 10,
                            padding: "2px 8px",
                            borderRadius: 12,
                            background: `${color}20`,
                            color: color,
                            border: `1px solid ${color}40`,
                            fontWeight: 600,
                          }}
                        >
                          {lbl}
                        </span>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Detail / CRM Area */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {!selected ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 48, opacity: 0.7 }}>📇</span>
            <h3 style={{ margin: 0, fontWeight: 600 }}>Selecione um contato</h3>
            <p style={{ margin: 0, fontSize: 13 }}>
              Ou clique em <strong>+ Novo Contato</strong> para registrar uma nova pessoa.
            </p>
          </div>
        ) : (
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            {/* Header Card */}
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 24,
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 16,
                      background: "linear-gradient(135deg, var(--accent) 0%, #a855f7 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
                      fontWeight: 700,
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {selected.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--text)" }}>
                      {selected.name}
                    </h2>
                    <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                      {selected.role || "Sem cargo definido"}
                      {selected.organization && ` • ${selected.organization}`}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => openEditModal(selected)}
                    className="btn-ghost"
                    style={{ fontSize: 12, padding: "6px 12px" }}
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => handleDelete(selected)}
                    style={{
                      background: "rgba(230, 103, 103, 0.12)",
                      color: "var(--danger, #e66767)",
                      border: "1px solid rgba(230, 103, 103, 0.25)",
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    🗑️ Excluir
                  </button>
                </div>
              </div>

              {/* Contact Channels (Phone / WhatsApp / Email) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: "1px solid var(--border-light)",
                }}
              >
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)", display: "block", fontSize: 11, marginBottom: 2 }}>
                    Telefone / WhatsApp
                  </span>
                  {selected.phone ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ color: "var(--text)" }}>{selected.phone}</strong>
                      <a
                        href={`https://wa.me/${selected.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 11,
                          color: "var(--success, #10b981)",
                          textDecoration: "none",
                          background: "rgba(16, 185, 129, 0.15)",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontWeight: 600,
                        }}
                      >
                        Abrir WhatsApp ↗
                      </a>
                    </div>
                  ) : (
                    <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>Não informado</span>
                  )}
                </div>

                <div style={{ fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)", display: "block", fontSize: 11, marginBottom: 2 }}>
                    E-mail
                  </span>
                  {selected.email ? (
                    <a
                      href={`mailto:${selected.email}`}
                      style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
                    >
                      {selected.email}
                    </a>
                  ) : (
                    <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>Não informado</span>
                  )}
                </div>
              </div>

              {/* Labels Selector on Contact Card */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-light)" }}>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: 11, marginBottom: 8 }}>
                  Etiquetas associadas (clique para adicionar ou remover):
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {allKnownLabels.map((lbl) => {
                    const currentLabels = selected.labels
                      ? selected.labels.split(",").map((l) => l.trim()).filter(Boolean)
                      : [];
                    const isActive = currentLabels.includes(lbl);
                    const color = getLabelColor(lbl);
                    return (
                      <button
                        key={lbl}
                        onClick={() => toggleContactLabel(selected, lbl)}
                        style={{
                          fontSize: 11,
                          padding: "4px 10px",
                          borderRadius: 14,
                          border: "1px solid",
                          borderColor: isActive ? color : "var(--border)",
                          background: isActive ? color : "transparent",
                          color: isActive ? "#fff" : "var(--text-muted)",
                          cursor: "pointer",
                          fontWeight: 600,
                          transition: "all 0.15s",
                        }}
                      >
                        {isActive ? `✓ ${lbl}` : `+ ${lbl}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Notes & History (CRM Notebook) */}
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 24,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text)" }}>
                    📝 Histórico de Contato & Anotações
                  </h3>
                  <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                    Registre pendências, reuniões, solicitações e detalhes deste contato
                  </p>
                </div>
                <button
                  onClick={saveNotesOnly}
                  disabled={savingNotes}
                  className="btn-primary"
                  style={{ fontSize: 12, padding: "6px 14px" }}
                >
                  {savingNotes ? "Salvando..." : "Salvar Anotações"}
                </button>
              </div>

              <textarea
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
                placeholder="Exemplo:&#10;- 15/09: Alinhamento sobre suporte da 2ª Vara Cível. Ficou de enviar os autos pendentes.&#10;- Preferência de contato no período da manhã."
                rows={8}
                style={{
                  width: "100%",
                  padding: "12px",
                  fontSize: 13,
                  lineHeight: "1.6",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Modal: Novo / Editar Contato */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 520,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 24,
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                {isEditing ? "✏️ Editar Contato" : "👤 Novo Contato"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>
                  Nome completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Dr. Roberto / Amanda Alexandre"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>
                    Cargo / Função
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Juiz de Direito, Apoio PJe"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>
                    Órgão / Setor / Empresa
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Vara Cível, Tribunal, TI"
                    value={formOrg}
                    onChange={(e) => setFormOrg(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>
                    Telefone / WhatsApp (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: (84) 99999-9999"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>
                    E-mail (opcional)
                  </label>
                  <input
                    type="email"
                    placeholder="contato@exemplo.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                  />
                </div>
              </div>

              {/* Labels Selector */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>
                  Etiquetas de classificação
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {allKnownLabels.map((lbl) => {
                    const isSelected = formLabels.includes(lbl);
                    const color = getLabelColor(lbl);
                    return (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => toggleFormLabel(lbl)}
                        style={{
                          fontSize: 11,
                          padding: "4px 10px",
                          borderRadius: 14,
                          border: "1px solid",
                          borderColor: isSelected ? color : "var(--border)",
                          background: isSelected ? color : "transparent",
                          color: isSelected ? "#fff" : "var(--text-muted)",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {isSelected ? `✓ ${lbl}` : `+ ${lbl}`}
                      </button>
                    );
                  })}
                </div>

                {/* Add Custom Label */}
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text"
                    placeholder="Outra etiqueta..."
                    value={formCustomLabel}
                    onChange={(e) => setFormCustomLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomLabel();
                      }
                    }}
                    style={{ flex: 1, padding: "6px 10px", fontSize: 11, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                  />
                  <button
                    type="button"
                    onClick={addCustomLabel}
                    className="btn-ghost"
                    style={{ fontSize: 11, padding: "6px 10px" }}
                  >
                    Adicionar Etiqueta
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>
                  Anotações iniciais
                </label>
                <textarea
                  rows={3}
                  placeholder="Informações relevantes, histórico ou pendências..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-ghost"
                  style={{ fontSize: 12 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary"
                  style={{ fontSize: 12 }}
                >
                  {submitting ? "Salvando..." : isEditing ? "Salvar Alterações" : "Cadastrar Contato"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
