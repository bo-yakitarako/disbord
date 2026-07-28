import { describe, expect, test } from 'bun:test';
import {
  Column,
  CompoundIndex,
  Index,
  PrimaryKey,
  readModelMeta,
  Relate,
  Table,
  Unique,
  type ModelClass,
} from '../src/db/decorators';

@Table('users')
class User {
  @Unique()
  @Column('text')
  static accessor email: string;

  @Column('text')
  static accessor name: string;
}

@Table('jobs')
@CompoundIndex(['userId', 'name'])
class Job {
  @Relate(() => User as unknown as ModelClass, { onDelete: 'cascade' })
  static accessor userId: string;

  @Index()
  @Column('integer', { mode: 'timestamp_ms' })
  static accessor createdAt: Date;

  @PrimaryKey()
  @Column('text')
  static accessor slug: string;
}

describe('decorators', () => {
  test('@Tableがクラスに_tableNameを設定する', () => {
    expect((User as unknown as { _tableName: string })._tableName).toBe('users');
  });

  test('@Column/@Uniqueで宣言したカラムがcolumns/uniquesに反映される', () => {
    const meta = readModelMeta(User as unknown as ModelClass);
    expect(meta.tableName).toBe('users');
    expect(meta.columns).toEqual([
      { property: 'email', type: 'text', options: {} },
      { property: 'name', type: 'text', options: {} },
    ]);
    expect(meta.uniques).toEqual([{ properties: ['email'], name: undefined }]);
  });

  test('@Relateはcolumnsに現れずrelatesにだけ登録される', () => {
    const meta = readModelMeta(Job as unknown as ModelClass);
    expect(meta.columns.some((c) => c.property === 'userId')).toBe(false);
    expect(meta.relates).toHaveLength(1);
    expect(meta.relates[0]!.property).toBe('userId');
    expect(meta.relates[0]!.options.onDelete).toBe('cascade');
    expect(meta.relates[0]!.target()).toBe(User as unknown as ModelClass);
  });

  test('@Indexは単一カラムのindexesに登録される', () => {
    const meta = readModelMeta(Job as unknown as ModelClass);
    expect(meta.indexes.some((i) => i.properties.length === 1 && i.properties[0] === 'createdAt')).toBe(true);
  });

  test('@CompoundIndexはクラスデコレータとして複数カラムのindexesに登録される', () => {
    const meta = readModelMeta(Job as unknown as ModelClass);
    expect(meta.indexes.some((i) => i.properties.length === 2)).toBe(true);
    const compound = meta.indexes.find((i) => i.properties.length === 2)!;
    expect(compound.properties).toEqual(['userId', 'name']);
  });

  test('@PrimaryKeyはprimaryKeysに登録される', () => {
    const meta = readModelMeta(Job as unknown as ModelClass);
    expect(meta.primaryKeys).toEqual(['slug']);
  });

  test('@Tableが付いていないクラスをreadModelMetaに渡すとthrow', () => {
    class Untagged {}
    expect(() => readModelMeta(Untagged as unknown as ModelClass)).toThrow(/@Table/);
  });
});
