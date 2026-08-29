-- ============================================================
-- Ra7-Doj | نظام تابلت وزارة العدل
-- نفّذ هذا الملف مرة واحدة على قاعدة بياناتك
-- ============================================================

CREATE TABLE IF NOT EXISTS `doj_cases` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `case_number` VARCHAR(32) NOT NULL,
    `type` ENUM('criminal','civil') NOT NULL DEFAULT 'criminal',
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,

    `citizen_citizenid` VARCHAR(50) NOT NULL,
    `citizen_name` VARCHAR(100) NOT NULL,

    -- طاقم القضية
    `prosecutor_citizenid` VARCHAR(50) NULL,
    `prosecutor_name` VARCHAR(100) NULL,
    `lawyer_citizenid` VARCHAR(50) NULL,
    `lawyer_name` VARCHAR(100) NULL,
    `judge_citizenid` VARCHAR(50) NULL,
    `judge_name` VARCHAR(100) NULL,

    `status` ENUM('open','in_review','judged','closed') NOT NULL DEFAULT 'open',
    `verdict` TEXT NULL,
    `verdict_date` DATETIME NULL,

    `charges` LONGTEXT NULL, -- JSON array of strings

    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_case_number` (`case_number`),
    KEY `idx_citizen` (`citizen_citizenid`),
    KEY `idx_prosecutor` (`prosecutor_citizenid`),
    KEY `idx_lawyer` (`lawyer_citizenid`),
    KEY `idx_judge` (`judge_citizenid`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ملاحظات القضية (منفصلة عن الأدلة)
CREATE TABLE IF NOT EXISTS `doj_case_notes` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `case_id` INT UNSIGNED NOT NULL,
    `author_citizenid` VARCHAR(50) NOT NULL,
    `author_name` VARCHAR(100) NOT NULL,
    `author_role` VARCHAR(20) NOT NULL,
    `text` TEXT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_case` (`case_id`),
    CONSTRAINT `fk_notes_case` FOREIGN KEY (`case_id`) REFERENCES `doj_cases`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- أدلة القضية (روابط صور جاهزة + ترتيب قابل للتعديل)
CREATE TABLE IF NOT EXISTS `doj_case_evidence` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `case_id` INT UNSIGNED NOT NULL,
    `uploader_citizenid` VARCHAR(50) NOT NULL,
    `uploader_name` VARCHAR(100) NOT NULL,
    `caption` VARCHAR(200) NULL,
    `image_url` VARCHAR(500) NOT NULL,
    `position` INT NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_case` (`case_id`),
    CONSTRAINT `fk_evidence_case` FOREIGN KEY (`case_id`) REFERENCES `doj_cases`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- طلبات المواطنين (تقديم قضية/جلسة)
CREATE TABLE IF NOT EXISTS `doj_case_requests` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `citizenid` VARCHAR(50) NOT NULL,
    `citizen_name` VARCHAR(100) NOT NULL,
    `subject` VARCHAR(150) NOT NULL,
    `description` TEXT NOT NULL,
    `target_citizenid` VARCHAR(50) NULL,
    `target_name` VARCHAR(100) NULL,

    `status` ENUM('pending','approved','rejected','scheduled') NOT NULL DEFAULT 'pending',
    `hearing_date` DATETIME NULL,
    `linked_case_id` INT UNSIGNED NULL,
    `handled_by_name` VARCHAR(100) NULL,

    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    KEY `idx_citizenid` (`citizenid`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- إشعارات المواطنين
CREATE TABLE IF NOT EXISTS `doj_notifications` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `citizenid` VARCHAR(50) NOT NULL,
    `case_id` INT UNSIGNED NULL,
    `title` VARCHAR(150) NOT NULL,
    `message` TEXT NOT NULL,
    `is_read` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_citizenid` (`citizenid`),
    KEY `idx_case` (`case_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- طلبات استلام القضية (محامي/مدعي عام يطلب، القاضي يوافق/يرفض)
CREATE TABLE IF NOT EXISTS `doj_case_claims` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `case_id` INT UNSIGNED NOT NULL,
    `role` ENUM('lawyer','prosecutor') NOT NULL,
    `requester_citizenid` VARCHAR(50) NOT NULL,
    `requester_name` VARCHAR(100) NOT NULL,
    `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    `handled_by_name` VARCHAR(100) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_case` (`case_id`),
    KEY `idx_requester` (`requester_citizenid`),
    KEY `idx_status` (`status`),
    CONSTRAINT `fk_claims_case` FOREIGN KEY (`case_id`) REFERENCES `doj_cases`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- سجل التدقيق (Audit Log) - كل عملية حساسة تُسجّل هنا تلقائيًا من السيرفر
CREATE TABLE IF NOT EXISTS `doj_audit_log` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `actor_citizenid` VARCHAR(50) NOT NULL,
    `actor_name` VARCHAR(100) NOT NULL,
    `actor_role` VARCHAR(20) NOT NULL,
    `action` VARCHAR(50) NOT NULL,     -- create_case | update_case | issue_verdict | add_note | add_evidence | update_request | assign_lawyer ...
    `case_id` INT UNSIGNED NULL,
    `details` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_case` (`case_id`),
    KEY `idx_actor` (`actor_citizenid`),
    KEY `idx_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
