DROP TABLE IF EXISTS tgimglog;
CREATE TABLE IF NOT EXISTS tgimglog (
	`id` integer PRIMARY KEY NOT NULL,
    `url` text,
    `referer` text,
	`ip` varchar(255),
	`time` DATE
);
DROP TABLE IF EXISTS imginfo;
CREATE TABLE IF NOT EXISTS imginfo (
	`id` integer PRIMARY KEY NOT NULL,
    `url` text,
    `referer` text,
	`ip` varchar(255),
	`rating` integer,
	`total` integer,
	`time` DATE,
	`kind` text
);
-- 已有数据库补充 kind 列（媒体大类 image/video/audio/file，供后台按类型渲染预览）：
-- ALTER TABLE imginfo ADD COLUMN kind TEXT;

