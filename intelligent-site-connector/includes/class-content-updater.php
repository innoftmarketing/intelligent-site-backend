<?php
class ISC_Content_Updater {
    public function update_element($request) {
        $page_id = (int) $request["id"];
        $params = $request->get_json_params();
        $element_id = sanitize_text_field($params["element_id"] ?? "");
        $new_value = $params["new_value"] ?? "";

        if (empty($element_id) || $new_value === "") {
            return new WP_Error("bad_request", "element_id and new_value required", ["status" => 400]);
        }

        $page = get_post($page_id);
        if (!$page) return new WP_Error("not_found", "Page not found", ["status" => 404]);

        $backup = new ISC_Backup_Manager();
        $previous_value = "";

        if ($this->is_elementor_page($page_id)) {
            $result = $this->update_elementor($page_id, $element_id, $new_value, $previous_value);
        } else {
            $result = $this->update_wp_block($page_id, $element_id, $new_value, $previous_value);
        }

        if (is_wp_error($result)) return $result;

        $backup->save($page_id, $element_id, $previous_value);

        if (class_exists('\Elementor\Plugin')) {
            \Elementor\Plugin::$instance->files_manager->clear_cache();
        }

        return rest_ensure_response(["success" => true, "previousValue" => $previous_value]);
    }

    private function is_elementor_page($id) {
        return get_post_meta($id, "_elementor_edit_mode", true) === "builder";
    }

    private function update_elementor($page_id, $element_id, $new_value, &$prev) {
        $data = get_post_meta($page_id, "_elementor_data", true);
        $parsed = is_string($data) ? json_decode($data, true) : $data;
        if (!is_array($parsed)) return new WP_Error("invalid_data", "Elementor data invalid", ["status" => 500]);

        $found = $this->find_and_update($parsed, $element_id, $new_value, $prev);
        if (!$found) return new WP_Error("not_found", "Element not found", ["status" => 404]);

        update_post_meta($page_id, "_elementor_data", wp_json_encode($parsed));
        return true;
    }

    private function find_and_update(&$elements, $target_id, $new_value, &$prev) {
        foreach ($elements as &$el) {
            if (isset($el["id"]) && $el["id"] === $target_id) {
                $s = &$el["settings"];
                $wt = $el["widgetType"] ?? "";
                switch ($wt) {
                    case "heading": $prev = $s["title"] ?? ""; $s["title"] = $new_value; return true;
                    case "text-editor": $prev = $s["editor"] ?? ""; $s["editor"] = $new_value; return true;
                    case "image": $prev = $s["image"]["url"] ?? ""; $s["image"]["url"] = $new_value; return true;
                    case "button": $prev = $s["text"] ?? ""; $s["text"] = $new_value; return true;
                }
            }
            if (!empty($el["elements"])) {
                if ($this->find_and_update($el["elements"], $target_id, $new_value, $prev)) return true;
            }
        }
        return false;
    }

    private function update_wp_block($page_id, $element_id, $new_value, &$prev) {
        if (!preg_match('/^wp-block-(\d+)$/', $element_id, $m)) {
            return new WP_Error("bad_id", "Invalid element ID", ["status" => 400]);
        }

        $page = get_post($page_id);
        $blocks = parse_blocks($page->post_content);
        $target = (int) $m[1];
        $current = 0;

        foreach ($blocks as &$block) {
            if (empty($block["blockName"])) continue;
            if ($current === $target) {
                $prev = wp_strip_all_tags($block["innerHTML"]);
                $block["innerHTML"] = preg_replace('/>([^<]*)</', '>' . esc_html($new_value) . '<', $block["innerHTML"], 1);
                $block["innerContent"] = [$block["innerHTML"]];
                break;
            }
            $current++;
        }

        wp_update_post(["ID" => $page_id, "post_content" => serialize_blocks($blocks)]);
        return true;
    }

    public function rollback($request) {
        $params = $request->get_json_params();
        $page_id = (int) ($params["page_id"] ?? 0);
        $element_id = sanitize_text_field($params["element_id"] ?? "");

        $backup = new ISC_Backup_Manager();
        $previous = $backup->get_latest($page_id, $element_id);
        if (!$previous) return new WP_Error("no_backup", "No backup found", ["status" => 404]);

        $dummy = "";
        if ($this->is_elementor_page($page_id)) {
            $this->update_elementor($page_id, $element_id, $previous, $dummy);
        } else {
            $this->update_wp_block($page_id, $element_id, $previous, $dummy);
        }

        return rest_ensure_response(["success" => true, "restoredValue" => $previous]);
    }
}
