export enum UserRole {
  ADMIN = 'admin',          // control total del sistema
  EMPRESA = 'empresa',      // clientes que facturan
  INFLUENCER = 'influencer' // solo registro + datos
}

export class User {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}
