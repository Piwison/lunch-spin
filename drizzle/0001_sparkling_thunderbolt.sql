CREATE TABLE `restaurant_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`tagId` int NOT NULL,
	CONSTRAINT `restaurant_tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `restaurants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`wheelId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`notes` text,
	`addedBy` int NOT NULL,
	`primaryTagId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spin_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`wheelId` int NOT NULL,
	`restaurantId` int NOT NULL,
	`spunBy` int NOT NULL,
	`spunAt` timestamp NOT NULL DEFAULT (now()),
	`manuallyReenabled` boolean NOT NULL DEFAULT false,
	CONSTRAINT `spin_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`category` enum('cuisine','food_type','custom') NOT NULL,
	`color` varchar(32) NOT NULL DEFAULT '#6366f1',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wheel_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`wheelId` int NOT NULL,
	`userId` int NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wheel_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wheels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`ownerId` int NOT NULL,
	`isShared` boolean NOT NULL DEFAULT false,
	`isPublic` boolean NOT NULL DEFAULT false,
	`inviteToken` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wheels_id` PRIMARY KEY(`id`)
);
