import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@trigger.dev/sdk";
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

  logger.info("Agent started", {
    userMessage: input.userMessage,
    clientConfig: input.clientConfig,
    priorMessagesCount: input.priorMessages.length,
  });

  const MAX_ITERATIONS = 15;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    logger.info(`Claude API call - iteration ${i + 1}`, {
      messageCount: messages.length,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    logger.info("Claude response received", {
      stopReason: response.stop_reason,
      contentBlocks: response.content.map((b) => ({
        type: b.type,
        ...(b.type === "text" ? { text: b.text.substring(0, 200) } : {}),
        ...(b.type === "tool_use" ? { toolName: b.name, input: b.input } : {}),
      })),
      usage: response.usage,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      const replyText = textBlocks.map((b) => b.text).join("\n");

      if (replyText.trim()) {
        logger.info("Sending WhatsApp reply", {
          to: input.toolContext.clientPhone,
          textPreview: replyText.substring(0, 200),
        });

        try {
          await input.toolContext.whatsapp.sendText(
            input.toolContext.clientPhone,
            replyText
          );
          logger.info("WhatsApp reply sent successfully");
        } catch (err) {
          logger.error("Failed to send WhatsApp reply", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await updateConversation(input.conversationId, { status: "completed", claudeMessages: messages });
      logger.info("Agent completed", { status: "completed" });
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
          logger.error(`Unknown tool: ${block.name}`);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Error: Unknown tool "${block.name}"`, is_error: true });
          continue;
        }

        logger.info(`Executing tool: ${block.name}`, { input: block.input });

        try {
          const result = await tool.execute(block.input as Record<string, unknown>, input.toolContext);

          logger.info(`Tool result: ${block.name}`, {
            resultPreview: result.substring(0, 300),
          });

          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });

          if (block.name === "generate_image") {
            const parsed = JSON.parse(result);
            pendingImageUrl = parsed.image_url;
          }
          if (block.name === "send_whatsapp" && (block.input as any).image_url) {
            sentImagePreview = true;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.error(`Tool error: ${block.name}`, { error: errorMsg });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${errorMsg}`, is_error: true });
        }
      }

      messages.push({ role: "user", content: toolResults });

      if (sentImagePreview && pendingImageUrl) {
        const assistantText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text).join(" ").toLowerCase();
        const isAskingApproval = ["should i", "apply", "approve", "confirm", "want me to", "go ahead"].some((kw) => assistantText.includes(kw));

        if (isAskingApproval) {
          logger.info("Pausing for approval", { pendingImageUrl });
          await updateConversation(input.conversationId, {
            status: "waiting_for_approval", pendingImageUrl,
            claudeMessages: messages, pendingAction: { type: "image_approval" },
          });
          return { status: "waiting_for_approval", pendingImageUrl };
        }
      }
    }
  }

  logger.warn("Agent reached max iterations");
  await updateConversation(input.conversationId, { status: "completed", claudeMessages: messages });
  return { status: "completed" };
}
