import type { ToolDefinition } from "./index.js";

export const get_productsTool: ToolDefinition = {
  spec: {
    name: "get_products",
    description: "List all WooCommerce products with prices, descriptions, stock levels.",
    input_schema: {"type":"object","properties":{},"required":[]},
  },
  execute: async (input, ctx) => {
    const p = await ctx.wp.getProducts(); return JSON.stringify(p);
  },
};
