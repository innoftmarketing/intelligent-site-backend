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
  pendingImageUrl?: string;
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
    priorMessagesCount: input.priorMessages.length,
    hasPendingImage: !!input.pendingImageUrl,
  });

  const MAX_ITERATIONS = 15;
  let alreadySentWhatsApp = false;
  // Carry over the pending image from a previous conversation turn
  let generatedImageUrl: string | undefined = input.pendingImageUrl;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    logger.info(`Claude API call - iteration ${i + 1}`);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    logger.info("Claude response", {
      stopReason: response.stop_reason,
      blocks: response.content.map((b) => ({
        type: b.type,
        ...(b.type === "text" ? { text: b.text.substring(0, 200) } : {}),
        ...(b.type === "tool_use" ? { tool: b.name } : {}),
      })),
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      const replyText = textBlocks.map((b) => b.text).join("\n");

      // Check if Claude is asking a question or needs clarification (keep conversation open)
      const isQuestion = replyText.includes("?") || replyText.toLowerCase().includes("which") || replyText.toLowerCase().includes("where");

      if (!alreadySentWhatsApp && replyText.trim()) {
        logger.info("Auto-sending WhatsApp reply");
        try {
          await input.toolContext.whatsapp.sendText(input.toolContext.clientPhone, replyText);
          alreadySentWhatsApp = true;
        } catch (err) {
          logger.error("Failed to send reply", { error: String(err) });
        }
      }

      // Keep conversation active if there's a pending image or Claude asked a question
      if (generatedImageUrl || isQuestion) {
        logger.info("Keeping conversation active", { generatedImageUrl, isQuestion });
        await updateConversation(input.conversationId, {
          status: "waiting_for_approval",
          pendingImageUrl: generatedImageUrl ?? null,
          claudeMessages: messages,
          pendingAction: generatedImageUrl ? { type: "image_approval", imageUrl: generatedImageUrl } : null,
        });
        return { status: "waiting_for_approval", pendingImageUrl: generatedImageUrl };
      }

      await updateConversation(input.conversationId, { status: "completed", claudeMessages: messages });
      return { status: "completed" };
    }

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const tool = findTool(block.name);
        if (!tool) {
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Error: Unknown tool "${block.name}"`, is_error: true });
          continue;
        }

        logger.info(`Tool: ${block.name}`, { input: block.input });

        try {
          const result = await tool.execute(block.input as Record<string, unknown>, input.toolContext);
          logger.info(`Tool result: ${block.name}`, { preview: result.substring(0, 300) });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });

          if (block.name === "send_whatsapp") {
            alreadySentWhatsApp = true;
          }

          if (block.name === "generate_image") {
            const parsed = JSON.parse(result);
            generatedImageUrl = parsed.image_url;
            alreadySentWhatsApp = true;
          }

          // If update_image or update_text was used, clear the pending image (action completed)
          if (block.name === "update_image" || block.name === "update_text") {
            generatedImageUrl = undefined;
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.error(`Tool error: ${block.name}`, { error: msg });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${msg}`, is_error: true });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  await updateConversation(input.conversationId, { status: "completed", claudeMessages: messages });
  return { status: "completed" };
}
