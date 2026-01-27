import { Logger } from '@nestjs/common';
import {
  DeepPartial,
  FindManyOptions,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { IBaseRepository } from './base.repository.interface';

/**
 * Abstract base repository providing standard CRUD operations
 * All domain repositories should extend this class
 *
 * Benefits:
 * - Consistent data access interface across all repositories
 * - Centralized error handling and logging
 * - Easier testing with mock repositories
 * - Abstracts TypeORM implementation details
 */
export abstract class BaseRepository<T extends ObjectLiteral>
  implements IBaseRepository<T>
{
  protected readonly logger: Logger;

  constructor(
    public readonly repository: Repository<T>,
    protected readonly entityName: string,
  ) {
    this.logger = new Logger(`${entityName}Repository`);
  }

  async findAll(options?: FindManyOptions<T>): Promise<T[]> {
    try {
      return await this.repository.find(options);
    } catch (error) {
      this.logger.error(
        `Error finding all ${this.entityName}:`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async findOne(id: string, relations?: string[]): Promise<T | null> {
    try {
      return await this.repository.findOne({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: { id } as any,
        relations,
      });
    } catch (error) {
      this.logger.error(
        `Error finding ${this.entityName} with ID ${id}:`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async findOneBy(
    where: FindOptionsWhere<T>,
    relations?: string[],
  ): Promise<T | null> {
    try {
      return await this.repository.findOne({ where, relations });
    } catch (error) {
      this.logger.error(
        `Error finding ${this.entityName} by condition:`,
        error instanceof Error ? error.stack : undefined,
        { where },
      );
      throw error;
    }
  }

  create(data: DeepPartial<T>): T {
    try {
      return this.repository.create(data);
    } catch (error) {
      this.logger.error(
        `Error creating ${this.entityName} instance:`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async save(entity: T): Promise<T> {
    try {
      const saved = await this.repository.save(entity);
      this.logger.log(`${this.entityName} saved successfully`);
      return saved;
    } catch (error) {
      this.logger.error(
        `Error saving ${this.entityName}:`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async saveMany(entities: T[]): Promise<T[]> {
    try {
      const saved = await this.repository.save(entities);
      this.logger.log(
        `${entities.length} ${this.entityName} entities saved successfully`,
      );
      return saved;
    } catch (error) {
      this.logger.error(
        `Error saving multiple ${this.entityName}:`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async update(id: string, data: DeepPartial<T>): Promise<T> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await this.repository.update(id, data as any);
      const updated = await this.findOne(id);
      if (!updated) {
        throw new Error(
          `${this.entityName} with ID ${id} not found after update`,
        );
      }
      this.logger.log(`${this.entityName} with ID ${id} updated successfully`);
      return updated;
    } catch (error) {
      this.logger.error(
        `Error updating ${this.entityName} with ID ${id}:`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.repository.delete(id);
      this.logger.log(`${this.entityName} with ID ${id} deleted successfully`);
    } catch (error) {
      this.logger.error(
        `Error deleting ${this.entityName} with ID ${id}:`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    try {
      return await this.repository.count({ where });
    } catch (error) {
      this.logger.error(
        `Error counting ${this.entityName}:`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
