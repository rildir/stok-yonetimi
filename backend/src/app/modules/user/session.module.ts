import { Module } from '@nestjs/common';
import { SessionService } from './session.service';

/** Refresh-token sessions (used by sign-in, registration and invitation acceptance). */
@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
