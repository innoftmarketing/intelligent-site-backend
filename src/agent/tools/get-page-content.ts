import type { ToolDefinition } from "./index.js";

export const get_page_contentTool: ToolDefinition = {
  spec: {
    name: "get_page_content",
    description: "Read a page from the WordPress site. Returns text, images, and editable elements with IDs.",
    input_schema: {"type":"object","properties":{"page_id":{"type":"string","description":"The page ID or slug"}},"required":["page_id"]},
  },
  execute: async (input, ctx) => {
    const c = await ctx.wp.getPageContent(input.page_id as string); return JSON.stringify(c);
  },
};
