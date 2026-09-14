export interface DomainVerificationResult {
  verified: boolean;
  cnameMatches: boolean;
  txtMatches: boolean;
  detectedCnames: string[];
  detectedTxts: string[];
  expectedCname: string;
  expectedTxt: string;
  failureReason?: string;
}

export interface SslProvisioningResult {
  sslStatus: 'ACTIVE' | 'PENDING' | 'FAILED';
  certificateId?: string;
  issuedAt?: string;
  expiresAt?: string;
  error?: string;
}

export interface IDomainInfrastructureProvider {
  verifyDns(domain: string, verificationToken: string): Promise<DomainVerificationResult>;
  provisionSsl(domain: string): Promise<SslProvisioningResult>;
  checkSslStatus(domain: string): Promise<SslProvisioningResult>;
  removeCustomHostname(domain: string): Promise<boolean>;
}
