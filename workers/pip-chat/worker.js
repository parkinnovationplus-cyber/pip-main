/**
 * PIP Chat — Cloudflare Worker
 * - POST JSON: { messages: [{ role: "user"|"assistant", content: string }], sessionId?: string }
 * - Response: { reply: string } on success
 *
 * sessionId: ถ้า client ส่งมา (เช่น จาก sessionStorage) จะใช้เป็นตัวเดียวกันตลอดแท็บ/เซสชัน
 *            ถ้าไม่ส่ง Worker จะสุ่ม UUID ต่อ request (แต่ละข้อความจะไม่รวมกลุ่มเป็น session เดียว)
 *
 * Secrets / vars: ANTHROPIC_API_KEY, GOOGLE_SHEET_WEBHOOK (optional)
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-3-5-haiku-20241022";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("PIP chat worker is running", {
        headers: { "Content-Type": "text/plain" },
      });
    }

    try {
      const body = await request.json();
      const { messages, sessionId: clientSessionId } = body;

      if (!Array.isArray(messages) || messages.length === 0) {
        return jsonResponse({ error: "messages must be a non-empty array" }, 400);
      }

      /** ข้อความ user ล่าสุด — ใช้บันทึก Sheets */
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const userMessage = typeof lastUser?.content === "string" ? lastUser.content : "";

      /**
       * sessionId: ใช้จาก client ถ้ามี (แนะนำให้ส่งจากหน้าเว็บ)
       * ไม่มี → สุ่มใหม่ต่อคำขอ (ไม่เชื่อมหลายข้อความเป็น session เดียว)
       */
      const sessionId =
        typeof clientSessionId === "string" && clientSessionId.trim().length > 0
          ? clientSessionId.trim()
          : crypto.randomUUID();

      const anthropicMessages = messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string" ? m.content : "",
      }));

      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          messages: anthropicMessages,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return jsonResponse({ error: data }, res.status);
      }

      const block = data.content?.[0];
      const reply =
        block?.type === "text" && typeof block.text === "string"
          ? block.text
          : typeof block?.text === "string"
            ? block.text
            : "";

      const timestamp = new Date().toISOString();

      /** บันทึก Sheets แบบไม่บล็อก response — ต้องใช้ waitUntil บน Workers */
      if (env.GOOGLE_SHEET_WEBHOOK) {
        ctx.waitUntil(
          fetch(env.GOOGLE_SHEET_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timestamp,
              userMessage,
              botReply: reply,
              sessionId,
            }),
          }).catch(() => {})
        );
      }

      return jsonResponse({ reply }, 200);
    } catch (e) {
      return jsonResponse(
        { error: e instanceof Error ? e.message : String(e) },
        500
      );
    }
  },
};
