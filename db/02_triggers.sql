USE icms;
DELIMITER $$

CREATE TRIGGER trg_payment_no BEFORE INSERT ON PREMIUM_PAYMENT FOR EACH ROW
BEGIN
  SET NEW.payment_no = (SELECT COALESCE(MAX(payment_no),0)+1 FROM PREMIUM_PAYMENT WHERE policy_id = NEW.policy_id);
END$$

CREATE TRIGGER trg_claim_validate BEFORE INSERT ON CLAIM FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20); DECLARE v_start DATE; DECLARE v_end DATE; DECLARE v_sum DECIMAL(12,2);
  SELECT status, start_date, end_date, sum_insured INTO v_status, v_start, v_end, v_sum
    FROM POLICY WHERE policy_id = NEW.policy_id;
  SET NEW.filed_date = COALESCE(NEW.filed_date, CURDATE());
  IF v_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'POLICY_INACTIVE: Claims can only be filed on active policies';
  END IF;
  IF NEW.incident_date < v_start OR NEW.incident_date > v_end OR NEW.incident_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INCIDENT_OUT_OF_COVER: Incident date is outside the policy period';
  END IF;
  IF NEW.claimed_amount > v_sum THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OVER_SUM_INSURED: Claimed amount exceeds the sum insured';
  END IF;
END$$

CREATE TRIGGER trg_claim_log_insert AFTER INSERT ON CLAIM FOR EACH ROW
BEGIN
  INSERT INTO CLAIM_STATUS_LOG (claim_id, old_status, new_status, changed_by)
  VALUES (NEW.claim_id, NULL, NEW.status, @app_user);
END$$

CREATE TRIGGER trg_claim_transition BEFORE UPDATE ON CLAIM FOR EACH ROW
BEGIN
  IF OLD.status IN ('settled','rejected') AND NEW.status <> OLD.status THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CLAIM_CLOSED: Settled or rejected claims cannot change status';
  END IF;
END$$

CREATE TRIGGER trg_claim_log_update AFTER UPDATE ON CLAIM FOR EACH ROW
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO CLAIM_STATUS_LOG (claim_id, old_status, new_status, changed_by)
    VALUES (NEW.claim_id, OLD.status, NEW.status, @app_user);
  END IF;
END$$

CREATE TRIGGER trg_log_chain BEFORE INSERT ON CLAIM_STATUS_LOG FOR EACH ROW
BEGIN
  DECLARE v_prev CHAR(64);
  SET NEW.log_no = (SELECT COALESCE(MAX(log_no),0)+1 FROM CLAIM_STATUS_LOG WHERE claim_id = NEW.claim_id);
  SET NEW.changed_at = COALESCE(NEW.changed_at, NOW());
  SELECT curr_hash INTO v_prev FROM CLAIM_STATUS_LOG
    WHERE claim_id = NEW.claim_id ORDER BY log_no DESC LIMIT 1;
  SET NEW.prev_hash = COALESCE(v_prev, REPEAT('0',64));
  SET NEW.curr_hash = SHA2(CONCAT_WS('|', NEW.prev_hash, NEW.claim_id, NEW.log_no,
      IFNULL(NEW.old_status,'NONE'), NEW.new_status,
      DATE_FORMAT(NEW.changed_at,'%Y-%m-%d %H:%i:%s')), 256);
END$$

CREATE TRIGGER trg_assess_validate BEFORE INSERT ON ASSESSMENT FOR EACH ROW
BEGIN
  DECLARE v_claimed DECIMAL(12,2); DECLARE v_fraud DECIMAL(4,3); DECLARE v_senior BOOLEAN;
  SELECT claimed_amount, COALESCE(fraud_score,0) INTO v_claimed, v_fraud FROM CLAIM WHERE claim_id = NEW.claim_id;
  SELECT is_senior INTO v_senior FROM ADJUSTER WHERE adjuster_id = NEW.adjuster_id;
  IF NEW.approved_amount > v_claimed THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OVER_CLAIMED: Approved amount exceeds claimed amount';
  END IF;
  IF NEW.decision = 'approve' AND v_fraud >= 0.7 AND NOT v_senior THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SENIOR_REQUIRED: High-risk claims must be approved by a senior adjuster';
  END IF;
  IF NEW.decision <> 'approve' THEN SET NEW.approved_amount = 0; END IF;
END$$

CREATE TRIGGER trg_assess_status AFTER INSERT ON ASSESSMENT FOR EACH ROW
BEGIN
  UPDATE CLAIM SET status = CASE NEW.decision
    WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'info_requested' END
  WHERE claim_id = NEW.claim_id;
END$$

CREATE TRIGGER trg_settle_validate BEFORE INSERT ON SETTLEMENT FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20); DECLARE v_policy INT; DECLARE v_sum DECIMAL(12,2);
  DECLARE v_approved DECIMAL(12,2); DECLARE v_settled DECIMAL(12,2);
  SELECT c.status, c.policy_id, p.sum_insured INTO v_status, v_policy, v_sum
    FROM CLAIM c JOIN POLICY p ON p.policy_id = c.policy_id WHERE c.claim_id = NEW.claim_id;
  SELECT COALESCE(MAX(approved_amount),0) INTO v_approved
    FROM ASSESSMENT WHERE claim_id = NEW.claim_id AND decision = 'approve';
  SELECT COALESCE(SUM(s.amount),0) INTO v_settled
    FROM SETTLEMENT s JOIN CLAIM c ON c.claim_id = s.claim_id WHERE c.policy_id = v_policy;
  IF v_status <> 'approved' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NOT_APPROVED: Only approved claims can be settled';
  END IF;
  IF NEW.amount > v_approved THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OVER_APPROVED: Settlement exceeds the approved amount';
  END IF;
  IF v_settled + NEW.amount > v_sum THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SUM_INSURED_EXHAUSTED: Total settlements would exceed the sum insured';
  END IF;
END$$

CREATE TRIGGER trg_settle_status AFTER INSERT ON SETTLEMENT FOR EACH ROW
BEGIN
  UPDATE CLAIM SET status = 'settled' WHERE claim_id = NEW.claim_id;
END$$

DELIMITER ;
