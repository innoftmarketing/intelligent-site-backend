import type { ToolDefinition } from "./index.js";

export const get_site_structureTool: ToolDefinition = {
  spec: {
    name: "get_site_structure",
    description: "Get the full site map: all pages, menus, and sections.",
    input_schema: {"type":"object","properties":{},"required":[]},
  },
  execute: async (input, ctx) => {
    const s = await ctx.wp.getSiteStructure(); return JSON.stringify(s);
  },
};
