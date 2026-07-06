-- 创建数据库
CREATE DATABASE IF NOT EXISTS `wenba` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `wenba`;

-- 园区表（支持一级、二级）
CREATE TABLE `campus` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL,
  `parent_id` INT DEFAULT NULL COMMENT '父级园区ID，为空则为一级园区',
  `description` TEXT COMMENT '园区描述',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`parent_id`) REFERENCES `campus`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='园区信息表';

-- 栏目分类表（一级、二级）
CREATE TABLE `categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL,
  `parent_id` INT DEFAULT NULL COMMENT '父分类ID，为空则为一级分类',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='问吧栏目分类';

-- 用户表
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(8) NOT NULL UNIQUE COMMENT '账号，1大写字母+7位数字',
  `password_hash` VARCHAR(255) NOT NULL,
  `nickname` VARCHAR(18) NOT NULL COMMENT '昵称，最大6个汉字',
  `campus_id` INT NOT NULL COMMENT '所属园区',
  `id_card` VARCHAR(18) NOT NULL COMMENT '身份证号',
  `contact` VARCHAR(100) NOT NULL COMMENT '联系方式（电话/邮箱）',
  `security_question` VARCHAR(200) NOT NULL COMMENT '密保问题',
  `security_answer` VARCHAR(200) NOT NULL COMMENT '密保答案',
  `points` INT DEFAULT 300 COMMENT '积分，注册奖励300',
  `role` ENUM('user','admin') DEFAULT 'user' COMMENT '用户角色',
  `status` TINYINT DEFAULT 1 COMMENT '1正常, 0冻结, -1封禁',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`campus_id`) REFERENCES `campus`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 帖子/提问表
CREATE TABLE `posts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL COMMENT '发帖用户ID',
  `category_id` INT NOT NULL COMMENT '二级分类ID',
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT NOT NULL,
  `bounty` INT NOT NULL COMMENT '悬赏积分（50/100/200等）',
  `audit_status` TINYINT DEFAULT 0 COMMENT '审核状态: 0待审核, 1通过, 2驳回',
  `is_resolved` TINYINT DEFAULT 0 COMMENT '是否解决: 0未解决, 1已解决',
  `is_recommended` TINYINT DEFAULT 0 COMMENT '是否推荐',
  `is_top` TINYINT DEFAULT 0 COMMENT '是否置顶',
  `is_blocked` TINYINT DEFAULT 0 COMMENT '是否屏蔽',
  `is_deleted` TINYINT DEFAULT 0 COMMENT '是否删除（回收站）',
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `deleted_by` INT DEFAULT NULL COMMENT '删除操作人ID',
  `campus_id` INT DEFAULT NULL COMMENT '发帖时所属园区',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`),
  FOREIGN KEY (`campus_id`) REFERENCES `campus`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提问帖子表';

-- 回复/留言表
CREATE TABLE `replies` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `post_id` INT NOT NULL,
  `user_id` INT NOT NULL COMMENT '回复人ID',
  `content` TEXT NOT NULL,
  `is_approved_by_owner` TINYINT DEFAULT 0 COMMENT '贴主审核: 0未审核, 1通过',
  `is_best` TINYINT DEFAULT 0 COMMENT '是否为最佳答案',
  `is_blocked` TINYINT DEFAULT 0 COMMENT '管理员屏蔽',
  `is_deleted` TINYINT DEFAULT 0 COMMENT '是否删除（回收站）',
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `deleted_by` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='回复留言表';

-- 公告表（兼轮播图）
CREATE TABLE `announcements` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT,
  `cover_image` VARCHAR(255) DEFAULT NULL COMMENT '封面图路径',
  `link_url` VARCHAR(255) DEFAULT NULL COMMENT '跳转链接',
  `is_carousel` TINYINT DEFAULT 0 COMMENT '是否在轮播区展示',
  `is_active` TINYINT DEFAULT 1 COMMENT '是否启用',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公告表';

-- 站内留言（管理员发）
CREATE TABLE `user_messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `from_admin_id` INT DEFAULT NULL,
  `content` TEXT NOT NULL,
  `is_read` TINYINT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`from_admin_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内留言';

-- 用户反馈表
CREATE TABLE `feedbacks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `content` TEXT NOT NULL,
  `reply` TEXT COMMENT '管理员回复',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `replied_at` TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户反馈表';

-- 积分记录表（用于审计）
CREATE TABLE `points_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `change_amount` INT NOT NULL COMMENT '变动积分数，正为增加，负为扣除',
  `type` VARCHAR(50) NOT NULL COMMENT 'register/reward_login/publish_post/best_answer等',
  `description` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分变动日志';

-- 登录日志
CREATE TABLE `login_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `username` VARCHAR(8) NOT NULL,
  `ip` VARCHAR(45) NOT NULL,
  `login_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会员登录日志';

-- 管理员操作日志
CREATE TABLE `admin_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `admin_id` INT NOT NULL,
  `admin_username` VARCHAR(8) NOT NULL,
  `admin_nickname` VARCHAR(18) NOT NULL,
  `employee_id` VARCHAR(20) DEFAULT NULL COMMENT '工号',
  `action` VARCHAR(100) NOT NULL COMMENT '操作描述，如审核提问、删除回复等',
  `target_type` VARCHAR(50) DEFAULT NULL,
  `target_id` INT DEFAULT NULL,
  `detail` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`admin_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理员操作日志';

-- IP黑名单
CREATE TABLE `ip_blacklist` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `ip` VARCHAR(45) NOT NULL,
  `reason` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='IP黑名单';

-- 动态配置（作为缓存，实际仍从文件读取，但管理员修改时也会同步到此表，方便备份）
CREATE TABLE `site_settings` (
  `setting_key` VARCHAR(100) PRIMARY KEY,
  `setting_value` TEXT,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='网站动态配置（仅备份用途，实际读取配置文件）';