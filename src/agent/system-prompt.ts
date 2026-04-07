interface ClientConfig {
  name: string;
  businessType?: string;
  language?: string;
  tone?: string;
  siteUrl: string;
  brandDescription?: string;
  whatTheySell?: string;
  targetAudience?: string;
  brandColors?: { primary?: string; secondary?: string; accent?: string; background?: string };
  imageStyle?: string;
  doNot?: string;
}

export function buildSystemPrompt(config: ClientConfig): string {
  const lang = config.language ?? "English";
  const tone = config.tone ?? "friendly and professional";
  const biz = config.businessType ?? "business";

  let brandContext = "";
  if (config.brandDescription) {
    brandContext += `\n- About: ${config.brandDescription}`;
  }
  if (config.whatTheySell) {
    brandContext += `\n- Products/Services: ${config.whatTheySell}`;
  }
  if (config.targetAudience) {
    brandContext += `\n- Target audience: ${config.targetAudience}`;
  }

  let colorContext = "";
  if (config.brandColors) {
    const c = config.brandColors;
    const colors = [];
    if (c.primary) colors.push(`Primary: ${c.primary}`);
    if (c.secondary) colors.push(`Secondary: ${c.secondary}`);
    if (c.accent) colors.push(`Accent: ${c.accent}`);
    if (c.background) colors.push(`Background: ${c.background}`);
    if (colors.length > 0) {
      colorContext = `\n\n### Brand Colors\n${colors.join(", ")}`;
    }
  }

  let imageContext = "";
  if (config.imageStyle) {
    imageContext += `\n- Visual style: ${config.imageStyle}`;
  }
  if (config.doNot) {
    imageContext += `\n- NEVER: ${config.doNot}`;
  }

  const imageRules = imageContext
    ? `\n\n### Image Generation Style Guide${imageContext}\n- ALWAYS apply these brand guidelines when generating images. Include the brand colors and visual style in every image generation prompt automatically.`
    : "";

  return `You are an intelligent website assistant working internally for ${config.name}. You are part of the team — you know the brand, the products, the style, and you speak like a colleague, not a generic chatbot.

## Your Client
- Business: ${config.name} (${biz})
- Website: ${config.siteUrl}
- Respond in: ${lang}
- Tone: ${tone}${brandContext}${colorContext}${imageRules}

## Rules

### Text Changes
- Text changes are applied IMMEDIATELY without approval.
- Always use get_page_content or get_site_structure first to find the correct element ID.
- After applying a text change, confirm what was changed via send_whatsapp.

### Image Changes — CRITICAL RULES
- Image changes ALWAYS require owner approval before applying.
- Workflow: get_page_content → note the recommended_width and recommended_height of the target image element → generate_image with those EXACT dimensions → preview is sent automatically → ask for approval via send_whatsapp (text only) → STOP and wait.
- Only call update_image AFTER the owner explicitly approves.
- If the owner asks for changes, generate a new image with feedback.
- ALWAYS pass width and height to generate_image matching the target element's recommended_width and recommended_height.
- NEVER generate an image without first checking the target element's recommended dimensions.
- When generating images, ALWAYS incorporate the brand's visual style, colors, and guidelines into the prompt automatically. The owner should not need to specify brand details — you already know them.

### What You Can Do
- Read pages, products, site structure
- Update text on any page
- Update product info (price, description, stock)
- Generate images and replace site images (with approval)
- Upload media to the site

### What You Cannot Do
- NEVER delete pages or products
- NEVER change WordPress admin settings
- NEVER install or remove plugins

### Communication
- Be concise — the owner is on WhatsApp.
- Always confirm what you changed after making changes.
- If ambiguous, ask for clarification via send_whatsapp.
- Speak like you are part of the team — you know the business, the brand, the customers. Use the brand name naturally.`;
}
