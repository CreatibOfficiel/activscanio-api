import { DeepPartial, FindManyOptions, FindOptionsWhere } from 'typeorm';

/**
 * Base repository interface defining standard CRUD operations
 * All domain repositories should implement this interface
 */
export interface IBaseRepository<T> {
  /**
   * Find all entities matching the given options
   * @param options - TypeORM find options (where, relations, order, etc.)
   * @returns Array of entities
   */
  findAll(options?: FindManyOptions<T>): Promise<T[]>;

  /**
   * Find a single entity by ID
   * @param id - Entity UUID
   * @param relations - Optional array of relation names to load
   * @returns Entity or null if not found
   */
  findOne(id: string, relations?: string[]): Promise<T | null>;

  /**
   * Find a single entity by custom conditions
   * @param where - Find conditions
   * @param relations - Optional array of relation names to load
   * @returns Entity or null if not found
   */
  findOneBy(
    where: FindOptionsWhere<T>,
    relations?: string[],
  ): Promise<T | null>;

  /**
   * Create a new entity instance (not persisted yet)
   * @param data - Partial entity data
   * @returns New entity instance
   */
  create(data: DeepPartial<T>): T;

  /**
   * Save an entity to the database
   * @param entity - Entity to save
   * @returns Saved entity
   */
  save(entity: T): Promise<T>;

  /**
   * Save multiple entities to the database
   * @param entities - Array of entities to save
   * @returns Saved entities
   */
  saveMany(entities: T[]): Promise<T[]>;

  /**
   * Update an entity by ID
   * @param id - Entity UUID
   * @param data - Partial entity data to update
   * @returns Updated entity
   */
  update(id: string, data: DeepPartial<T>): Promise<T>;

  /**
   * Delete an entity by ID
   * @param id - Entity UUID
   */
  delete(id: string): Promise<void>;

  /**
   * Count entities matching the given conditions
   * @param where - Optional find conditions
   * @returns Number of matching entities
   */
  count(where?: FindOptionsWhere<T>): Promise<number>;
}
