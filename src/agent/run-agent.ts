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
    priorMessagesCount: input.priorMessages.length,
  });

  const MAX_ITERATIONS = 15;
  let alreadySentWhatsApp = false;
  let generatedImageUrl: string | undefined;

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
      // If an image was generated in this conversation, pause for approval
      if (generatedImageUrl) {
        logger.info("Pausing for image approval", { generatedImageUrl });
        await updateConversation(input.conversationId, {
          status: "waiting_for_approval",
          pendingImageUrl: generatedImageUrl,
          claudeMessages: messages,
          pendingAction: { type: "image_approval", imageUrl: generatedImageUrl },
        });
        return { status: "waiting_for_approval", pendingImageUrl: generatedImageUrl };
      }

      // No image — send text reply if Claude didn't already use send_whatsapp
      if (!alreadySentWhatsApp) {
        const textBlocks = response.content.filter(
          (b): b is Anthropic.TextBlock => b.type === "text"
        );
        const replyText = textBlocks.map((b) => b.text).join("\n");

        if (replyText.trim()) {
          logger.info("Auto-sending WhatsApp reply");
          try {
            await input.toolContext.whatsapp.sendText(input.toolContext.clientPhone, replyText);
          } catch (err) {
            logger.error("Failed to send reply", { error: String(err) });
          }
        }
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

          // Track generated images for approval flow
          if (block.name === "generate_image") {
            const parsed = JSON.parse(result);
            generatedImageUrl = parsed.image_url;
            alreadySentWhatsApp = true; // generate_image already sends the preview
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
