import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./system-prompt.js";
import { getToolSpecs, findTool, type ToolContext } from "./tools/index.js";
import { updateConversation } from "../services/conversation.js";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

interface AgentInput {
  userMessage: string;
  conversationId: string;
  priorMessages: Anthropic.MessageParam[];
  toolContext: ToolContext;
  clientConfig: { name: string; businessType?: string; language?: string; tone?: string; siteUrl: string };
}

interface AgentResult {
  status: "completed" | "waiting_for_approval";
  pendingImageUrl?: string;
}

export async function runAgent(input: AgentInput): Promise<AgentResult> {
  const anthropic = getAnthropic();
  const systemPrompt = buildSystemPrompt(input.clientConfig);
  const tools = getToolSpecs();
  const messages: Anthropic.MessageParam[] = [
    ...input.priorMessages,
    { role: "user", content: input.userMessage },
  ];

  const MAX_ITERATIONS = 15;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      // Claude finished with a text response — send it to the owner via WhatsApp
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      const replyText = textBlocks.map((b) => b.text).join("\n");

      if (replyText.trim()) {
        try {
          await input.toolContext.whatsapp.sendText(
            input.toolContext.clientPhone,
            replyText
          );
        } catch (err) {
          console.error("Failed to send WhatsApp reply:", err);
        }
      }

      await updateConversation(input.conversationId, { status: "completed", claudeMessages: messages });
      return { status: "completed" };
    }

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let sentImagePreview = false;
      let pendingImageUrl: string | undefined;

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const tool = findTool(block.name);
        if (!tool) {
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Error: Unknown tool "${block.name}"`, is_error: true });
          continue;
        }
        try {
          const result = await tool.execute(block.input as Record<string, unknown>, input.toolContext);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });

          if (block.name === "generate_image") {
            const parsed = JSON.parse(result);
            pendingImageUrl = parsed.image_url;
          }
          if (block.name === "send_whatsapp" && (block.input as any).image_url) {
            sentImagePreview = true;
          }
        } catch (error) {
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${error instanceof Error ? error.message : String(error)}`, is_error: true });
        }
      }

      messages.push({ role: "user", content: toolResults });

      if (sentImagePreview && pendingImageUrl) {
        const assistantText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text).join(" ").toLowerCase();
        const isAskingApproval = ["should i", "apply", "approve", "confirm", "want me to", "go ahead"].some((kw) => assistantText.includes(kw));

        if (isAskingApproval) {
          await updateConversation(input.conversationId, {
            status: "waiting_for_approval", pendingImageUrl,
            claudeMessages: messages, pendingAction: { type: "image_approval" },
          });
          return { status: "waiting_for_approval", pendingImageUrl };
        }
      }
    }
  }

  await updateConversation(input.conversationId, { status: "completed", claudeMessages: messages });
  return { status: "completed" };
}
