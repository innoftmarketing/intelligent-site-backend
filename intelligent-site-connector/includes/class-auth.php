<?php
class ISC_Auth {
    public function check_permission($request) {
        $key = $request->get_header("X-Api-Key");
        $secret = $request->get_header("X-Api-Secret");
        if (empty($key) || empty($secret)) return new WP_Error("unauthorized", "Missing API credentials", ["status" => 401]);

        $stored_key = get_option("isc_api_key");
        $stored_secret = get_option("isc_api_secret");
        if (!hash_equals($stored_key, $key) || !hash_equals($stored_secret, $secret)) return new WP_Error("unauthorized", "Invalid API credentials", ["status" => 401]);

        $limiter = new ISC_Rate_Limiter();
        if (!$limiter->check()) return new WP_Error("rate_limited", "Rate limit exceeded (20/hour)", ["status" => 429]);

        return true;
    }
}
