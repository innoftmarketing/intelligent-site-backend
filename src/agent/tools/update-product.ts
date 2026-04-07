import { logChange } from "../../services/change-log.js";
import type { ToolDefinition } from "./index.js";

export const updateProductTool: ToolDefinition = {
  spec: {
    name: "update_product",
    description: "Update a WooCommerce product. Applies immediately.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "The product ID" },
        name: { type: "string", description: "New product name" },
        price: { type: "string", description: "New price" },
        description: { type: "string", description: "New description" },
        stock: { type: "number", description: "New stock quantity" },
      },
      required: ["product_id"],
    },
  },
  execute: async (input, ctx) => {
    const updates: Record<string, unknown> = {};
    for (const key of ["name", "price", "description", "stock"]) {
      if (input[key] !== undefined) updates[key] = input[key];
    }
    const result = await ctx.wp.updateProduct(input.product_id as string, updates);
    await logChange({ clientId: ctx.clientId, conversationId: ctx.conversationId, changeType: "product", description: `Updated product ${input.product_id}: ${Object.keys(updates).join(", ")}`, beforeValue: JSON.stringify(result.previousValues), afterValue: JSON.stringify(updates) });
    return JSON.stringify({ success: true, updated: Object.keys(updates) });
  },
};
