import { decrypt } from "../services/encryption.js";

interface PageElement {
  id: string;
  type: "heading" | "text" | "image" | "button";
  content: string;
  tag?: string;
}

interface PageContent {
  id: string;
  title: string;
  elements: PageElement[];
}

interface SiteStructure {
  pages: { id: string; title: string; slug: string }[];
  menus: { id: string; name: string; items: string[] }[];
}

interface Product {
  id: string;
  name: string;
  price: string;
  description: string;
  stock: number;
  categories: string[];
}

export class WordPressClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(wordpressUrl: string, encryptedApiKey: string, encryptedApiSecret: string) {
    this.baseUrl = `${wordpressUrl}/wp-json/intelligent-site/v1`;
    this.apiKey = decrypt(encryptedApiKey, process.env.MASTER_ENCRYPTION_KEY!);
    this.apiSecret = decrypt(encryptedApiSecret, process.env.MASTER_ENCRYPTION_KEY!);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.apiKey,
        "X-Api-Secret": this.apiSecret,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WordPress API ${method} ${path} failed: ${res.status} ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async getSiteStructure(): Promise<SiteStructure> {
    return this.request<SiteStructure>("GET", "/site-map");
  }

  async getPageContent(pageId: string): Promise<PageContent> {
    return this.request<PageContent>("GET", `/page/${pageId}`);
  }

  async updateElement(pageId: string, elementId: string, newValue: string): Promise<{ success: boolean; previousValue: string }> {
    return this.request("POST", `/page/${pageId}/update`, { element_id: elementId, new_value: newValue });
  }

  async uploadMedia(imageUrl: string, filename: string, targetWidth?: number, targetHeight?: number): Promise<{ mediaId: string; url: string }> {
    const body: Record<string, unknown> = { image_url: imageUrl, filename };
    if (targetWidth && targetHeight) {
      body.target_width = targetWidth;
      body.target_height = targetHeight;
    }
    return this.request("POST", "/media", body);
  }

  async getProducts(): Promise<Product[]> {
    return this.request<Product[]>("GET", "/products");
  }

  async updateProduct(productId: string, updates: Partial<Product>): Promise<{ success: boolean; previousValues: Partial<Product> }> {
    return this.request("POST", `/products/${productId}/update`, updates);
  }

  async rollback(pageId: string, elementId: string): Promise<{ success: boolean; restoredValue: string }> {
    return this.request("POST", "/rollback", { page_id: pageId, element_id: elementId });
  }
}
