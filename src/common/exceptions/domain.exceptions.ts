import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base domain exception class
 * All domain-specific exceptions should extend this class
 */
export abstract class DomainException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus,
    public readonly code?: string,
    public readonly details?: Record<string, any>,
  ) {
    super(
      {
        statusCode: status,
        message,
        code,
        details,
        timestamp: new Date().toISOString(),
      },
      status,
    );
  }
}

/**
 * Thrown when a requested entity is not found
 */
export class EntityNotFoundException extends DomainException {
  constructor(entityName: string, identifier: string | Record<string, any>) {
    const identifierStr =
      typeof identifier === 'string'
        ? identifier
        : JSON.stringify(identifier);

    super(
      `${entityName} with identifier ${identifierStr} not found`,
      HttpStatus.NOT_FOUND,
      'ENTITY_NOT_FOUND',
      { entityName, identifier },
    );
  }
}

/**
 * Competitor-specific exceptions
 */
export class CompetitorNotFoundException extends EntityNotFoundException {
  constructor(identifier: string) {
    super('Competitor', identifier);
  }
}

export class CompetitorAlreadyExistsException extends DomainException {
  constructor(characterVariantId: string) {
    super(
      `Competitor with character variant ${characterVariantId} already exists`,
      HttpStatus.CONFLICT,
      'COMPETITOR_ALREADY_EXISTS',
      { characterVariantId },
    );
  }
}

/**
 * Betting-specific exceptions
 */
export class BettingWeekNotFoundException extends EntityNotFoundException {
  constructor(identifier: string | { year: number; weekNumber: number }) {
    super('BettingWeek', identifier);
  }
}

export class BettingWeekClosedException extends DomainException {
  constructor(weekId: string) {
    super(
      `Betting week ${weekId} is closed and cannot accept new bets`,
      HttpStatus.BAD_REQUEST,
      'BETTING_WEEK_CLOSED',
      { weekId },
    );
  }
}

export class BetNotFoundException extends EntityNotFoundException {
  constructor(identifier: string) {
    super('Bet', identifier);
  }
}

export class BetAlreadyExistsException extends DomainException {
  constructor(userId: string, weekId: string) {
    super(
      `User ${userId} already has a bet for week ${weekId}`,
      HttpStatus.CONFLICT,
      'BET_ALREADY_EXISTS',
      { userId, weekId },
    );
  }
}

export class InvalidBetException extends DomainException {
  constructor(reason: string, details?: Record<string, any>) {
    super(
      `Invalid bet: ${reason}`,
      HttpStatus.BAD_REQUEST,
      'INVALID_BET',
      details,
    );
  }
}

export class InvalidPodiumException extends DomainException {
  constructor(reason: string) {
    super(
      `Invalid podium configuration: ${reason}`,
      HttpStatus.BAD_REQUEST,
      'INVALID_PODIUM',
      { reason },
    );
  }
}

/**
 * Race-specific exceptions
 */
export class RaceEventNotFoundException extends EntityNotFoundException {
  constructor(identifier: string) {
    super('RaceEvent', identifier);
  }
}

export class RaceResultNotFoundException extends EntityNotFoundException {
  constructor(identifier: string) {
    super('RaceResult', identifier);
  }
}

export class InvalidRaceDataException extends DomainException {
  constructor(reason: string, details?: Record<string, any>) {
    super(
      `Invalid race data: ${reason}`,
      HttpStatus.BAD_REQUEST,
      'INVALID_RACE_DATA',
      details,
    );
  }
}

/**
 * User-specific exceptions
 */
export class UserNotFoundException extends EntityNotFoundException {
  constructor(identifier: string) {
    super('User', identifier);
  }
}

export class UserAlreadyExistsException extends DomainException {
  constructor(clerkId: string) {
    super(
      `User with Clerk ID ${clerkId} already exists`,
      HttpStatus.CONFLICT,
      'USER_ALREADY_EXISTS',
      { clerkId },
    );
  }
}

/**
 * Task-specific exceptions
 */
export class TaskNotFoundException extends EntityNotFoundException {
  constructor(identifier: string) {
    super('Task', identifier);
  }
}

export class TaskAlreadyRunningException extends DomainException {
  constructor(taskType: string) {
    super(
      `Task of type ${taskType} is already running`,
      HttpStatus.CONFLICT,
      'TASK_ALREADY_RUNNING',
      { taskType },
    );
  }
}

/**
 * Business logic exceptions
 */
export class InsufficientDataException extends DomainException {
  constructor(operation: string, reason: string) {
    super(
      `Cannot perform ${operation}: ${reason}`,
      HttpStatus.BAD_REQUEST,
      'INSUFFICIENT_DATA',
      { operation, reason },
    );
  }
}

export class CalculationException extends DomainException {
  constructor(calculationType: string, reason: string, details?: Record<string, any>) {
    super(
      `${calculationType} calculation failed: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'CALCULATION_FAILED',
      { calculationType, reason, ...details },
    );
  }
}

export class ValidationException extends DomainException {
  constructor(field: string, reason: string) {
    super(
      `Validation failed for ${field}: ${reason}`,
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED',
      { field, reason },
    );
  }
}
