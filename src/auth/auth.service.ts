import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '../users/user.entity';

@Injectable()
export class AuthService {
  private users: User[] = []; // mock temporal

  constructor(private jwtService: JwtService) {}

  async register(email: string, password: string, role: UserRole) {
    const hashedPassword = await bcrypt.hash(password, 10);

    const user: User = {
      id: crypto.randomUUID(),
      email,
      password: hashedPassword,
      role,
      isActive: true,
    };

    this.users.push(user);

    return this.signToken(user);
  }

  async login(email: string, password: string) {
    const user = this.users.find(u => u.email === email);

    if (!user) throw new UnauthorizedException();

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new UnauthorizedException();

    return this.signToken(user);
  }

  private signToken(user: User) {
    const payload = {
      sub: user.id,
      role: user.role,
      email: user.email,
    };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
