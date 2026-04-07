<?php
class ISC_Content_Reader {
    public function get_page($request) {
        $page_id = (int) $request["id"];
        $page = get_post($page_id);
        if (!$page || $page->post_type !== "page") {
            return new WP_Error("not_found", "Page not found", ["status" => 404]);
        }

        $elements = $this->is_elementor_page($page_id)
            ? $this->get_elementor_elements($page_id)
            : $this->get_wp_elements($page);

        return rest_ensure_response([
            "id" => (string) $page_id,
            "title" => $page->post_title,
            "elements" => $elements,
        ]);
    }

    private function is_elementor_page($id) {
        return get_post_meta($id, "_elementor_edit_mode", true) === "builder";
    }

    private function get_elementor_elements($id) {
        $data = get_post_meta($id, "_elementor_data", true);
        if (!$data) return [];
        $parsed = is_string($data) ? json_decode($data, true) : $data;
        if (!is_array($parsed)) return [];
        $elements = [];
        $this->extract_widgets($parsed, $elements);
        return $elements;
    }

    private function extract_widgets($sections, &$elements) {
        foreach ($sections as $section) {
            if (isset($section["widgetType"])) {
                $el = ["id" => $section["id"], "type" => "text"];
                $s = $section["settings"] ?? [];
                switch ($section["widgetType"]) {
                    case "heading":
                        $el["type"] = "heading";
                        $el["content"] = $s["title"] ?? "";
                        $el["tag"] = $s["header_size"] ?? "h2";
                        break;
                    case "text-editor":
                        $el["content"] = $s["editor"] ?? "";
                        break;
                    case "image":
                        $el["type"] = "image";
                        $el["content"] = $s["image"]["url"] ?? "";
                        break;
                    case "button":
                        $el["type"] = "button";
                        $el["content"] = $s["text"] ?? "";
                        break;
                    default:
                        $el["content"] = wp_json_encode($s);
                }
                $elements[] = $el;
            }
            if (!empty($section["elements"])) {
                $this->extract_widgets($section["elements"], $elements);
            }
        }
    }

    private function get_wp_elements($page) {
        $blocks = parse_blocks($page->post_content);
        $elements = [];
        $idx = 0;
        foreach ($blocks as $block) {
            if (empty($block["blockName"])) continue;
            $el = ["id" => "wp-block-" . $idx, "type" => "text", "content" => ""];
            switch ($block["blockName"]) {
                case "core/heading":
                    $el["type"] = "heading";
                    $el["content"] = wp_strip_all_tags($block["innerHTML"]);
                    break;
                case "core/paragraph":
                    $el["content"] = wp_strip_all_tags($block["innerHTML"]);
                    break;
                case "core/image":
                    $el["type"] = "image";
                    preg_match('/src="([^"]+)"/', $block["innerHTML"], $m);
                    $el["content"] = $m[1] ?? "";
                    break;
                default:
                    $el["content"] = wp_strip_all_tags($block["innerHTML"]);
            }
            if (!empty($el["content"])) {
                $elements[] = $el;
                $idx++;
            }
        }
        return $elements;
    }
}
