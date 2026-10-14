import { UserEntity } from '../entities/user.entity';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  companyId: string;
  tokenVersion: number;
}

export function buildJwtPayload(user: UserEntity): JwtPayload {
  return {
    sub: user.id,
    username: user.username,
    role: user.role,
    companyId: user.companyId,
    tokenVersion: user.tokenVersion,
  };
}
