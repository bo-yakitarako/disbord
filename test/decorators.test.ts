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
class User extends Model {
  @Unique()
  @Column('text')
  accessor email!: string;

  @Column('text')
  accessor name!: string;
}

@Table('jobs')
@CompoundIndex(['userId', 'name'])
class Job extends Model {
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

const now = new Date();

@Table('reminders')
class Reminder extends Model {
  @Column('text', { default: 'pending' })
  accessor status!: string;

  @Column('integer', { mode: 'boolean', default: true })
  accessor archived!: boolean;

  @Column('integer', { mode: 'timestamp_ms', default: 'now' })
  accessor firedAt!: Dayjs;

  @Column('integer', { mode: 'timestamp_ms', default: dayjs() })
  accessor remindAt!: Dayjs;

  // @ts-expect-error timestamp_msのdefaultはDayjs指定(生のDateは不可)
  @Column('integer', { mode: 'timestamp_ms', default: now })
  accessor bad0!: Dayjs;

  // @ts-expect-error text列のdefaultはstringのみ(numberは不可)
  @Column('text', { default: 123 })
  accessor bad1!: string;

  // @ts-expect-error mode: 'boolean'列のdefaultはbooleanのみ(stringは不可)
  @Column('integer', { mode: 'boolean', default: 'yes' })
  accessor bad2!: boolean;

  // @ts-expect-error 'now'はmode: 'timestamp_ms'限定(mode: 'number'では不可)
  @Column('integer', { mode: 'number', default: 'now' })
  accessor bad3!: number;

  // @ts-expect-error 'now'はmode: 'timestamp_ms'限定(realカラムでは不可)
  @Column('real', { default: 'now' })
  accessor bad4!: number;

  // @ts-expect-error enumはtext列限定(integer列では不可)
  @Column('integer', { enum: ['a', 'b'] })
  accessor bad5!: string;
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

  test('@Columnのdefaultはtype/modeごとに型付けされ、指定した値がそのままmetadataに残る(型安全性は@ts-expect-errorで固定済み)', () => {
    const meta = readModelMeta(Reminder as unknown as ModelClass);
    const byProperty = Object.fromEntries(meta.columns.map((c) => [c.property, c.options.default]));
    expect(byProperty.status).toBe('pending');
    expect(byProperty.archived).toBe(true);
    expect(byProperty.firedAt).toBe('now');
  });
});
