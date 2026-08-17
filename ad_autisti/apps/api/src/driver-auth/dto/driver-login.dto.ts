import { IsBoolean, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

export class DriverLoginDto {
  @ValidateIf((dto: DriverLoginDto) => !dto.email?.trim())
  @IsString()
  @MinLength(1)
  code?: string;

  @ValidateIf((dto: DriverLoginDto) => !dto.code?.trim())
  @IsString()
  @MinLength(1)
  email?: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
