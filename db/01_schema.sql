DROP DATABASE IF EXISTS icms;
CREATE DATABASE icms CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE icms;

CREATE TABLE CUSTOMER (
  customer_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  dob DATE NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(60) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_cust_email CHECK (email LIKE '%_@_%._%'),
  CONSTRAINT chk_cust_dob CHECK (dob > '1900-01-01')
);

CREATE TABLE CUSTOMER_PHONE (
  customer_id INT NOT NULL,
  phone CHAR(10) NOT NULL,
  PRIMARY KEY (customer_id, phone),
  CONSTRAINT fk_phone_cust FOREIGN KEY (customer_id) REFERENCES CUSTOMER(customer_id) ON DELETE CASCADE,
  CONSTRAINT chk_phone CHECK (REGEXP_LIKE(phone, '^[6-9][0-9]{9}$'))
);

CREATE TABLE AGENT (
  agent_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone CHAR(10) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  branch VARCHAR(60) NOT NULL
);

CREATE TABLE ADJUSTER (
  adjuster_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  specialization ENUM('health','motor','life','property','travel') NOT NULL,
  region VARCHAR(60) NOT NULL,
  is_senior BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE APP_USER (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer','agent','adjuster','admin') NOT NULL,
  customer_id INT NULL,
  agent_id INT NULL,
  adjuster_id INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES CUSTOMER(customer_id),
  FOREIGN KEY (agent_id) REFERENCES AGENT(agent_id),
  FOREIGN KEY (adjuster_id) REFERENCES ADJUSTER(adjuster_id),
  CONSTRAINT chk_role_link CHECK (
    (role='customer' AND customer_id IS NOT NULL AND agent_id IS NULL AND adjuster_id IS NULL) OR
    (role='agent' AND agent_id IS NOT NULL AND customer_id IS NULL AND adjuster_id IS NULL) OR
    (role='adjuster' AND adjuster_id IS NOT NULL AND customer_id IS NULL AND agent_id IS NULL) OR
    (role='admin' AND customer_id IS NULL AND agent_id IS NULL AND adjuster_id IS NULL))
);

CREATE TABLE POLICY_TYPE (
  type_id INT AUTO_INCREMENT PRIMARY KEY,
  type_name ENUM('health','motor','life','property','travel') NOT NULL UNIQUE,
  coverage_desc VARCHAR(500) NOT NULL,
  base_premium DECIMAL(12,2) NOT NULL CHECK (base_premium > 0)
);

CREATE TABLE POLICY (
  policy_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  agent_id INT NOT NULL,
  type_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  sum_insured DECIMAL(12,2) NOT NULL,
  premium DECIMAL(12,2) NOT NULL,
  status ENUM('active','lapsed','expired','cancelled') NOT NULL DEFAULT 'active',
  FOREIGN KEY (customer_id) REFERENCES CUSTOMER(customer_id),
  FOREIGN KEY (agent_id) REFERENCES AGENT(agent_id),
  FOREIGN KEY (type_id) REFERENCES POLICY_TYPE(type_id),
  CONSTRAINT chk_pol_dates CHECK (end_date > start_date),
  CONSTRAINT chk_pol_money CHECK (sum_insured > 0 AND premium > 0 AND premium < sum_insured)
);

CREATE TABLE PREMIUM_PAYMENT (
  policy_id INT NOT NULL,
  payment_no INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  pay_date DATE NOT NULL,
  mode ENUM('UPI','CARD','NETBANKING','CASH') NOT NULL,
  status ENUM('success','failed') NOT NULL DEFAULT 'success',
  PRIMARY KEY (policy_id, payment_no),
  FOREIGN KEY (policy_id) REFERENCES POLICY(policy_id) ON DELETE CASCADE
);

CREATE TABLE CLAIM (
  claim_id INT AUTO_INCREMENT PRIMARY KEY,
  policy_id INT NOT NULL,
  incident_date DATE NOT NULL,
  filed_date DATE NOT NULL,
  claimed_amount DECIMAL(12,2) NOT NULL CHECK (claimed_amount > 0),
  description_summary VARCHAR(300) NULL,
  category ENUM('accident','theft','hospitalisation','fire','flood','travel_loss','death','other') NULL,
  urgency ENUM('low','medium','high','critical') NULL,
  nlp_confidence DECIMAL(4,3) NULL CHECK (nlp_confidence BETWEEN 0 AND 1),
  fraud_score DECIMAL(4,3) NULL CHECK (fraud_score BETWEEN 0 AND 1),
  fraud_reasons JSON NULL,
  duplicate_of INT NULL,
  assigned_adjuster_id INT NULL,
  status ENUM('filed','under_review','info_requested','approved','rejected','settled') NOT NULL DEFAULT 'filed',
  FOREIGN KEY (policy_id) REFERENCES POLICY(policy_id),
  FOREIGN KEY (duplicate_of) REFERENCES CLAIM(claim_id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_adjuster_id) REFERENCES ADJUSTER(adjuster_id) ON DELETE SET NULL,
  CONSTRAINT chk_claim_dates CHECK (incident_date <= filed_date)
);

CREATE TABLE ASSESSMENT (
  claim_id INT NOT NULL,
  adjuster_id INT NOT NULL,
  decision ENUM('approve','reject','request_info') NOT NULL,
  approved_amount DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (approved_amount >= 0),
  remarks VARCHAR(1000) NULL,
  review_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (claim_id, adjuster_id),
  FOREIGN KEY (claim_id) REFERENCES CLAIM(claim_id),
  FOREIGN KEY (adjuster_id) REFERENCES ADJUSTER(adjuster_id)
);

CREATE TABLE SETTLEMENT (
  settlement_id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL UNIQUE,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  settle_date DATE NOT NULL,
  mode ENUM('NEFT','UPI','CHEQUE') NOT NULL,
  FOREIGN KEY (claim_id) REFERENCES CLAIM(claim_id)
);

CREATE TABLE CLAIM_STATUS_LOG (
  claim_id INT NOT NULL,
  log_no INT NOT NULL,
  old_status VARCHAR(20) NULL,
  new_status VARCHAR(20) NOT NULL,
  changed_at DATETIME NOT NULL,
  changed_by VARCHAR(120) NULL,
  prev_hash CHAR(64) NOT NULL,
  curr_hash CHAR(64) NOT NULL,
  PRIMARY KEY (claim_id, log_no),
  FOREIGN KEY (claim_id) REFERENCES CLAIM(claim_id)
);

CREATE TABLE NOTIFICATION (
  notif_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  claim_id INT NULL,
  message VARCHAR(300) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES APP_USER(user_id) ON DELETE CASCADE,
  FOREIGN KEY (claim_id) REFERENCES CLAIM(claim_id) ON DELETE SET NULL
);
