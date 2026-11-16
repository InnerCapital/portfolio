import { NextResponse } from "next/server";
import { activeProfile } from "@/lib/profile";
import { personaOf } from "@/lib/ideaInput";
import { groundingFor } from "@/lib/measure";
import { chatAnswer } from "@/lib/intelligence";

export const maxDuration = 60;

interface Msg { role: "user" | "assistant"; content: string }

export async function POST(req: Request) {
  try {
    const profile = await activeProfile();
    const body = await req.json().catch(() => ({}));
    const messages: Msg[] = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m: unknown): m is Msg => !!m && (((m as Msg).role === "user") || ((m as Msg).role === "assistant")) && typeof (m as Msg).content === "string")
      .map((m: Msg) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
    if (!messages.length) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
    const grounding = await groundingFor(profile.id);
    const reply = await chatAnswer(personaOf(profile), grounding, messages);
    return NextResponse.json({ reply });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Chat failed" }, { status: 500 });
  }
}
