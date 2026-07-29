import { describe, expect, test } from 'bun:test';
import dayjs, { type Dayjs } from 'dayjs';
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
import { Model } from '../src/db/Model';

@Table('users')
class User extends Model<User.Data> {
  @Unique()
  @Column('text')
  accessor email!: string;

  @Column('text')
  accessor name!: string;
}

namespace User {
  export type Data = { email: string; name: string };
}

@Table('jobs')
@CompoundIndex(['userId', 'name'])
class Job extends Model<Job.Data> {
  @Relate(() => User as unknown as ModelClass, { onDelete: 'cascade' })
  accessor userId!: string;

  @Index()
  @Column('integer', { mode: 'timestamp_ms' })
  accessor scheduledAt!: Dayjs;

  @PrimaryKey()
  @Column('text')
  accessor slug!: string;

  @Column('text')
  accessor name!: string;
}

namespace Job {
  export type Data = { userId: string; scheduledAt: Date; slug: string; name: string };
}

const now = new Date();

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
    expect(meta.indexes.some((i) => i.properties.length === 1 && i.properties[0] === 'scheduledAt')).toBe(true);
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

  test('@Column/@Relateが付与したaccessorは実際にthis._dataを読み取る(staticではなくinstanceだから可能)', () => {
    const user = new User({ id: 'u1', createdAt: now, updatedAt: now, email: 'a@example.com', name: 'Taro' });
    expect(user.email).toBe('a@example.com');

    const job = new Job({
      id: 'j1',
      createdAt: now,
      updatedAt: now,
      userId: 'u1',
      scheduledAt: now,
      slug: 's',
      name: 'n',
    });
    expect(job.userId).toBe('u1');
  });

  test('直接代入は読み取り専用エラーでthrowする(値の変更はModelのset()/update()経由に統一するため)', () => {
    const user = new User({ id: 'u1', createdAt: now, updatedAt: now, email: 'a@example.com', name: 'Taro' });
    expect(() => {
      user.email = 'b@example.com';
    }).toThrow(/読み取り専用/);
    expect(user.email).toBe('a@example.com');
  });

  test('mode: timestamp_msのカラムはgetter越しにdayjsでラップされる', () => {
    const job = new Job({
      id: 'j1',
      createdAt: now,
      updatedAt: now,
      userId: 'u1',
      scheduledAt: now,
      slug: 's',
      name: 'n',
    });
    expect(dayjs.isDayjs(job.scheduledAt)).toBe(true);
    expect(job.scheduledAt.valueOf()).toBe(now.valueOf());
  });

  test('Model本体のcreatedAt/updatedAtもdayjsでラップされる', () => {
    const job = new Job({
      id: 'j1',
      createdAt: now,
      updatedAt: now,
      userId: 'u1',
      scheduledAt: now,
      slug: 's',
      name: 'n',
    });
    expect(dayjs.isDayjs(job.createdAt)).toBe(true);
    expect(dayjs.isDayjs(job.updatedAt)).toBe(true);
  });
});
