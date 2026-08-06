import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class DriverFinishStopParamsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  timelineId!: number;
}
