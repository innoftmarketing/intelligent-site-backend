import { logChange } from "../../services/change-log.js";
import type { ToolDefinition } from "./index.js";

export const updateImageTool: ToolDefinition = {
  spec: {
    name: "update_image",
    description: "Replace an image on a page. ONLY call this AFTER the owner has approved the new image via WhatsApp.",
    input_schema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "The page ID" },
        element_id: { type: "string", description: "The image element ID" },
        new_image_url: { type: "string", description: "URL of the new image" },
      },
      required: ["page_id", "element_id", "new_image_url"],
    },
  },
  execute: async (input, ctx) => {
    const result = await ctx.wp.updateElement(input.page_id as string, input.element_id as string, input.new_image_url as string);
    await logChange({ clientId: ctx.clientId, conversationId: ctx.conversationId, changeType: "image", description: `Replaced image on page ${input.page_id}`, targetPage: input.page_id as string, targetElement: input.element_id as string, beforeValue: result.previousValue, afterValue: input.new_image_url as string });
    return JSON.stringify({ success: true });
  },
};
