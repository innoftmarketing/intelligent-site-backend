import type Anthropic from "@anthropic-ai/sdk";
import type { WordPressClient } from "../../wordpress/client.js";
import type { WhatsAppProvider } from "../../providers/whatsapp/types.js";

export interface ToolContext {
  wp: WordPressClient;
  whatsapp: WhatsAppProvider;
  clientPhone: string;
  clientId: string;
  conversationId: string;
}

export interface ToolDefinition {
  spec: Anthropic.Tool;
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

import { get_page_contentTool } from "./get-page-content.js";
import { get_productsTool } from "./get-products.js";
import { get_site_structureTool } from "./get-site-structure.js";
import { updateTextTool } from "./update-text.js";
import { updateImageTool } from "./update-image.js";
import { updateProductTool } from "./update-product.js";
import { generateImageTool } from "./generate-image.js";
import { uploadMediaTool } from "./upload-media.js";
import { sendWhatsappTool } from "./send-whatsapp.js";

export const ALL_TOOLS: ToolDefinition[] = [
  get_page_contentTool, get_productsTool, get_site_structureTool,
  updateTextTool, updateImageTool, updateProductTool,
  generateImageTool, uploadMediaTool, sendWhatsappTool,
];

export function getToolSpecs(): Anthropic.Tool[] {
  return ALL_TOOLS.map((t) => t.spec);
}

export function findTool(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.spec.name === name);
}
