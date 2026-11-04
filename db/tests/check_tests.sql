-- Run each statement separately in Workbench; the marked ones must ERROR (screenshot each).
USE icms;
INSERT INTO CUSTOMER (name,dob,email,address,city) VALUES ('T','1990-01-01','t@t.com','a','Bengaluru');
INSERT INTO CUSTOMER_PHONE VALUES (LAST_INSERT_ID(), '12345');                          -- MUST FAIL: bad phone
INSERT INTO APP_USER (email,password_hash,role,customer_id) VALUES ('x@y.com','h','admin',1); -- MUST FAIL: admin with customer_id
INSERT INTO AGENT (name,phone,email,branch) VALUES ('A','9876543210','a@a.com','Bengaluru');
INSERT INTO POLICY_TYPE (type_name,coverage_desc,base_premium) VALUES ('motor','x',9000);
INSERT INTO POLICY (customer_id,agent_id,type_id,start_date,end_date,sum_insured,premium)
VALUES (1,1,1,'2026-05-01','2026-04-01',100000,5000);                                    -- MUST FAIL: end < start
