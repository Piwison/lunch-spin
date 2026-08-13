CREATE INDEX `notifications_wheel_created_idx` ON `notifications` (`wheelId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `restaurant_tags_restaurant_idx` ON `restaurant_tags` (`restaurantId`);--> statement-breakpoint
CREATE INDEX `restaurant_tags_tag_idx` ON `restaurant_tags` (`tagId`);--> statement-breakpoint
CREATE INDEX `restaurants_wheel_idx` ON `restaurants` (`wheelId`);--> statement-breakpoint
CREATE INDEX `spin_history_wheel_spun_at_idx` ON `spin_history` (`wheelId`,`spunAt`);--> statement-breakpoint
CREATE INDEX `spin_history_restaurant_idx` ON `spin_history` (`restaurantId`);--> statement-breakpoint
CREATE INDEX `tags_wheel_idx` ON `tags` (`wheelId`);--> statement-breakpoint
CREATE INDEX `wheel_members_wheel_user_idx` ON `wheel_members` (`wheelId`,`userId`);--> statement-breakpoint
CREATE INDEX `wheel_members_user_idx` ON `wheel_members` (`userId`);--> statement-breakpoint
CREATE INDEX `wheels_owner_idx` ON `wheels` (`ownerId`);--> statement-breakpoint
CREATE INDEX `wheels_invite_token_idx` ON `wheels` (`inviteToken`);