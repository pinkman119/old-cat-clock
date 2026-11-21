import { IsString, Length } from 'class-validator';

export class CreateLoveNoteDto {
  @IsString()
  @Length(1, 120)
  content!: string;
}

export class UpdateLoveNoteDto {
  @IsString()
  @Length(1, 120)
  content!: string;
}
