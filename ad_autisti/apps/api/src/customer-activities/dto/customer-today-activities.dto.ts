import { IsBoolean, IsIn, IsInt, IsOptional, Min } from "class-validator";
import { Transform } from "class-transformer";
import type { CustomerActivityOrderBy, CustomerActivityOrderDirection } from "@adam/types";

export const CUSTOMER_ACTIVITY_ORDER_BY_VALUES: CustomerActivityOrderBy[] = [
  "id",
  "checkout",
  "checkoutTime",
  "checkin",
  "checkinTime",
  "cleaned",
  "closed",
  "sequence",
  "todayStatusNameFrontend",
  "updatedAt",
];

export const CUSTOMER_ACTIVITY_ORDER_DIRECTION_VALUES: CustomerActivityOrderDirection[] = ["asc", "desc"];

export function optionalQueryBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return value;
}

export class CustomerTodayActivitiesDto {
  @IsOptional()
  @Transform(({ value }) => optionalQueryBoolean(value))
  @IsBoolean()
  includeNoShow?: boolean;

  @IsInt()
  @Min(1)
  languageId!: number;

  @IsIn(CUSTOMER_ACTIVITY_ORDER_BY_VALUES)
  orderBy!: CustomerActivityOrderBy;

  @IsIn(CUSTOMER_ACTIVITY_ORDER_DIRECTION_VALUES)
  orderDirection!: CustomerActivityOrderDirection;
}
