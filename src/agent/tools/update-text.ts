import { logChange } from "../../services/change-log.js";
import type { ToolDefinition } from "./index.js";

export const updateTextTool: ToolDefinition = {
  spec: {
    name: "update_text",
    description: "Update text content on a specific page element. Applies immediately. Use get_page_content first to find the correct element_id.",
    input_schema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "The page ID" },
        element_id: { type: "string", description: "The element ID to update" },
        new_text: { type: "string", description: "The new text content" },
      },
      required: ["page_id", "element_id", "new_text"],
    },
  },
  execute: async (input, ctx) => {
    const result = await ctx.wp.updateElement(input.page_id as string, input.element_id as string, input.new_text as string);
    await logChange({ clientId: ctx.clientId, conversationId: ctx.conversationId, changeType: "text", description: `Updated text on page ${input.page_id}, element ${input.element_id}`, targetPage: input.page_id as string, targetElement: input.element_id as string, beforeValue: result.previousValue, afterValue: input.new_text as string });
    return JSON.stringify({ success: true, previousValue: result.previousValue });
  },
};
