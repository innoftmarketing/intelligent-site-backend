<?php
class ISC_Rate_Limiter {
    private $limit = 20;
    private $window = 3600;

    public function check() {
        $key = "isc_rate_" . date("YmdH");
        $count = (int) get_transient($key);
        if ($count >= $this->limit) return false;
        set_transient($key, $count + 1, $this->window);
        return true;
    }
}
