import { IsBoolean, IsIn, IsInt, IsOptional, Matches, Min } from "class-validator";
import { Transform } from "class-transformer";
import type { CustomerActivityOrderBy, CustomerActivityOrderDirection } from "@adam/types";
import { CUSTOMER_ACTIVITY_ORDER_BY_VALUES, CUSTOMER_ACTIVITY_ORDER_DIRECTION_VALUES, optionalQueryBoolean } from "./customer-today-activities.dto";

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CustomerCalendarActivitiesDto {
  @IsOptional()
  @Transform(({ value }) => optionalQueryBoolean(value))
  @IsBoolean()
  includeNoShow?: boolean;

  @IsInt()
  @Min(1)
  languageId!: number;

  @Matches(YMD_PATTERN)
  startDate!: string;

  @Matches(YMD_PATTERN)
  endDate!: string;

  @IsIn(CUSTOMER_ACTIVITY_ORDER_BY_VALUES)
  orderBy!: CustomerActivityOrderBy;

  @IsIn(CUSTOMER_ACTIVITY_ORDER_DIRECTION_VALUES)
  orderDirection!: CustomerActivityOrderDirection;
}
