export enum UserRole {
  EMPRESA = 'empresa',
  INFLUENCER = 'influencer',
}

export class User {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}
