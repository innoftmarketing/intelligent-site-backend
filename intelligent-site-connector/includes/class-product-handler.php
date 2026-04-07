<?php
class ISC_Product_Handler {
    public function list_products($request) {
        if (!class_exists("WooCommerce")) {
            return new WP_Error("no_woo", "WooCommerce is not active", ["status" => 400]);
        }

        $products = wc_get_products(["limit" => 100, "status" => "publish"]);
        $list = [];
        foreach ($products as $product) {
            $cats = [];
            $cat_ids = $product->get_category_ids();
            if ($cat_ids) {
                $terms = get_terms(["taxonomy" => "product_cat", "include" => $cat_ids]);
                if (!is_wp_error($terms)) {
                    foreach ($terms as $t) { $cats[] = $t->name; }
                }
            }
            $list[] = [
                "id" => (string) $product->get_id(),
                "name" => $product->get_name(),
                "price" => $product->get_price(),
                "description" => $product->get_short_description(),
                "stock" => $product->get_stock_quantity() ?? 0,
                "categories" => $cats,
            ];
        }

        return rest_ensure_response($list);
    }

    public function update_product($request) {
        if (!class_exists("WooCommerce")) {
            return new WP_Error("no_woo", "WooCommerce is not active", ["status" => 400]);
        }

        $product_id = (int) $request["id"];
        $product = wc_get_product($product_id);
        if (!$product) return new WP_Error("not_found", "Product not found", ["status" => 404]);

        $params = $request->get_json_params();
        $previous = [];

        if (isset($params["name"])) {
            $previous["name"] = $product->get_name();
            $product->set_name(sanitize_text_field($params["name"]));
        }
        if (isset($params["price"])) {
            $previous["price"] = $product->get_price();
            $product->set_regular_price(sanitize_text_field($params["price"]));
        }
        if (isset($params["description"])) {
            $previous["description"] = $product->get_short_description();
            $product->set_short_description(wp_kses_post($params["description"]));
        }
        if (isset($params["stock"])) {
            $previous["stock"] = $product->get_stock_quantity();
            $product->set_stock_quantity((int) $params["stock"]);
            $product->set_manage_stock(true);
        }

        $product->save();

        return rest_ensure_response(["success" => true, "previousValues" => $previous]);
    }
}
