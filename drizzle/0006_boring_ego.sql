CREATE TABLE `round_marks` (
	`wheelId` int NOT NULL,
	`kind` enum('veto','vote','dietary') NOT NULL,
	`refId` int NOT NULL,
	`userId` int NOT NULL,
	CONSTRAINT `round_marks_wheelId_kind_refId_userId_pk` PRIMARY KEY(`wheelId`,`kind`,`refId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `wheel_presence` (
	`wheelId` int NOT NULL,
	`userId` int NOT NULL,
	`name` text,
	`lastSeen` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wheel_presence_wheelId_userId_pk` PRIMARY KEY(`wheelId`,`userId`)
);
