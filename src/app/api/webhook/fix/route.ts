import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const result = await prisma.financeEntry.updateMany({
      where: {
        description: { contains: "(previsto)" },
      },
      data: {
        status: "pending",
      },
    });

    return NextResponse.json({ 
      success: true, 
      count: result.count, 
      message: "Contas previstas marcadas como pendentes com sucesso!" 
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
