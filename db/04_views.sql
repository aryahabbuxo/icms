USE icms;

CREATE OR REPLACE VIEW v_adjuster_workload AS
SELECT a.adjuster_id, a.name, a.specialization, a.region, a.is_senior,
       COUNT(c.claim_id) AS open_claims
FROM ADJUSTER a
LEFT JOIN CLAIM c ON c.assigned_adjuster_id = a.adjuster_id
                 AND c.status IN ('under_review','info_requested')
GROUP BY a.adjuster_id, a.name, a.specialization, a.region, a.is_senior;

CREATE OR REPLACE VIEW v_claim_dashboard AS
SELECT c.claim_id, c.status, c.category, c.urgency, c.fraud_score, c.claimed_amount,
       c.incident_date, c.filed_date, c.duplicate_of,
       p.policy_id, pt.type_name AS policy_type, p.sum_insured,
       cu.customer_id, cu.name AS customer_name, cu.city,
       a.adjuster_id, a.name AS adjuster_name,
       s.amount AS settled_amount, s.settle_date,
       DATEDIFF(s.settle_date, c.filed_date) AS days_to_settle
FROM CLAIM c
JOIN POLICY p ON p.policy_id = c.policy_id
JOIN POLICY_TYPE pt ON pt.type_id = p.type_id
JOIN CUSTOMER cu ON cu.customer_id = p.customer_id
LEFT JOIN ADJUSTER a ON a.adjuster_id = c.assigned_adjuster_id
LEFT JOIN SETTLEMENT s ON s.claim_id = c.claim_id;

CREATE OR REPLACE VIEW v_high_risk_claims AS
SELECT * FROM v_claim_dashboard WHERE fraud_score >= 0.7 AND status NOT IN ('settled','rejected');

CREATE OR REPLACE VIEW v_customer_profile AS
SELECT cu.*, TIMESTAMPDIFF(YEAR, cu.dob, CURDATE()) AS age,
       (SELECT GROUP_CONCAT(phone) FROM CUSTOMER_PHONE ph WHERE ph.customer_id = cu.customer_id) AS phones,
       (SELECT COUNT(*) FROM POLICY p WHERE p.customer_id = cu.customer_id) AS policy_count
FROM CUSTOMER cu;

CREATE OR REPLACE VIEW v_policy_summary AS
SELECT p.*, pt.type_name, cu.name AS customer_name, ag.name AS agent_name,
       COALESCE((SELECT SUM(s.amount) FROM SETTLEMENT s JOIN CLAIM c ON c.claim_id = s.claim_id
                 WHERE c.policy_id = p.policy_id),0) AS total_settled,
       p.sum_insured - COALESCE((SELECT SUM(s.amount) FROM SETTLEMENT s JOIN CLAIM c ON c.claim_id = s.claim_id
                 WHERE c.policy_id = p.policy_id),0) AS remaining_cover
FROM POLICY p JOIN POLICY_TYPE pt ON pt.type_id = p.type_id
JOIN CUSTOMER cu ON cu.customer_id = p.customer_id
JOIN AGENT ag ON ag.agent_id = p.agent_id;
