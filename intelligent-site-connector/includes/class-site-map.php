<?php
class ISC_Site_Map {
    public function get_site_map($request) {
        $pages = get_pages(["post_status" => "publish"]);
        $page_list = array_map(function($p) {
            return ["id" => (string) $p->ID, "title" => $p->post_title, "slug" => $p->post_name];
        }, $pages);

        $menus = [];
        $nav_menus = wp_get_nav_menus();
        foreach ($nav_menus as $menu) {
            $items = wp_get_nav_menu_items($menu->term_id);
            $menu_items = [];
            if ($items) { foreach ($items as $i) { $menu_items[] = $i->title; } }
            $menus[] = ["id" => (string) $menu->term_id, "name" => $menu->name, "items" => $menu_items];
        }

        return rest_ensure_response(["pages" => $page_list, "menus" => $menus]);
    }
}
