import { IsOptional, Matches } from "class-validator";

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class DriverTimelineDateDto {
  @IsOptional()
  @Matches(YMD_PATTERN)
  date?: string;
}
