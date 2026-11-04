USE icms;
DELIMITER $$

CREATE PROCEDURE sp_file_claim(IN p_policy_id INT, IN p_incident DATE, IN p_amount DECIMAL(12,2),
                               IN p_summary VARCHAR(300), OUT p_claim_id INT)
BEGIN
  INSERT INTO CLAIM (policy_id, incident_date, filed_date, claimed_amount, description_summary)
  VALUES (p_policy_id, p_incident, CURDATE(), p_amount, p_summary);
  SET p_claim_id = LAST_INSERT_ID();
END$$

CREATE PROCEDURE sp_assign_adjuster(IN p_claim_id INT, OUT p_adjuster_id INT)
BEGIN
  DECLARE v_spec VARCHAR(20); DECLARE v_city VARCHAR(60); DECLARE v_high BOOLEAN;
  SET p_adjuster_id = NULL;
  SELECT pt.type_name, cu.city, COALESCE(c.fraud_score,0) >= 0.7
    INTO v_spec, v_city, v_high
    FROM CLAIM c JOIN POLICY p ON p.policy_id = c.policy_id
    JOIN POLICY_TYPE pt ON pt.type_id = p.type_id
    JOIN CUSTOMER cu ON cu.customer_id = p.customer_id
    WHERE c.claim_id = p_claim_id;

  SELECT a.adjuster_id INTO p_adjuster_id
    FROM ADJUSTER a LEFT JOIN v_adjuster_workload w ON w.adjuster_id = a.adjuster_id
    WHERE a.specialization = v_spec AND (NOT v_high OR a.is_senior)
    ORDER BY (a.region = v_city) DESC, COALESCE(w.open_claims,0) ASC, a.adjuster_id
    LIMIT 1;

  IF p_adjuster_id IS NULL THEN
    SELECT a.adjuster_id INTO p_adjuster_id FROM ADJUSTER a
      LEFT JOIN v_adjuster_workload w ON w.adjuster_id = a.adjuster_id
      ORDER BY a.is_senior DESC, COALESCE(w.open_claims,0) LIMIT 1;
  END IF;

  UPDATE CLAIM SET assigned_adjuster_id = p_adjuster_id, status = 'under_review'
    WHERE claim_id = p_claim_id;
END$$

CREATE PROCEDURE sp_settle_claim(IN p_claim_id INT, IN p_amount DECIMAL(12,2),
                                 IN p_mode VARCHAR(10), OUT p_settlement_id INT)
BEGIN
  DECLARE v_pid INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;
  SELECT p.policy_id INTO v_pid FROM POLICY p JOIN CLAIM c ON c.policy_id = p.policy_id
    WHERE c.claim_id = p_claim_id FOR UPDATE;
  INSERT INTO SETTLEMENT (claim_id, amount, settle_date, mode)
    VALUES (p_claim_id, p_amount, CURDATE(), p_mode);
  SET p_settlement_id = LAST_INSERT_ID();
  COMMIT;
END$$

CREATE PROCEDURE sp_verify_audit_chain(IN p_claim_id INT)
BEGIN
  SELECT log_no, old_status, new_status, changed_at, changed_by, curr_hash AS stored_hash,
    SHA2(CONCAT_WS('|', prev_hash, claim_id, log_no, IFNULL(old_status,'NONE'), new_status,
         DATE_FORMAT(changed_at,'%Y-%m-%d %H:%i:%s')), 256) AS recomputed_hash,
    (prev_hash = COALESCE(LAG(curr_hash) OVER (ORDER BY log_no), REPEAT('0',64))) AS link_ok
  FROM CLAIM_STATUS_LOG WHERE claim_id = p_claim_id ORDER BY log_no;
END$$

CREATE PROCEDURE sp_lapse_overdue_policies()
BEGIN
  UPDATE POLICY SET status = 'expired' WHERE status = 'active' AND end_date < CURDATE();
  UPDATE POLICY p SET p.status = 'lapsed'
  WHERE p.status = 'active'
    AND COALESCE((SELECT MAX(pay_date) FROM PREMIUM_PAYMENT pp
                  WHERE pp.policy_id = p.policy_id AND pp.status = 'success'),
                 DATE_SUB(p.start_date, INTERVAL 365 DAY))
        < DATE_SUB(CURDATE(), INTERVAL 395 DAY);
END$$

DELIMITER ;
