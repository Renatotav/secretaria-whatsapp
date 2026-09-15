import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim().toLowerCase();
  const label = searchParams.get("label")?.trim();

  let contacts = await prisma.contact.findMany({
    orderBy: { updatedAt: "desc" },
  });

  if (label && label !== "all") {
    contacts = contacts.filter((c) => {
      const labels = c.labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);
      return labels.includes(label);
    });
  }

  if (search) {
    contacts = contacts.filter((c) => {
      return (
        c.name.toLowerCase().includes(search) ||
        c.role.toLowerCase().includes(search) ||
        c.organization.toLowerCase().includes(search) ||
        c.phone.toLowerCase().includes(search) ||
        c.email.toLowerCase().includes(search) ||
        c.labels.toLowerCase().includes(search) ||
        c.notes.toLowerCase().includes(search)
      );
    });
  }

  return NextResponse.json(contacts);
});

export const POST = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const { name, role, organization, phone, email, labels, notes } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "O nome do contato é obrigatório" }, { status: 400 });
  }

  const contact = await prisma.contact.create({
    data: {
      name: name.trim(),
      role: role?.trim() || "",
      organization: organization?.trim() || "",
      phone: phone?.trim() || "",
      email: email?.trim() || "",
      labels: labels?.trim() || "",
      notes: notes?.trim() || "",
    },
  });

  return NextResponse.json(contact);
});

export const PATCH = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const body = await request.json();
  const updated = await prisma.contact.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.role !== undefined ? { role: body.role.trim() } : {}),
      ...(body.organization !== undefined ? { organization: body.organization.trim() } : {}),
      ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
      ...(body.email !== undefined ? { email: body.email.trim() } : {}),
      ...(body.labels !== undefined ? { labels: body.labels.trim() } : {}),
      ...(body.notes !== undefined ? { notes: body.notes.trim() } : {}),
      ...(body.lastContact !== undefined ? { lastContact: body.lastContact ? new Date(body.lastContact) : null } : {}),
    },
  });

  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
