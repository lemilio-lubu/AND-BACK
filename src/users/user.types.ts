export enum UserRole {
  ADMIN = 'admin',
  EMPRESA = 'empresa',
  INFLUENCER = 'influencer',
}

export interface AppUser {
  id: string;
  role: UserRole;
  isNew: boolean;
  hasEmittedFirstInvoice: boolean;
}
