import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class AddCustomDomainDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(?!:\/\/)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/, {
    message: 'Must be a valid fully qualified domain name (FQDN), e.g. portal.greenfield.edu.ng',
  })
  domain!: string;
}
