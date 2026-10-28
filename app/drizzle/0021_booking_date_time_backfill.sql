-- TP-0070: the demo seed wrote booking dates as "Apr 12, 2026" and times as
-- "3:00 PM". Every write path since stores YYYY-MM-DD dates (validated) and
-- HH:MM 24h times (<input type="time">), and date arithmetic on the old shape
-- crashed the Bookings page. Rewrite only rows that match the seed's exact
-- shape; anything else is left alone — we never guess at free text.
UPDATE "hotel_booking" SET "check_in_date" = to_char(to_date("check_in_date", 'Mon DD, YYYY'), 'YYYY-MM-DD')
WHERE "check_in_date" ~ '^[A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4}$';--> statement-breakpoint
UPDATE "hotel_booking" SET "check_out_date" = to_char(to_date("check_out_date", 'Mon DD, YYYY'), 'YYYY-MM-DD')
WHERE "check_out_date" ~ '^[A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4}$';--> statement-breakpoint
UPDATE "transport_booking" SET "from_date" = to_char(to_date("from_date", 'Mon DD, YYYY'), 'YYYY-MM-DD')
WHERE "from_date" ~ '^[A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4}$';--> statement-breakpoint
UPDATE "transport_booking" SET "to_date" = to_char(to_date("to_date", 'Mon DD, YYYY'), 'YYYY-MM-DD')
WHERE "to_date" ~ '^[A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4}$';--> statement-breakpoint
UPDATE "hotel_booking" SET "check_in_time" = to_char(to_timestamp("check_in_time", 'HH12:MI AM'), 'HH24:MI')
WHERE "check_in_time" ~ '^(1[0-2]|0?[1-9]):[0-5][0-9] (AM|PM)$';--> statement-breakpoint
UPDATE "hotel_booking" SET "check_out_time" = to_char(to_timestamp("check_out_time", 'HH12:MI AM'), 'HH24:MI')
WHERE "check_out_time" ~ '^(1[0-2]|0?[1-9]):[0-5][0-9] (AM|PM)$';--> statement-breakpoint
UPDATE "transport_booking" SET "from_time" = to_char(to_timestamp("from_time", 'HH12:MI AM'), 'HH24:MI')
WHERE "from_time" ~ '^(1[0-2]|0?[1-9]):[0-5][0-9] (AM|PM)$';--> statement-breakpoint
UPDATE "transport_booking" SET "to_time" = to_char(to_timestamp("to_time", 'HH12:MI AM'), 'HH24:MI')
WHERE "to_time" ~ '^(1[0-2]|0?[1-9]):[0-5][0-9] (AM|PM)$';
