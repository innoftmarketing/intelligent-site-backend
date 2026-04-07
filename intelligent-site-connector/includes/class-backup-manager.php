<?php
class ISC_Backup_Manager {
    public function save($page_id, $element_id, $value) {
        global $wpdb;
        $table = $wpdb->prefix . "isc_backups";
        $wpdb->insert($table, ["page_id" => $page_id, "element_id" => $element_id, "previous_value" => $value]);

        $count = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $table WHERE page_id = %d AND element_id = %s", $page_id, $element_id));
        if ($count > 50) {
            $oldest = $wpdb->get_var($wpdb->prepare("SELECT id FROM $table WHERE page_id = %d AND element_id = %s ORDER BY id DESC LIMIT 1 OFFSET 49", $page_id, $element_id));
            $wpdb->query($wpdb->prepare("DELETE FROM $table WHERE page_id = %d AND element_id = %s AND id < %d", $page_id, $element_id, $oldest));
        }
    }

    public function get_latest($page_id, $element_id) {
        global $wpdb;
        $table = $wpdb->prefix . "isc_backups";
        return $wpdb->get_var($wpdb->prepare("SELECT previous_value FROM $table WHERE page_id = %d AND element_id = %s ORDER BY id DESC LIMIT 1", $page_id, $element_id));
    }
}
