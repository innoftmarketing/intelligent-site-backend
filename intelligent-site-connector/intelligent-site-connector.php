<?php
/**
 * Plugin Name: Intelligent Site Connector
 * Description: REST API bridge for AI-powered website management via WhatsApp
 * Version: 1.0.0
 * Author: Innoft
 */

if (!defined("ABSPATH")) exit;

define("ISC_VERSION", "1.0.0");
define("ISC_PLUGIN_DIR", plugin_dir_path(__FILE__));

require_once ISC_PLUGIN_DIR . "includes/class-auth.php";
require_once ISC_PLUGIN_DIR . "includes/class-rate-limiter.php";
require_once ISC_PLUGIN_DIR . "includes/class-backup-manager.php";
require_once ISC_PLUGIN_DIR . "includes/class-site-map.php";
require_once ISC_PLUGIN_DIR . "includes/class-content-reader.php";
require_once ISC_PLUGIN_DIR . "includes/class-content-updater.php";
require_once ISC_PLUGIN_DIR . "includes/class-media-handler.php";
require_once ISC_PLUGIN_DIR . "includes/class-product-handler.php";

class Intelligent_Site_Connector {
    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action("rest_api_init", [$this, "register_routes"]);
        register_activation_hook(__FILE__, [$this, "activate"]);
    }

    public function activate() {
        if (!get_option("isc_api_key")) {
            update_option("isc_api_key", wp_generate_password(48, false));
            update_option("isc_api_secret", wp_generate_password(48, false));
        }

        global $wpdb;
        $charset = $wpdb->get_charset_collate();
        $table = $wpdb->prefix . "isc_backups";
        $sql = "CREATE TABLE IF NOT EXISTS $table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            page_id bigint(20) NOT NULL,
            element_id varchar(255) NOT NULL,
            previous_value longtext NOT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY page_element (page_id, element_id)
        ) $charset;";
        require_once ABSPATH . "wp-admin/includes/upgrade.php";
        dbDelta($sql);
    }

    public function register_routes() {
        $ns = "intelligent-site/v1";
        $auth = new ISC_Auth();
        $sitemap = new ISC_Site_Map();
        $reader = new ISC_Content_Reader();
        $updater = new ISC_Content_Updater();
        $media = new ISC_Media_Handler();
        $products = new ISC_Product_Handler();

        register_rest_route($ns, "/site-map", ["methods" => "GET", "callback" => [$sitemap, "get_site_map"], "permission_callback" => [$auth, "check_permission"]]);
        register_rest_route($ns, "/page/(?P<id>\d+)", ["methods" => "GET", "callback" => [$reader, "get_page"], "permission_callback" => [$auth, "check_permission"]]);
        register_rest_route($ns, "/page/(?P<id>\d+)/update", ["methods" => "POST", "callback" => [$updater, "update_element"], "permission_callback" => [$auth, "check_permission"]]);
        register_rest_route($ns, "/media", ["methods" => "POST", "callback" => [$media, "upload"], "permission_callback" => [$auth, "check_permission"]]);
        register_rest_route($ns, "/products", ["methods" => "GET", "callback" => [$products, "list_products"], "permission_callback" => [$auth, "check_permission"]]);
        register_rest_route($ns, "/products/(?P<id>\d+)/update", ["methods" => "POST", "callback" => [$products, "update_product"], "permission_callback" => [$auth, "check_permission"]]);
        register_rest_route($ns, "/rollback", ["methods" => "POST", "callback" => [$updater, "rollback"], "permission_callback" => [$auth, "check_permission"]]);
    }
}

Intelligent_Site_Connector::instance();
