<?php
class ISC_Media_Handler {
    public function upload($request) {
        $params = $request->get_json_params();
        $image_url = esc_url_raw($params["image_url"] ?? "");
        $filename = sanitize_file_name($params["filename"] ?? "upload.png");

        if (empty($image_url)) {
            return new WP_Error("bad_request", "image_url is required", ["status" => 400]);
        }

        $tmp = download_url($image_url);
        if (is_wp_error($tmp)) return $tmp;

        $file_array = ["name" => $filename, "tmp_name" => $tmp];
        $attachment_id = media_handle_sideload($file_array, 0);

        if (is_wp_error($attachment_id)) {
            @unlink($tmp);
            return $attachment_id;
        }

        return rest_ensure_response([
            "mediaId" => (string) $attachment_id,
            "url" => wp_get_attachment_url($attachment_id),
        ]);
    }
}
