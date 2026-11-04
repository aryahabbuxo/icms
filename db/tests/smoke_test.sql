-- Run on a freshly built DB (files 01-06). Lines marked MUST FAIL should error; screenshot them.
USE icms;
SET @app_user = 'smoke_test';

INSERT INTO CUSTOMER (name,dob,email,address,city) VALUES ('Test Cust','1990-01-01','tc@demo.in','addr','Bengaluru');
INSERT INTO AGENT (name,phone,email,branch) VALUES ('Suresh','9876543210','suresh@demo.in','Bengaluru');
INSERT INTO ADJUSTER (name,email,specialization,region,is_senior) VALUES ('Ramesh K','ramesh@demo.in','motor','Bengaluru',0);
INSERT INTO ADJUSTER (name,email,specialization,region,is_senior) VALUES ('Kavitha R','kavitha@demo.in','motor','Bengaluru',1);
INSERT INTO POLICY_TYPE (type_name,coverage_desc,base_premium) VALUES ('motor','Own damage and third party',9000);
INSERT INTO POLICY (customer_id,agent_id,type_id,start_date,end_date,sum_insured,premium)
  VALUES (1,1,1,CURDATE() - INTERVAL 100 DAY, CURDATE() + INTERVAL 265 DAY, 200000, 9000);
INSERT INTO PREMIUM_PAYMENT (policy_id,payment_no,amount,pay_date,mode) VALUES (1,0,9000,CURDATE() - INTERVAL 100 DAY,'UPI');
SELECT * FROM PREMIUM_PAYMENT;                       -- payment_no should be 1 (trigger)

CALL sp_file_claim(1, CURDATE() - INTERVAL 5 DAY, 50000, 'bike skid', @cid);
SELECT @cid AS claim_id;
CALL sp_assign_adjuster(@cid, @adj);
SELECT @adj AS adjuster_id;
SELECT claim_id, log_no, old_status, new_status, changed_by FROM CLAIM_STATUS_LOG;   -- 2 rows

CALL sp_file_claim(1, CURDATE(), 300000, 'too big', @c2);                              -- MUST FAIL: OVER_SUM_INSURED
CALL sp_file_claim(1, CURDATE() - INTERVAL 400 DAY, 1000, 'too old', @c2);             -- MUST FAIL: INCIDENT_OUT_OF_COVER

INSERT INTO ASSESSMENT (claim_id,adjuster_id,decision,approved_amount,remarks) VALUES (@cid,1,'approve',40000,'ok');
SELECT status FROM CLAIM WHERE claim_id=@cid;                                          -- approved

CALL sp_settle_claim(@cid, 50000, 'NEFT', @sid);                                       -- MUST FAIL: OVER_APPROVED
SELECT COUNT(*) AS settlements_after_rollback FROM SETTLEMENT;                         -- 0
CALL sp_settle_claim(@cid, 30000, 'NEFT', @sid);                                       -- ok
SELECT status FROM CLAIM WHERE claim_id=@cid;                                          -- settled
CALL sp_verify_audit_chain(@cid);                                                      -- all rows ok, link_ok = 1
