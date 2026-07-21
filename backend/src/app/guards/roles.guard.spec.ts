import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflectorMock: any;

  beforeEach(async () => {
    reflectorMock = {
      getAllAndOverride: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        { provide: Reflector, useValue: reflectorMock },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access if no roles are required', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(undefined);

    const contextMock: any = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    };

    expect(guard.canActivate(contextMock)).toBe(true);
  });

  it('should allow access if user has required role', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(['admin', 'manager']);

    const contextMock: any = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: { role: 'admin' } }),
      }),
    };

    expect(guard.canActivate(contextMock)).toBe(true);
  });

  it('should throw ForbiddenException if user lacks required role', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(['admin']);

    const contextMock: any = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: { role: 'viewer' } }),
      }),
    };

    expect(() => guard.canActivate(contextMock)).toThrow(ForbiddenException);
  });
});
