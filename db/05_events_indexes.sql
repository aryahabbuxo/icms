USE icms;
SET GLOBAL event_scheduler = ON;

CREATE EVENT IF NOT EXISTS ev_daily_lapse
ON SCHEDULE EVERY 1 DAY STARTS (CURDATE() + INTERVAL 1 DAY + INTERVAL 1 HOUR)
DO CALL sp_lapse_overdue_policies();

-- For the EXPLAIN before/after demo: seed first, run EXPLAIN, then create these (or DROP INDEX and re-run).
CREATE INDEX idx_claim_status ON CLAIM(status);
CREATE INDEX idx_claim_fraud ON CLAIM(fraud_score);
CREATE INDEX idx_claim_adj_status ON CLAIM(assigned_adjuster_id, status);
CREATE INDEX idx_claim_incident ON CLAIM(incident_date);
CREATE INDEX idx_policy_cust_stat ON POLICY(customer_id, status);
CREATE INDEX idx_customer_city ON CUSTOMER(city);
